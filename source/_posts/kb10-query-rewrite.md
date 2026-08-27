---
title: "系列一·第10篇 查询改写与变体：多轮追问怎么处理"
date: 2026-08-27 17:30:00
tags:
  - RAG
  - 查询改写
  - 多轮对话
categories:
  - 企业知识库 RAG
---

> 对应课件：第 7 讲 查询改写与变体生成
> 本篇目标：讲清企业知识库的**多轮对话处理**——员工追问"那审批呢"时，系统如何把指代消解成完整问题，再如何生成查询变体提高召回。

## 一、为什么追问需要特殊处理

员工不会每次都问完整问题：

- 第一问："报销流程是什么？"
- 追问："那发票呢？"（指报销要的发票）
- 追问："超5000呢？"（指审批额度）

如果把"那发票呢"直接拿去检索，会检索不到任何相关内容。**指代消解**（把省略/指代补全）是多轮对话检索的前提。

## 二、查询改写（Query Rewrite）

### 2.1 触发条件

改写不是每次都做，由意图识别触发：

```python
# qa_core/intent/classifier.py
# 场景1：追问规则命中（"那""呢""然后呢"等）
if is_followup(query):
    result.requires_rewrite = True

# 场景2：LLM 判断需要改写（结合历史，指代不明时）
```

### 2.2 改写实现

```python
# qa_core/pipeline/rewrite.py
def rewrite_query(query, history):
    """把指代/省略补全为完整问题"""
    messages = [
        SystemMessage(content=REWRITE_PROMPT),
        *history,          # 最近几轮历史
        HumanMessage(content=query),
    ]
    rewritten = llm.invoke(messages).content
    return rewritten
```

### 2.3 改写 Prompt 设计

改写 Prompt 的核心约束：
- 只补全指代，不改写原意
- **完整问题不改写**（已经完整就直接返回）
- 基于最近历史（不是全部历史）
- 输出完整、独立的问题

### 2.4 为什么要限制历史长度

- 历史太长 → 改写可能被无关信息干扰
- 成本高（token 消耗）
- 通常只取**最近 2-4 轮**做改写上下文

### 2.5 完整问题不改写的原则

```python
# 如果 query 本身是完整独立问题，直接返回，不调用 LLM
if is_complete_query(query):
    return query
```

> 省一次 LLM 调用，也避免改写引入噪声。

## 三、查询变体（Query Variants）

### 3.1 为什么需要查询变体

同一问题有多种问法，生成**多个变体**去检索，可以提高召回率：

```
原问题："报销需要什么材料"
变体1："报销要准备哪些凭证"
变体2："费用报销需要提交什么"
```

### 3.2 两种生成方式

```python
# qa_core/pipeline/query_variants.py
# 方式1：LLM 生成变体
variants = llm.invoke(GENERATE_VARIANTS_PROMPT.format(query=query))

# 方式2：规则/词典生成（低成本，适合 FAQ）
variants = keyword_expand(query, synonym_dict)
```

多个变体 → 分别检索 → **合并去重** → 重排。

### 3.3 什么时候不生成变体

不是所有查询都生成变体（成本考量）：

```python
# RetrievalPlan 是 frozen dataclass，use_query_variants 在构造时设定
plan = RetrievalPlan(
    use_query_variants=should_use_variants(intent_result),
    ...
)
```

- **精确 FAQ 命中**：不生成（直出）
- **普通制度查询**：可生成 2-3 个变体
- **闲聊**：不生成

## 四、历史消息的压缩策略

### 4.1 为什么不把全部历史发给 LLM

多轮对话历史会无限增长，全发导致：
- token 成本高
- 超出上下文窗口
- 无关历史干扰当前回答

### 4.2 摘要 + 最近消息策略

```python
# qa_core/memory/history.py — ChatHistoryStore
def build_llm_history(session_id, max_recent=6):
    history = store.load(session_id)
    summary = summarize_old(history[:-max_recent])  # 早期轮次 → 摘要
    recent = history[-max_recent:]                   # 最近轮次 → 原文
    return summary + recent
```

**原则**：早期对话压缩成摘要，最近对话保留原文，兼顾上下文完整与成本。

### 4.3 上下文窗口管理全景

```
全部历史 → 摘要 + 最近N轮 → 加上检索片段 → 加上系统Prompt → LLM
```

## 五、改写+变体的完整流程

### 5.1 在 RAG 链路中的位置

```
用户追问"那审批呢"
  → 意图识别：requires_rewrite=True
  → 查询改写："报销超5000谁审批"
  → 检索计划：文档优先 + 费用参数
  → （可选）生成查询变体
  → 混合检索（多变体）→ 合并去重 → 重排 → 上下文 → LLM
```

### 5.2 检索时的用法

```python
# qa_core/retrieval/store.py — MilvusHybridStore
def search_many(self, queries, plan):
    all_hits = []
    for q in queries:          # 多个变体
        hits = self._search_one(q, plan)
        all_hits.extend(hits)
    deduped = dedup_by_content(all_hits)   # 按内容去重
    reranked = reranker.rerank(query, deduped)  # 重排
    return reranked[:plan.doc_top_k]
```

## 六、企业知识库场景的多轮示例

```
员工："报销流程是什么？"
助手：（检索 finance 制度）→ "报销需填审批单、附发票，5000元内部门经理审批..."

员工："那超5000呢？"（追问）
  → 改写："报销超5000的审批流程是什么？"
  → 检索 finance → "超5000需总经理审批，需附3家比价..."

员工："发票丢了怎么办？"（费用类）
  → 改写判断：完整问题，不改写
  → 检索 + 费用模板 → "发票丢失需提供情况说明，财务审核..."
```

---

**本篇小结**：查询改写解决"指代消解"，查询变体提高召回，历史压缩控制成本。三者让多轮对话在企业知识库中流畅可用。下一篇讲混合检索落地。
