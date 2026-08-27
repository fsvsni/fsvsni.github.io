---
title: "系列二·第13篇 RAG 主流程：从告警提问到流式处理方案"
date: 2026-08-27 22:00:00
tags:
  - RAG
  - Pipeline
categories:
  - 设备运维 RAG
---

> 对应课件：第 10 讲 RAG Pipeline 主流程深度解析
> 本篇目标：从**设备运维**视角讲 RAG 主流程的 8 个 Stage——巡检员从提问到拿到处理方案，中间每一步做什么、缓存怎么设计、信息不足怎么兜底。

## 一、8 个 Stage 总览（运维版）

```
Stage 0: 预处理（历史加载、会话状态）
Stage 1: 查询路由（FAQ 精确命中 / 意图路由到四链路）
Stage 2: 检索计划 + 改写（如需）
Stage 3: 混合检索（按 source/设备/故障码过滤）
Stage 4: 重排（Reranker）
Stage 5: 上下文构建（筛选 + 格式化）
Stage 6: Prompt 选择 + LLM 生成（流式）
Stage 7: 后处理（引用增强、信息不足判定、事件输出）
```

```
巡检员："日检异常怎么升级"
  → Stage0 历史加载
  → Stage1 FAQ命中？→ 无 → 路由到告警链路
  → Stage2 改写(完整) + 检索计划(alarm+inspection)
  → Stage3 混合检索
  → Stage4 Reranker 精排
  → Stage5 上下文构建
  → Stage6 告警升级模板 + LLM 流式
  → Stage7 引用 + 事件输出
```

## 二、三级缓存（运维版）

| 缓存层 | 缓存什么 | 运维意义 |
|---|---|---|
| **查询 Embedding** | 相同问题 → 相同向量 | 省重复向量化 |
| **检索结果** | 相同查询 → 相同召回 | 省重复检索（告警高频问题） |
| **版本激活** | 版本切换 → 失效 | 保证检索到新版 SOP |

> 告警问题可能被多人重复咨询，检索缓存大幅降负载。**版本激活必须失效缓存**：SOP 更新后不能还查旧版。

## 三、Stage 1：FAQ 精确命中

高频运维问题（"巡检项有哪些"）直接命中 FAQ，不走完整 RAG：

```python
def _exact_faq_answer(query, scenario):
    hit = faq_store.exact_match(query)
    if hit:
        return FAQAnswer(hit.answer, hit.citations)
    return None
```

> FAQ 未命中时，候选可复用为后续检索初选集，不重复检索。

## 四、Stage 5：上下文构建

### 4.1 筛选

```python
def select_context_docs(docs, max_chars=4000):
    selected = []
    total = 0
    for doc in sorted(docs, key=lambda d: -d.score):
        if total + len(doc.page_content) > max_chars:
            break
        selected.append(doc)
        total += len(doc.page_content)
    return selected
```

> 分数优先 + 长度预算。运维处理步骤不能太长超出窗口。

### 4.2 格式化

```python
def build_context(docs):
    parts = []
    for i, doc in enumerate(docs, 1):
        parts.append(f"[文档{i}] 来源:{doc.metadata['source']} 设备:{doc.metadata.get('device_id','-')}\n{doc.page_content}")
    return "\n\n".join(parts)
```

> 标注来源 + 设备编号，LLM 回答可引用"根据文档2（空压机维护手册）"。

## 五、信息不足处理

### 5.1 判定

```python
def is_insufficient(context_docs, query, llm):
    if not context_docs:
        return True
    if max(d.score for d in context_docs) < MIN_SCORE:
        return True
    return llm_judge.is_irrelevant(query, context_docs)
```

### 5.2 运维场景的兜底话术

> 知识库中暂时没有关于"XX故障"的处理资料。建议：1)联系设备厂商技术支持；2)查看设备纸质手册；3)拨打维修热线。

**重要**：设备运维**绝不能编造处理步骤**（编错 = 安全事故）。信息不足必须明说。

## 六、答案引用增强

```python
def attach_citations(answer, context_docs):
    citations = link_answer_to_docs(answer, context_docs)
    return {"answer": answer, "citations": citations}
```

> 处理步骤标注来源（哪份 SOP/手册），工程师可点开核对原文。

## 七、性能追踪

```python
with timer("retrieval"):
    docs = retriever.search(...)
with timer("generate_first_token"):
    ...
# 各阶段耗时进 trace，定位瓶颈
```

> 告警咨询延迟高 → 看是检索慢还是 LLM 首 token 慢。

## 八、设备运维场景的主流程示例

```
"P0 告警：空压机超压"
  → Stage0 历史加载
  → Stage1 FAQ未命中 → 告警链路
  → Stage2 改写 + 检索计划(alarm P0)
  → Stage3 混合检索(过滤source=alarm, alarm_level=P0)
  → Stage4 Reranker 精排
  → Stage5 上下文构建(P0告警SOP)
  → Stage6 高危告警模板 + LLM流式
  → Stage7 引用 → "立即停机检查，按P0流程上报（引用：告警处理SOP P0节）"
```

---

**本篇小结**：8 个 Stage 是运维问答主流程的骨架。FAQ 命中提速、缓存降载、信息不足明说（不编造）、引用可溯源。下一篇讲 Prompt 工程。
