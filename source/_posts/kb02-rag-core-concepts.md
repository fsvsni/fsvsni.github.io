---
title: "系列一·第2篇 RAG 核心概念：Embedding、向量与检索"
date: 2026-08-27 16:10:00
series_group: 1
series_order: 2
tags:
  - RAG
  - Embedding
  - 向量检索
categories:
  - 企业知识库 RAG
---

> 对应课件：第 2 讲 RAG 核心概念深入
> 本篇目标：把 Embedding、向量数据库、Dense/Sparse/Hybrid 检索、Reranker 这几个"地基概念"讲透，它们是理解整个企业知识库系统的前提。

## 一、Embedding：把文字变成数学

### 1.1 什么是 Embedding

**Embedding（嵌入）** 是把一段文本转换成一个固定长度的浮点数数组（向量）。比如一句话经过 BGE-M3 模型，会变成一个 **1024 维**的向量：

```python
文本 = "入职流程有哪些步骤"
向量 = embedding(文本)   # [0.12, 0.34, -0.56, 0.08, ...] 共1024个数字
```

关键特性：**语义相近的文本，向量在数学空间中的"距离"也近**。

### 1.2 为什么要 Embedding

传统关键词搜索（比如 MySQL LIKE 查询）只做字面匹配：

- 搜"Python"能找到《Python 机器学习实战》
- 但找不到《用编程语言做数据分析》（虽然它讲的也是 Python）

向量检索做的是**语义匹配**：

- 用户问"报销流程" → 向量检索能找到"差旅费用报销规定"（语义相近，字面不同）
- 用户问"VPN 连不上" → 能匹配到 IT 手册里"远程连接故障排查"章节

这正是企业知识库最需要的能力：**员工用自己的话问，系统用语义理解去匹配制度文档**。

### 1.3 向量相似度计算

最常用的是**余弦相似度**（Cosine Similarity），计算两个向量夹角的余弦值，范围 [-1, 1]，越接近 1 表示越相似：

```python
# 两个语义相近的句子的向量
向量1 = embedding("入职流程有哪些步骤")
向量2 = embedding("入职手续怎么办理")
# 余弦相似度 ≈ 0.95（很高，语义相近）

向量3 = embedding("今天天气很好")
# 向量1 和 向量3 的余弦相似度 ≈ 0.1（很低，语义无关）
```

> 向量检索就是：把用户问题转成向量，在向量数据库里找"余弦相似度最高"的文档片段。

### 1.4 本项目用的 Embedding 模型：BGE-M3

- **BGE-M3**：中文语义理解能力强，生成 1024 维 Dense 向量
- 支持**本地部署**（模型放在 `./models/bge-m3`），不依赖外部 API
- 同时具备 Dense（稠密向量）和 Sparse（稀疏向量）能力

```python
# qa_core/retrieval/models.py — 获取 Embedding 模型
from langchain_community.embeddings import HuggingFaceBgeEmbeddings

def get_embedding_model():
    return HuggingFaceBgeEmbeddings(
        model_name=settings.EMBEDDING_MODEL_PATH,  # ./models/bge-m3
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
```

## 二、向量数据库在 RAG 中的职责

普通数据库（MySQL）擅长存结构化数据，但不擅长"找语义最相似的向量"。**向量数据库**专门解决这个问题：

| 职责 | 说明 |
|---|---|
| **存储** | 存向量 + 原文 + metadata（来源、版本、权限等） |
| **索引** | 建立高效索引（如 HNSW），加速相似度搜索 |
| **检索** | 给定查询向量，返回 Top-K 最相似的文档片段 |
| **过滤** | 支持按 metadata 过滤（source、版本、租户、可见性） |

本项目用 **Milvus 2.5.x**：企业级服务化向量数据库，支持 Dense + Sparse 混合检索。

## 三、Dense 检索 vs Sparse 检索

企业知识库的检索需要两种能力，对应两种检索方式：

### 3.1 Dense 检索（语义相似度）

- 用 Embedding 把文本变**稠密向量**（如 1024 维）
- 检索时找**语义最相近**的片段
- 优点：理解同义词、改写、意图
- 缺点：对**精确关键词/编号**不敏感

> 例：问"报销需要什么材料"，能匹配到财务制度里"发票、审批单、费用明细"的段落，即使字面不完全相同。

### 3.2 Sparse 检索（关键词匹配）

- 基于**词频/关键词**（BM25 算法）
- 检索时找**包含相同关键词**的片段
- 优点：对精确术语、编号、型号敏感
- 缺点：不理解语义，同义词会漏

> 例：搜"VPN"，能精确匹配所有含"VPN"字样的文档，即使语义表述不同。

### 3.3 Hybrid Search（混合检索）：两者结合

本项目采用 **Dense + Sparse 混合检索**：一次查询同时走两条路，再融合分数。

```python
# Milvus 内部自动融合 Dense 和 Sparse 的分数
# Dense 找到语义相近的，Sparse 找到关键词精确匹配的
# 融合后取 Top-K，兼顾"语义"和"精确"
```

为什么企业知识库需要混合检索？
- 制度文档里有很多**精确术语**（"VPN""报销""考勤"），需要 Sparse 精确匹配
- 员工提问方式多样（"上不了外网怎么办"），需要 Dense 语义匹配
- 两者结合才能兼顾召回率和准确率

## 四、Reranker（重排器）

混合检索返回的 Top-K 结果，需要进一步精细排序——这就是 **Reranker** 的职责。

### 4.1 Bi-Encoder 与 CrossEncoder

| 类型 | 做法 | 特点 |
|---|---|---|
| **Bi-Encoder**（Embedding/向量检索用） | 问题和文档各自编码成向量，算相似度 | 快，适合大规模候选集 |
| **CrossEncoder**（Reranker 用） | 把"问题+文档"拼接一起输入模型，直接输出相关度分数 | 慢，但更精准，适合小规模精排 |

本项目用 **BGE Reranker Large**（CrossEncoder 架构），对混合检索召回的结果做**精细重排**。

### 4.2 在流程中的位置

```
混合检索（Dense+Sparse，召回 Top-30） → Reranker（精排，取 Top-5） → 上下文构建
```

先粗召回（保证不漏），再精排（保证准），是工业级 RAG 的标准做法。

## 五、在本项目中的体现（完整检索链路）

企业知识库场景下，一次提问的检索链路：

```
用户提问
  → 意图识别（是制度查询？闲聊？费用咨询？）
  → 检索计划（FAQ 直出 or 查文档全文）
  → 查询向量化（BGE-M3 embed_query）
  → Milvus 混合检索（Dense + BM25，按 source/版本/权限过滤）
  → BGE Reranker 重排（Top-5）
  → 上下文构建（拼接检索片段）
  → LLM 生成答案（DashScope 流式）
```

## 六、重点掌握

1. **Embedding**：文本 → 向量，语义相近则向量相近
2. **Dense 检索**：语义匹配，适合多样化提问
3. **Sparse 检索（BM25）**：关键词精确匹配，适合术语/编号
4. **Hybrid Search**：两者结合，企业知识库标配
5. **Reranker**：CrossEncoder 精排，从召回集中挑最优

---

**本篇小结**：理解了 Embedding、向量检索、混合检索、Reranker 四个概念，就理解了 RAG 检索的底层逻辑。下一篇讲 RAG 系统的完整组成（离线/在线两条链路）。
