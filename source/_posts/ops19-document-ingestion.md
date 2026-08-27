---
title: "系列二·第19篇 文档入库：巡检表与告警SOP怎么进知识库"
date: 2026-08-27 23:00:00
series_group: 2
series_order: 19
tags:
  - RAG
  - 文档入库
  - 文本切分
categories:
  - 设备运维 RAG
---

> 对应课件：第 16 讲 文档入库与智能切分
> 本篇目标：从**设备运维**视角讲入库链路——巡检表、告警 SOP、维修手册、工单规则这四类资料怎么加载、怎么切分、怎么入库质检。

## 一、入库链路总览（运维版）

```
原始资料（巡检表/告警SOP/维修手册/工单规则）
  → 1. 文档加载（表格专用 + 通用 + Docling）
  → 2. 文档切分（父子块 + 表格/故障码专用）
  → 3. 向量化（BGE-M3）
  → 4. 入库（Milvus 四类 collection）
  → 5. 入库质检
```

## 二、四类资料的加载策略

| 资料 | 格式 | 加载方式 |
|---|---|---|
| 巡检记录表 | Excel | 表格专用加载（保留行列） |
| 告警 SOP | PDF/MD | 通用解析 + Docling 增强 |
| 维修手册 | PDF + 图片 | 图文解析（图片 OCR） |
| 工单规则 | MD/表格 | 通用解析 |

```python
def load_document(path):
    if path.endswith((".xlsx", ".xls")):
        return load_excel_table(path)      # 巡检表专用
    if path.endswith(".pdf"):
        return load_pdf(path)              # 通用 + Docling 增强
    ...
```

## 三、四类资料的切分策略

### 3.1 巡检表（表格专用切分）

```python
def split_inspection_table(df):
    for _, row in df.iterrows():
        text = " | ".join(f"{col}:{val}" for col, val in row.items())
        yield text
```

> 例子：`设备:空压机A | 巡检项:压力 | 结果:偏高 | 异常:是` → 语义完整。

### 3.2 告警 SOP（按等级/步骤切分）

```python
def split_alarm_sop(sop):
    for level in ["P0", "P1", "P2"]:
        section = extract_section(sop, level)
        for step in split_steps(section):   # 按步骤切
            yield step, {"alarm_level": level}
```

### 3.3 维修手册（按故障码切分）

```python
def split_repair_manual(manual):
    for fault_code, section in manual.items():
        yield section, {"fault_code": fault_code}
```

### 3.4 工单规则（按状态机切分）

```python
def split_work_order_rules(rules):
    for state, rule in rules.items():
        yield rule.text, {"state": state}
```

## 四、父子块策略（运维版）

```python
def split_parent_child(doc):
    parent_chunks = split(doc, chunk_size=1000, overlap=100)
    child_chunks = []
    for parent in parent_chunks:
        child_chunks.extend(split(parent, chunk_size=300, overlap=50))
    return parent_chunks, child_chunks
```

> 子块检索（精准）+ 父块生成（语义完整）。告警 SOP 的完整步骤不能被切碎。

## 五、data_pack 与 clean_overlay

### 5.1 data_packs/enterprise_realistic_pack

设备运维也有仿真增强资料包（含更真实的巡检/告警/维修资料）。

### 5.2 clean_overlay：可治理可预检的增强候选

```python
def clean_overlay(candidates):
    clean = []
    for c in candidates:
        if quality_check(c):    # 质量预检：完整性、冲突检测
            clean.append(c)
    return clean
```

> 入库前治理：过滤低质量/冲突/过期的运维资料，防止脏数据进库。

## 六、入库质检

```python
def verify_ingestion(collection, expected_count):
    actual = collection.num_entities
    if actual < expected_count * 0.9:
        raise IngestionError(f"入库不完整: {actual}/{expected_count}")

def spot_check(query, expected_doc):
    hits = search(query, top_k=5)
    assert expected_doc in [h.page_content for h in hits]
```

> 用代表性问题抽查：如搜"E-203"能否命中维修手册对应段。

## 七、设备运维场景的入库示例

```
入库：巡检表 2026-08.xlsx
  → 表格专用切分（每行向量化）
  → 入库 inspection collection（source=inspection, 版本）
  → 质检：搜"空压机压力"命中

入库：告警处理SOP.pdf
  → 按等级切分（P0/P1/P2）
  → 入库 alarm collection（source=alarm, alarm_level）
  → 质检：搜"P0告警"命中
```

## 八、巡检记录高频入库

```python
def ingest_daily_inspection(records, date):
    collection.insert(build_records(records, date))
    cleanup_expired("inspection", retention_days=180)   # 归档旧巡检
```

> 巡检记录逐日新增，按保留期归档，控制数据量。

---

**本篇小结**：四类资料按各自形态加载、切分、入库，父子块保证步骤完整，clean_overlay 预检脏数据，巡检记录按保留期归档。下一篇讲质量评测。
