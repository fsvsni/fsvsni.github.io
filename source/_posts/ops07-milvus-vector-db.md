---
title: "系列二·第7篇 Milvus：四类运维资料的存储与检索"
date: 2026-08-27 21:00:00
series_group: 2
series_order: 7
tags:
  - RAG
  - Milvus
  - 向量数据库
categories:
  - 设备运维 RAG
---

> 对应课件：04 Milvus 索引机制与基本操作
> 本篇目标：从**设备运维**视角讲 Milvus——四类资料怎么分 Collection、索引怎么选、怎么按设备/故障码/告警等级过滤检索。

## 一、为什么设备运维需要服务化向量库

- **数据量大**：巡检记录逐日新增，告警 SOP、维修手册持续积累
- **检索要快**：告警发生时巡检员要立刻得到处理方案
- **过滤要强**：按 source/设备/故障码/告警等级过滤
- **混合检索**：故障码精确 + 语义理解

Milvus 2.5.x 完全满足。

## 二、Collection 设计：四类资料

设备运维把资料分成四类 Collection：

| Collection | 存什么 | 特点 |
|---|---|---|
| **inspection** | 巡检记录（逐日新增） | 高频、结构化 |
| **alarm** | 告警处理 SOP | 分级、规则化 |
| **repair** | 维修手册/故障码 | 经验性 |
| **work_order** | 工单规则 | 状态机 |

> 为什么分 Collection：四类资料**形态、过滤维度、检索频率**都不同，分开存储检索更精准、管理更清晰。

## 三、Schema 设计

```python
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True),
    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=1024),
    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
    FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=4000),
    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=32),    # inspection/alarm/repair/work_order
    FieldSchema(name="device_id", dtype=DataType.VARCHAR, max_length=64), # 设备编号
    FieldSchema(name="alarm_level", dtype=DataType.VARCHAR, max_length=8),# P0/P1/P2
    FieldSchema(name="fault_code", dtype=DataType.VARCHAR, max_length=32),# 故障码
    FieldSchema(name="kb_version", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="tenant_id", dtype=DataType.VARCHAR, max_length=64),
]
```

> 设备编号、告警等级、故障码是运维检索的**专属过滤字段**。

## 四、索引选择

```python
# Dense：HNSW（推荐，运维数据量中等以上）
collection.create_index("dense_vector", {
    "metric_type": "COSINE",
    "index_type": "HNSW",
    "params": {"M": 16},
})
# Sparse：BM25（精确匹配故障码/设备型号）
collection.create_index("sparse_vector", {
    "index_type": "SPARSE_INVERTED_INDEX",
    "metric_type": "BM25",
})
```

**决策树**：

```
巡检数据量小 → FLAT 可
告警/维修数据量大 → HNSW（推荐）
```

## 五、检索操作：过滤 + 混合检索

### 5.1 按 source 过滤

```python
# 问"告警怎么处理" → 只查 alarm
expr = 'source == "alarm" and kb_version == "sop_2026v3"'
```

### 5.2 按设备/故障码过滤

```python
# 问"空压机A故障" → 过滤 device_id
expr = 'source in ["repair","alarm"] and device_id == "compressor_A"'

# 问"E-203故障码" → 过滤 fault_code
expr = 'source == "repair" and fault_code == "E-203"'
```

### 5.3 按告警等级过滤

```python
# P0 告警优先处理
expr = 'source == "alarm" and alarm_level == "P0"'
```

### 5.4 混合检索

```python
results = collection.hybrid_search(
    reqs=[dense_req, sparse_req],   # Dense + BM25
    ranker=WeightedRanker(0.7, 0.3),
    limit=30,
)
```

## 六、巡检记录的高频写入

巡检记录逐日新增，写入策略：

```python
def ingest_daily_inspection(records, date):
    # 批量插入当日巡检记录
    collection.insert(build_records(records, date))
    # 超过保留期的历史巡检可归档
    cleanup_expired("inspection", retention_days=180)
```

> 巡检记录有**时效性**：三个月前的巡检记录一般不再参与实时问答，可按保留期归档清理。

## 七、设备运维的检索示例

```
巡检员问："空压机A压力偏高怎么办"
  → 意图：告警/维修类
  → 过滤：source in [alarm, repair, inspection], device_id=compressor_A, active版本
  → Dense 检索："压力偏高处理"语义匹配
  → BM25 检索：精确匹配"空压机""压力"
  → 融合 → Reranker 精排
  → LLM 给出处理步骤
```

---

**本篇小结**：Milvus 四类 Collection + 设备/故障码/告警等级过滤 + 混合检索，支撑设备运维的精准快查。下一篇讲意图分类。
