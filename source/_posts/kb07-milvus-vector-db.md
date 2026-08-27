---
title: "系列一·第7篇 Milvus：企业资料怎么存怎么查"
date: 2026-08-27 17:00:00
series_group: 1
series_order: 7
tags:
  - RAG
  - Milvus
  - 向量数据库
categories:
  - 企业知识库 RAG
---

> 对应课件：04 Milvus 索引机制与基本操作
> 本篇目标：讲清企业知识库的向量存储方案——为什么用 Milvus、索引怎么选、Collection/Schema/检索怎么操作。

## 一、为什么需要服务化向量数据库

企业知识库要存储并检索制度文档的向量。为什么不用普通数据库或内存检索？

| 需求 | 说明 |
|---|---|
| **海量向量** | 制度文档切分后可能有几万到几十万 chunk |
| **快速检索** | 员工提问要毫秒级响应 |
| **元数据过滤** | 按 source/版本/租户过滤（企业合规必需） |
| **混合检索** | Dense + Sparse 融合 |
| **服务化** | 多实例共享、独立部署 |

**Milvus 2.5.x** 正好满足：企业级服务化向量数据库，支持 Dense + Sparse 混合检索、丰富的过滤表达式。

## 二、向量索引的本质：为什么需要索引

暴力搜索（FLAT）在几十万向量里找最相似的，要算几十万次相似度，太慢。**索引**用空间换时间，加速检索。

### 索引在什么时候构建

- **数据量小**（<1万）：FLAT 暴力即可
- **数据量大**：建 HNSW/IVF 索引，牺牲少量精度换取速度

## 三、主流索引类型对比

| 索引 | 原理 | 特点 | 适用 |
|---|---|---|---|
| **FLAT** | 暴力全量搜索 | 最准但最慢 | 小数据量、要求精确 |
| **IVF_FLAT** | 倒排分区 + 暴力 | 分区加速，精度尚可 | 中等数据量 |
| **IVF_SQ8/PQ** | 倒排 + 量化压缩 | 省内存，有精度损失 | 大规模 |
| **HNSW** | 分层可导航小世界图 | 速度快、精度高、内存占用大 | 本项目首选 |

### HNSW 是怎么工作的

1. **建图**：每个向量是图的节点，连接相近节点，形成多层结构
2. **查询**：从顶层粗粒度开始，逐层向下，快速找到最近邻

```python
# 为 Dense 向量字段创建 HNSW 索引
index_params = {
    "metric_type": "COSINE",
    "index_type": "HNSW",
    "params": {"M": 16, "efConstruction": 200},
}
```

## 四、Collection 与 Schema 设计

企业知识库需要**双向量字段**（Dense + Sparse）+ 业务字段：

```python
from pymilvus import CollectionSchema, FieldSchema, DataType

fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=1024),
    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=4000),
    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=32),      # hr/it/finance
    FieldSchema(name="kb_version", dtype=DataType.VARCHAR, max_length=64),  # 版本
    FieldSchema(name="tenant_id", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="visibility", dtype=DataType.VARCHAR, max_length=16),
    FieldSchema(name="allowed_roles", dtype=DataType.ARRAY, element_type=DataType.VARCHAR, max_capacity=16),
]

schema = CollectionSchema(fields=fields)
collection = Collection(name="kb_enterprise_doc", schema=schema)
```

> **Sparse 向量字段**是混合检索的关键：Dense 存语义，Sparse 存关键词。

## 五、基本操作流程

### 5.1 连接 Milvus

```python
# 方式一：connections 模块（LangChain 使用方式）
from pymilvus import connections
connections.connect(host="milvus", port="19530")

# 方式二：MilvusClient（新版更简洁）
from pymilvus import MilvusClient
client = MilvusClient(uri="http://milvus:19530")
```

### 5.2 创建索引

```python
# Dense 向量：HNSW 索引
collection.create_index("dense_vector", {"metric_type": "COSINE", "index_type": "HNSW", "params": {"M": 16}})
# Sparse 向量：BM25 索引
collection.create_index("sparse_vector", {"index_type": "SPARSE_INVERTED_INDEX", "metric_type": "BM25"})
```

### 5.3 插入数据

```python
collection.insert([
    [1, 2],                                  # id
    [vec1, vec2],                            # dense_vector
    [sparse1, sparse2],                      # sparse_vector
    ["报销超5000需总经理审批", "入职流程..."],   # text
    ["finance", "hr"],                       # source
    ...
])
```

### 5.4 加载到内存并搜索

```python
# 必须先加载才能搜索
collection.load()

# 执行搜索
results = collection.search(
    data=[query_vector],
    anns_field="dense_vector",
    param={"metric_type": "COSINE", "params": {"ef": 64}},
    limit=30,
    expr='source == "hr" and kb_version == "kb_2026v3"',  # 过滤
)
```

### 5.5 删除数据

```python
# 按主键删除
collection.delete(expr="id in [1, 2]")
# 按表达式删除
collection.delete(expr='source == "finance" and kb_version == "kb_old"')
```

## 六、FAQ 与文档分 Collection 设计

企业知识库把资料分成两类存储（这是第 11 篇混合检索的铺垫）：

| Collection | 存什么 | 特点 |
|---|---|---|
| **FAQ Collection** | 高频问答对（"入职流程有哪些步骤"→答案） | 小、精确、可直出 |
| **Doc Collection** | 制度全文切块 | 大、全面、供检索 |

**为什么要分**：
- FAQ 可以"精确命中直出"（不用走完整 RAG）
- 文档用于深度检索，兼顾"常见问题秒答"和"复杂制度可查"

## 七、索引选型决策树

```
数据量小(<1万)？ → FLAT
   ↓ 否
要求高精度 + 可接受内存？ → HNSW（推荐）
   ↓ 否
内存紧张、数据超大？ → IVF_SQ8 / IVF_PQ
```

企业知识库制度文档通常几万到几十万 chunk，**HNSW 是默认选择**。

## 八、企业知识库场景落点

- `enterprise_knowledge` 在 Milvus 中有 **FAQ + Doc 两个 Collection**（按 source 区分 hr/it/finance）
- 检索时**过滤表达式**同时约束：source、active 版本、租户、可见性
- Sparse 索引用 BM25，支撑"VPN""报销"等精确关键词命中

---

**本篇小结**：Milvus 是检索的存储底座。理解 Collection/Schema、索引类型、过滤检索，就掌握了"企业资料怎么存怎么查"。下一篇进入意图分类——判断员工想干什么。
