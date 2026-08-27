---
title: "系列一·第5篇 Embedding 工程实践：BGE-M3 模型与向量化"
date: 2026-08-27 16:40:00
series_group: 1
series_order: 5
tags:
  - RAG
  - Embedding
  - BGE-M3
categories:
  - 企业知识库 RAG
---

> 本篇目标：从工程视角讲清 BGE-M3 模型在企业知识库中的落地——如何部署、如何向量化制度文档、为什么选择 BGE-M3。

## 一、Embedding 模型在企业知识库中的角色

企业知识库的检索质量，**一半取决于 Embedding 模型的质量**。BGE-M3 把每个制度片段转成 1024 维向量，向量质量直接决定"语义相近"能否被正确识别。

以 `enterprise_knowledge` 场景为例：

- 制度文档片段："报销金额超过 5000 元需总经理审批"
- 员工提问："报销超五千要谁批"
- 好的 Embedding 能识别两者语义相近，即使字面差异大

## 二、为什么选 BGE-M3

| 特性 | BGE-M3 的优势 |
|---|---|
| **中文语义** | 在中文语料上表现优异，适合中文制度文档 |
| **多语言** | 支持中英等多语言，便于混合内容 |
| **本地部署** | 可离线运行，企业数据不出内网 |
| **多粒度** | 支持句子、段落等多粒度编码 |
| **1024 维 Dense** | 维度适中，兼顾表达力与存储/检索效率 |

> 企业场景的关键约束：**数据不出内网**。BGE-M3 本地部署正好满足——只有生成阶段走云端 LLM，检索/向量化全程本地。

## 三、模型部署与加载

### 3.1 模型目录结构

```
models/
├── bge-m3/                    # Embedding 模型（本地部署）
├── bge-reranker-large/        # 重排模型
└── bert_intent_classifier_v1/ # 意图分类模型
```

### 3.2 代码加载

```python
# qa_core/retrieval/models.py
from langchain_community.embeddings import HuggingFaceBgeEmbeddings

def get_embedding_model():
    return HuggingFaceBgeEmbeddings(
        model_name=settings.EMBEDDING_MODEL_PATH,   # ./models/bge-m3
        model_kwargs={"device": "cpu"},             # CPU 推理
        encode_kwargs={"normalize_embeddings": True},  # L2 归一化
    )
```

> `normalize_embeddings=True` 很关键：归一化后余弦相似度等价于内积，检索更稳定。

## 四、向量化流程：离线入库

### 4.1 制度文档 → chunk → 向量

```
制度PDF（入职流程.docx）
  → 文档切分（父子块策略，几百到一千字/块）
  → 每块调 BGE-M3 转 1024 维向量
  → 向量 + 原文 + metadata 存入 Milvus
```

### 4.2 metadata 设计（企业知识库特有）

每个 chunk 的 metadata 携带企业知识库必需的信息：

```python
{
    "source": "hr",              # 资料来源：hr/it/finance
    "kb_version": "kb_2026v3",   # 知识库版本
    "tenant_id": "company_a",    # 租户
    "dataset_id": "production",  # 数据集
    "visibility": "internal",    # 可见性
    "allowed_roles": ["employee"],  # 允许角色
}
```

> 这些隔离字段在第 18 篇"数据隔离"详细展开。它保证 HR 制度不会被普通员工查询到。

## 五、查询向量化：embed_query

在线问答时，用户问题也要转成向量：

```python
# qa_core/retrieval/store.py 中检索时调用
query_vector = embedding_model.embed_query("报销超5000谁审批")
```

### embed_query 在哪里被调用

LangChain Milvus 初始化后，检索时自动调用 `embed_query` 把查询问题向量化，再执行混合检索。这是 LangChain VectorStore 的封装约定。

## 六、相似度计算与检索

### 6.1 余弦相似度

```python
import numpy as np

def cosine_similarity(vec1, vec2):
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
```

### 6.2 检索语义（伪代码）

```python
# 用户问题转向量
q_vec = embedding_model.embed_query("入职流程有哪些步骤")
# 在 Milvus 中找最相似的 Top-K 片段
results = milvus_collection.search(
    data=[q_vec],
    anns_field="dense_vector",
    param={"metric_type": "COSINE", "params": {"ef": 64}},
    limit=30,  # 粗召回
)
```

## 七、Embedding 质量的常见坑

| 坑 | 表现 | 解决 |
|---|---|---|
| 未归一化 | 相似度不稳定 | `normalize_embeddings=True` |
| 切分过碎 | 语义不完整 | 父子块策略（几百到一千字） |
| 混合语言 | 中文检索英文词不准 | BGE-M3 多语言能力 + 词典兜底 |
| 长文本截断 | 丢失语义 | 控制 chunk 长度在模型窗口内 |

## 八、附录：Embedding 模型选型对比（附录 F 要点）

| 模型 | 特点 | 适用 |
|---|---|---|
| BGE-M3 | 中文强、本地化、多粒度 | 本项目（中文制度文档） |
| BGE-Large | 通用、效果好 | 中英文混合场景 |
| OpenAI text-embedding | 云端、简单 | 无数据隐私约束场景 |
| M3E | 中文场景 | 轻量中文场景 |

> 选型核心考量：**中文能力、本地化部署、维度与成本平衡**。

---

**本篇小结**：BGE-M3 本地部署 + 1024 维向量化，是检索质量的基石。理解 Embedding 落地后，下一篇看 LangChain 生态在项目中的实际边界。
