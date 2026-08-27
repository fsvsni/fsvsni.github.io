---
title: "系列一·第13篇 RAG 主流程：提问到流式回答的 8 个阶段"
date: 2026-08-27 18:00:00
tags:
  - RAG
  - Pipeline
  - 主流程
categories:
  - 企业知识库 RAG
---

> 对应课件：第 10 讲 RAG Pipeline 主流程深度解析
> 本篇目标：把企业知识库的**RAG 主流程（8 个 Stage）**讲透——从员工提问到流式回答，每一步做什么、缓存怎么设计、信息不足怎么处理。

## 一、Pipeline vs Chain

| 概念 | 说明 |
|---|---|
| **Chain** | 简单的线性调用链（A→B→C） |
| **Pipeline** | 有状态、有分支、有事件的多阶段流水线 |

企业知识库的问答不是简单链式调用，需要**分支、缓存、事件、诊断**，所以用 Pipeline（8 个 Stage）。

## 二、8 个 Stage 主流程总览

```
Stage 0: 预处理（历史加载、会话状态）
Stage 1: 查询路由（FAQ 精确命中 / 意图路由）
Stage 2: 检索计划 + 改写（如需）
Stage 3: 混合检索（Dense + BM25 + 过滤）
Stage 4: 重排（Reranker）
Stage 5: 上下文构建（筛选 + 格式化）
Stage 6: Prompt 选择 + LLM 生成（流式）
Stage 7: 后处理（引用增强、信息不足判定、事件输出）
```

```
员工提问
  ↓ Stage 0 历史加载（MySQL）
  ↓ Stage 1 FAQ精确命中？→ 是则直出
  ↓ Stage 2 改写 + 检索计划
  ↓ Stage 3 混合检索
  ↓ Stage 4 Reranker 重排
  ↓ Stage 5 上下文构建
  ↓ Stage 6 LLM 流式生成
  ↓ Stage 7 引用增强 + 事件输出
```

## 三、V1 三级缓存设计

缓存大幅降低重复提问的成本：

| 缓存层 | 缓存什么 | 说明 |
|---|---|---|
| **查询 Embedding** | 相同问题 → 相同向量 | 避免重复 embed |
| **FAQ/Doc 检索结果** | 相同查询 → 相同召回 | 避免重复检索 |
| **版本激活** | 版本切换 → 缓存失效 | 保证检索到新版本 |

### 缓存如何失效

```python
# qa_core/governance/kb_versions.py
def activate_version(kb_version):
    # 激活新版本 → 使相关缓存失效
    cache.invalidate_namespace(kb_version.scenario_id)
    # 下次检索强制走新版本
```

> 制度更新（新版本激活）后，必须让旧缓存失效，否则员工还会查到旧制度。这是企业知识库**准确性的关键**。

## 四、Stage 1：查询路由 + FAQ 精确命中

### 4.1 FAQ 精确命中为什么放在路由层

高频问题（"入职流程有哪些步骤"）如果每次都走完整 RAG，浪费算力且可能答不准。**FAQ 精确命中**放在最前面，直接返回标准答案：

```python
# qa_core/pipeline/steps.py
def _exact_faq_answer(query, scenario):
    hit = faq_store.exact_match(query)   # 精确匹配 FAQ
    if hit:
        return FAQAnswer(hit.answer, hit.citations)
    return None
```

### 4.2 FAQ 精确路由 vs FAQ 标准直出

| 概念 | 触发 | 行为 |
|---|---|---|
| **FAQ 精确路由** | 问题几乎完全匹配 FAQ | 直接返回标准答案，不走 RAG |
| **FAQ 标准直出** | 命中 FAQ 相关但不精确 | 检索 FAQ 作为候选，走重排生成 |

> FAQ 快速探测未命中后，候选可复用（不重复检索），作为后续检索的初选集。

## 五、Stage 5：上下文构建

### 5.1 select_context_docs() 的筛选策略

检索返回的文档不能全塞给 LLM，要**筛选**：

