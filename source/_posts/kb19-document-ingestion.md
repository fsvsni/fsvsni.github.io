---
title: "系列一·第19篇 文档入库：制度资料怎么变成可检索向量"
date: 2026-08-27 19:00:00
series_group: 1
series_order: 19
tags:
  - RAG
  - 文档入库
  - 文本切分
categories:
  - 企业知识库 RAG
---

> 对应课件：第 16 讲 文档入库与智能切分
> 本篇目标：讲清企业知识库的**离线入库链路**——制度 PDF/表格怎么加载、怎么切分成块、FAQ 怎么入库、入库质量怎么检查。

## 一、入库链路总览

```
原始资料（制度PDF/MD/表格/FAQ CSV）
  → 1. 文档加载（两层解析策略）
  → 2. 文档切分（父子块策略 + 表格专用切分）
  → 3. 向量化（BGE-M3）
  → 4. 入库（Milvus FAQ + Doc collection）
  → 5. 入库质检（质量检查）
```

## 二、文档加载：两层解析策略

企业资料格式多样（PDF、Word、Markdown、Excel），需要**两层解析**：

### 2.1 第一层：通用解析

```python
# qa_core/indexing/loaders.py
from langchain_community.document_loaders import PyPDFLoader, TextLoader

def load_document(path):
    if path.endswith(".pdf"):
        return PyPDFLoader(path).load()
    if path.endswith(".md"):
        return TextLoader(path).load()
    if path.endswith((".xlsx", ".xls")):
        return load_excel_table(path)   # 表格专用
    ...
```

### 2.2 第二层：Docling 增强

对复杂/扫描件，用 **Docling** 做版面分析与内容抽取，提高解析质量：

```python
def load_with_docling(path):
    doc = docling_convert(path)   # 版面识别、结构化抽取
    return doc_to_langchain_docs(doc)
```

> 两层策略：通用解析覆盖常见格式，Docling 增强处理复杂文档。

## 三、文档切分：父子块策略

### 3.1 为什么要切分

长文档不能整体向量化（超出模型窗口 + 检索粒度过粗）。要切成**语义完整**的块。

### 3.2 父子块策略（核心）

**父块（parent chunk）**：大块（几百到一千字），语义完整，用于生成
**子块（child chunk）**：小块（几百字内），检索精准，用于召回

```
原理：
  1. 用子块去检索（精准命中）
  2. 命中后返回所属父块（语义完整）
```

```python
# qa_core/indexing/splitter.py
def split_parent_child(doc):
    parent_chunks = split(doc, chunk_size=1000, overlap=100)
    child_chunks = []
    for parent in parent_chunks:
        child_chunks.extend(split(parent, chunk_size=300, overlap=50))
    return parent_chunks, child_chunks
```

> 子块检索 + 父块生成，兼顾**精准召回**和**语义完整**。

### 3.3 为什么要 overlap（重叠）

切分时让相邻块**有重叠**，避免关键句被截断在边界导致语义丢失。

### 3.4 表格专用切分

表格内容（如报销额度表）用**表格专用切分**，保留行列结构：

```python
def split_table(df):
    # 按行转自然语言 + 保留表头
    for _, row in df.iterrows():
        yield f"【{df.columns}】{row.to_dict()}"
```

> 表格若按文本切分会破坏结构，专用切分保留"表头+行"语义。

## 四、FAQ 入库

### 4.1 FAQ 数据结构

```python
# qa_core/indexing/faq.py
@dataclass
class FAQItem:
    question: str
    answer: str
    source: str        # hr/it/finance
    keywords: list     # 关键词（用于匹配）
    category: str      # 分类
```

### 4.2 FAQ 入库

```python
def ingest_faq(items, scenario):
    for item in items:
        collection.insert([
            embedding(item.question),
            bm25(item.question),
            item.question,
            ...
        ])
```

> FAQ 用**问题**做向量，检索时用员工问题匹配 FAQ 问题。

## 五、data_pack 与 clean_overlay

### 5.1 data_packs/enterprise_realistic_pack

企业仿真增强资料包：包含更真实的 hr/it/finance 制度资料，用于增强知识库。

```python
# data_packs/enterprise_realistic_pack/
# hr_入职流程.md, finance_报销制度.md, it_网络管理.md ...
```

### 5.2 clean_overlay：可治理可预检的增强候选

**clean_overlay** 是**可治理、可预检**的增强候选资料：入库前先做质量预检，过滤低质量/冲突内容。

```python
def clean_overlay(candidates):
    clean = []
    for c in candidates:
        if quality_check(c):    # 质量预检
            clean.append(c)
    return clean
```

> 防止"脏数据"进入知识库，入库前治理。

## 六、入库质量检查

### 6.1 入库后质量验证

```python
# qa_core/indexing/quality.py
def verify_ingestion(collection, expected_count):
    actual = collection.num_entities
    if actual < expected_count * 0.9:
        raise IngestionError(f"入库不完整: {actual}/{expected_count}")
```

### 6.2 抽查向量质量

```python
def spot_check(query, expected_doc):
    hits = search(query, top_k=5)
    assert expected_doc in [h.page_content for h in hits]
```

> 用"代表性问题"抽查：检索能否命中正确制度。

## 七、企业知识库场景的入库示例

```
入库：hr 入职流程.pdf
  → 加载（PDFLoader）
  → 父子块切分（子块检索/父块生成）
  → BGE-M3 向量化 + BM25
  → 入库 Doc collection（source=hr, active版本）
  → 质检：搜索"入职流程"命中

入库：finance FAQ.csv
  → FAQ 结构化入库（问题向量化）
  → 质检：搜索"报销超5000"命中 FAQ
```

---

**本篇小结**：入库链路"加载→切分→向量化→入库→质检"把制度资料变成可检索向量，父子块策略兼顾精准与完整。下一篇讲质量评测。
