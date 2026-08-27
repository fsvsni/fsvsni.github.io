---
title: "系列一·第11篇 混合检索落地：Dense + BM25"
date: 2026-08-27 17:40:00
series_group: 1
series_order: 11
tags:
  - RAG
  - 混合检索
  - Milvus
  - BM25
categories:
  - 企业知识库 RAG
---

> 对应课件：08 Milvus 混合检索
> 本篇目标：讲透企业知识库的**混合检索落地**——双向量字段怎么建、BM25 中文分词怎么配、分数怎么融合、过滤表达式怎么写。

## 一、先划清两个容易混淆的概念

| 概念 | 含义 | 在 Milvus 中 |
|---|---|---|
| **Dense 检索** | 语义相似度（Embedding 向量） | `dense_vector` 字段，COSINE 度量 |
| **Sparse 检索** | 关键词/词频（BM25） | `sparse_vector` 字段，BM25 度量 |

**混合检索** = 一次查询同时走 Dense 和 Sparse，融合两者分数。

## 二、双向量字段的 Schema

```python
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=1024),      # Dense
    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),        # Sparse
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=4000),
    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=32),
    ...
]
```

**为什么 V1 采用 Dense + BM25BuiltInFunction**：
- BGE-M3 生成 Dense 向量（语义）
- Milvus 内置 **BM25 BuiltInFunction** 生成 Sparse（关键词），无需额外部署分词器
- 相比 BGE-M3 的 sparse 输出，Milvus BM25 更简单、服务端内置

## 三、LangChain Milvus 初始化

```python
# qa_core/retrieval/store.py
from langchain_milvus import Milvus

vector_store = Milvus(
    embedding_function=get_embedding_model(),
    collection_name="kb_enterprise_doc",
    connection_args={"uri": "http://milvus:19530"},
    primary_field="id",
    text_field="text",
    vector_field="dense_vector",
)
```

> 检索时 `embed_query` 把用户问题转成 Dense 向量；Sparse 由 Milvus BM25 服务端处理。

## 四、BM25 中文分词配置

中文检索的关键：**分词**。Milvus 内置 BM25 需要中文分词支持：

```python
# qa_core/retrieval/milvus_compat.py
# 配置 BM25 的 analyzer（如 jieba 分词）
analyzer_params = {
    "tokenizer": "jieba",
}
```

> "报销流程"如果不分词，可能匹配不到"报销""流程"单独出现的文档。中文分词是 BM25 召回质量的基石。

### BM25 sparse vs BGE-M3 sparse

| 方案 | 说明 |
|---|---|
| **Milvus BM25BuiltInFunction** | 服务端内置，简单可靠，无需额外模型 |
| BGE-M3 sparse | 模型生成的稀疏向量，更"语义"但复杂 |

本项目 V1 选 **Dense + BM25BuiltInFunction**：简单、服务端内置、满足企业知识库的精确关键词需求。

## 五、Hybrid Search 的分数融合

混合检索把 Dense 和 Sparse 的分数融合：

```python
# Milvus 提供 Ranker
from pymilvus import WeightedRanker

# 加权融合
ranker = WeightedRanker(dense_weight, sparse_weight)
results = collection.hybrid_search(
    reqs=[dense_req, sparse_req],
    ranker=ranker,
    limit=30,
)
```

| Ranker | 原理 |
|---|---|
| **WeightedRanker** | 按权重加权 Dense/Sparse 分数（本项目用） |
| **RRFRanker** | 基于排名（Rank）融合，不依赖分数尺度 |

> 权重（如 Dense 0.7 / Sparse 0.3）在检索计划里配置，通过评测调优。

## 六、过滤表达式构建（企业知识库核心）

### 6.1 为什么需要过滤表达式

企业知识库**不能检索全部资料**：必须按 source、版本、租户、可见性过滤，否则跨部门数据泄露。

### 6.2 拼接后的实际表达式

```python
# FAQ 场景：HR 分类，active 版本，默认租户
expr = 'source == "hr" and kb_version == "kb_2026v3" and tenant_id == "company_a"'

# 文档场景：按 active version_seq 解释有效期窗口
expr = ('source == "finance" and tenant_id == "company_a" '
        'and visibility in ["public", "internal"] '
        'and array_contains(allowed_roles, "employee")')
```

### 6.3 安全转义（重要）

**危险**：如果用户输入被拼进过滤表达式，可能注入：

```python
# 危险！如果用户输入 source_filter = 'hr" or 1==1 or "'
# 结果：source == "hr" or 1==1 or "" → 绕过了 source 过滤！
```

```python
# qa_core/governance/data_scope.py
def escape_expr_value(value):
    return value.replace('"', '\\"').replace("'", "\\'")
```

> 过滤表达式 + 安全转义，是企业知识库**数据安全的关键防线**（第 18 篇详细展开）。

## 七、多查询变体检索与合并

```python
def search_many(query, variants, plan):
    all_hits = []
    for v in variants:
        hits = hybrid_search(v, plan)   # 每个变体都走混合检索
        all_hits.extend(hits)
    deduped = dedup_by_content(all_hits)  # 文档去重
    reranked = reranker.rerank(query, deduped)  # BGE Reranker 精排
    return reranked[:plan.doc_top_k]
```

### 文档去重逻辑

多个变体可能召回同一文档 → 按内容/ID 去重，避免重复上下文。

### Reranker 重排实现

```python
# qa_core/retrieval/reranker
def rerank(query, docs, top_k):
    pairs = [[query, doc.page_content] for doc in docs]
    scores = reranker_model.predict(pairs)   # BGE Reranker (CrossEncoder)
    ranked = sorted(zip(docs, scores), key=lambda x: -x[1])
    return [doc for doc, _ in ranked[:top_k]]
```

## 八、FAQ 与文档分集合设计回顾

| Collection | 用途 | 混合检索 |
|---|---|---|
| **FAQ Collection** | 高频问答对 | 小数据量，Dense + BM25 均可用 |
| **Doc Collection** | 制度全文 | 大数据量，混合检索 + 重排 |

FAQ 精确直出（路由层）不走检索；FAQ 相关但不确定 → 检索 FAQ collection。

## 九、企业知识库场景的混合检索示例

```
员工问："VPN 连不上怎么办"
  → 意图：retrieval / faq / source=it
  → 过滤：source == "it" and kb_version == active and tenant == company_a
  → Dense 检索：语义匹配"远程连接故障排查"
  → BM25 检索：精确匹配"VPN"
  → 融合 → Reranker 精排 → Top-3 FAQ 候选
  → LLM 基于 FAQ 直出答案
```

---

**本篇小结**：混合检索 = Dense 语义 + BM25 关键词 + 过滤表达式 + 重排，是企业知识库检索的核心。过滤和安全转义是数据安全关键。下一篇进入 QAService 服务编排。