```python
# qa_core/pipeline/context.py
def select_context_docs(docs, max_chars=4000):
    selected = []
    total = 0
    for doc in sorted(docs, key=lambda d: -d.score):
        if total + len(doc.page_content) > max_chars:
            break            # 超出窗口预算
        selected.append(doc)
        total += len(doc.page_content)
    return selected
```

**筛选原则**：分数优先 + 总长度预算（控制 token 成本，避免超出上下文窗口）。

### 5.2 build_context() 的格式化输出

```python
def build_context(docs):
    parts = []
    for i, doc in enumerate(docs, 1):
        parts.append(f"[文档{i}] 来源:{doc.metadata['source']}\n{doc.page_content}")
    return "\n\n".join(parts)
```

> 给每个文档编号 + 标注来源，LLM 回答时可引用（"根据文档2..."）。

## 六、信息不足处理

### 6.1 什么情况判定为信息不足

```python
# qa_core/pipeline/steps.py
def is_insufficient(context_docs, query, llm):
    # 上下文为空
    if not context_docs:
        return True
    # 检索分数过低
    if max(d.score for d in context_docs) < MIN_SCORE:
        return True
    # LLM 判断检索内容与问题无关
    return llm_judge.is_irrelevant(query, context_docs)
```

### 6.2 最终答案置信度 answer_confidence

```python
answer_confidence = f(len(context_docs), max_score, llm_judge_result)
```

- 高置信度 → 正常回答
- 低置信度 → 明确说"知识库中没有找到相关内容"，不硬编

### 6.3 信息不足的答案

> 知识库里暂时没有关于"XX"的资料。你可以尝试：换个关键词提问，或联系 IT/HR 补充资料。

**设计原则**：宁可承认不知道，也不编造。这是企业场景的底线（幻觉是最不能接受的）。

## 七、答案引用增强

### 7.1 什么是引用增强

回答中的关键句，标注来源文档：

```
回答：入职需要准备身份证、学历证明、体检报告。
[引用：hr-入职材料清单（文档2）]
```

```python
# qa_core/pipeline/citations.py
def attach_citations(answer, context_docs):
    # 分析回答中哪些内容来自哪些文档，生成引用
    citations = link_answer_to_docs(answer, context_docs)
    return {"answer": answer, "citations": citations}
```

> **可溯源**是 RAG 的核心价值，员工可以点开原始制度确认。

## 八、性能追踪

### 阶段计时

```python
# qa_core/pipeline/runtime.py
with timer("retrieval"):
    docs = retriever.search(...)
# 每个阶段的耗时记录到事件/trace，便于性能分析
```

> 哪个阶段慢（检索？生成？）通过阶段计时一目了然，配合第 22 篇可观测。

## 九、流式事件协议

### 9.1 事件驱动的问答模型

```
后端 Pipeline 每完成一个阶段，产出一个事件 → 前端实时展示
```

### 9.2 五种事件类型

| 事件 | 前端表现 |
|---|---|
| `status` | "检索中..." "生成中..." |
| `candidate` | 展示检索到的制度片段 |
| `token` | 流式逐字输出答案 |
| `citation` | 展示引用来源 |
| `done` | 结束 |

### 9.3 前端如何消费事件

```js
// 前端 WebSocket 收到事件
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  switch (event.type) {
    case "token": appendText(event.content); break;
    case "citation": showSources(event.sources); break;
    case "done": stopLoading(); break;
  }
};
```

## 十、企业知识库场景的主流程示例

```
"报销超5000谁审批"
  → Stage0 历史加载
  → Stage1 FAQ未命中 → 进入主链路
  → Stage2 改写(完整) + 检索计划(文档优先+费用参数)
  → Stage3 混合检索(source=finance, active版本)
  → Stage4 Reranker 精排
  → Stage5 上下文构建(费用制度片段)
  → Stage6 费用类Prompt + LLM流式
  → Stage7 引用增强 → "根据财务制度：报销超5000需总经理审批（引用：财务报销规定.docx）"
```

---

**本篇小结**：8 个 Stage 是 RAG 主流程的骨架，三级缓存降成本、FAQ 精确命中提速、信息不足兜底防幻觉、引用增强保溯源。下一篇讲 Prompt 工程。
