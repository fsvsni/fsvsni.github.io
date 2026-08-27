---
title: "系列二·第11篇 混合检索落地：故障码精确 + 语义理解"
date: 2026-08-27 21:40:00
tags:
  - RAG
  - 混合检索
  - Milvus
categories:
  - 设备运维 RAG
---

> 对应课件：第 8 讲 Milvus 混合检索深度解析
> 本篇目标：从**设备运维**视角讲混合检索落地——四类资料的检索过滤怎么写、故障码如何精确命中、分数怎么融合。

## 一、运维场景为什么必须混合检索

运维问题**既有语义又有精确术语**：

| 场景 | 需要 Dense | 需要 Sparse |
|---|---|---|
| "泵机声音异常" | ✅ 语义匹配维修手册 | |
| "故障码 E-203" | | ✅ 精确命中 |
| "日检异常怎么升级" | ✅ | ✅ "日检""升级" |
| "设备型号 ABC-2000" | | ✅ 精确匹配 |

> 只靠语义：E-203 可能匹配不到精确文档；只靠关键词："泵机声音异常"会漏掉语义相近的"振动过大"。

## 二、双向量字段 Schema

```python
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=1024),
    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=4000),
    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=32),
    FieldSchema(name="device_id", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="fault_code", dtype=DataType.VARCHAR, max_length=32),
    FieldSchema(name="alarm_level", dtype=DataType.VARCHAR, max_length=8),
    ...
]
```

## 三、LangChain Milvus 初始化

```python
vector_store = Milvus(
    embedding_function=get_embedding_model(),
    collection_name="equipment_ops_alarm",   # 或按 source 分 collection
    connection_args={"uri": "http://milvus:19530"},
    primary_field="id",
    text_field="text",
    vector_field="dense_vector",
)
```

## 四、检索过滤表达式（运维版）

### 4.1 基础过滤

```python
# 只查告警 + 当前版本
expr = 'source == "alarm" and kb_version == "sop_2026v3"'
```

### 4.2 按设备过滤

```python
expr = 'source in ["repair", "alarm"] and device_id == "compressor_A"'
```

### 4.3 按故障码过滤

```python
expr = 'source == "repair" and fault_code == "E-203"'
```

### 4.4 按告警等级过滤

```python
# P0 高危告警优先
expr = 'source == "alarm" and alarm_level == "P0"'
```

### 4.5 组合过滤 + 安全转义

```python
expr = ('source in ["alarm","repair"] and tenant_id == "plant_a" '
        'and kb_version == "sop_2026v3" and alarm_level == "P0"')

def escape_expr_value(value):
    return value.replace('"', '\\"').replace("'", "\\'")
```

> **安全转义**：设备号/故障码若来自用户输入，必须转义，防注入绕过过滤。

## 五、分数融合

```python
from pymilvus import WeightedRanker

ranker = WeightedRanker(dense_weight, sparse_weight)  # 如 0.7/0.3
results = collection.hybrid_search(
    reqs=[dense_req, sparse_req],
    ranker=ranker,
    limit=30,
)
```

> 权重在检索计划里配置，通过评测调优。设备型号/故障码多的场景可提高 sparse 权重。

## 六、多变体检索与合并

```python
def search_many(query, variants, plan):
    all_hits = []
    for v in variants:
        all_hits.extend(hybrid_search(v, plan))
    deduped = dedup_by_content(all_hits)   # 文档去重
    reranked = reranker.rerank(query, deduped)  # BGE Reranker
    return reranked[:plan.doc_top_k]
```

> 多个变体 → 合并去重 → 重排，告警/维修问题不漏关键 SOP。

## 七、设备运维检索示例

```
维修工问："E-203 故障码怎么处理"
  → 意图：repair
  → 过滤：source == "repair" and fault_code == "E-203" and active版本
  → Dense 检索："E-203 处理"语义匹配
  → BM25 检索：精确匹配 "E-203"
  → 融合 → Reranker 精排
  → LLM 给出处理步骤 + 引用维修手册
```

## 八、评测：混合检索参数调优

```python
# 对比不同 sparse 权重的 Recall
for w in [0.2, 0.3, 0.4]:
    plan = RetrievalPlan(sparse_weight=w, ...)
    recall = run_eval(plan, eval_set)
    print(f"sparse={w}: recall={recall}")
# 固化表现最好的权重
```

---

**本篇小结**：混合检索（Dense 语义 + BM25 精确 + 设备/故障码过滤 + 重排）是设备运维检索的核心。下一篇讲 QAService 编排。
