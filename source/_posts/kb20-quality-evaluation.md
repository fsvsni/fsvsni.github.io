---
title: "系列一·第20篇 质量评测：怎么证明问答是准的"
date: 2026-08-27 19:10:00
tags:
  - RAG
  - 质量评测
  - 评估指标
categories:
  - 企业知识库 RAG
---

> 对应课件：第 17 讲 数据驱动评测与质量回归
> 本篇目标：讲清企业知识库的**质量评测体系**——怎么证明系统"答得准"，上下文怎么记录，指标怎么算，评测怎么自动化。

## 一、为什么需要质量评测

"系统能跑"不等于"系统答得准"。企业知识库回答错了制度内容会误导员工。必须用**数据驱动**的方式评测回答质量，并形成**回归**机制防止质量回退。

## 二、评测闭环总览

```
构造评测集（场景真实问题 + 期望答案）
  → 运行检索/生成
  → 记录上下文（问题、检索片段、答案、元数据）
  → 计算指标（Recall / MRR / 命中率）
  → 自动评测（LLM 评测 or 规则）
  → Bad Case 分析 → 改进 → 回归
```

## 三、上下文记录（Context Recording）

### 3.1 为什么记录上下文

要评测"为什么答成这样"，必须**可复现**每一次回答的完整过程。

### 3.2 记录内容

```python
# qa_core/observability/context_recorder.py
def record_context(session_id, query, pipeline_events, metadata):
    record = {
        "session_id": session_id,
        "query": query,
        "events": pipeline_events,      # 各阶段事件
        "retrieved_docs": [...],        # 检索到的文档
        "final_answer": ...,
        "metadata": {                   # 版本、source、耗时
            "kb_version": active_version,
            "source": ...,
            "latency_ms": ...,
        },
    }
    save_record(record)   # 存库/文件
```

> 有了上下文记录，任何回答都能回放、定位问题。

## 四、核心指标

### 4.1 检索质量指标

| 指标 | 含义 | 计算 |
|---|---|---|
| **Recall@K** | Top-K 里有多少是相关文档 | 相关文档命中数 / 总相关文档数 |
| **MRR** | 第一个相关文档的排位倒数均值 | 1/rank 取均值 |
| **命中率** | 标准答案是否被召回 | 布尔 |

### 4.2 计算示例（Recall / MRR）

```python
# 评测集里有一个标准答案文档 D
# 检索 Top-5：D 排在第 2 位
# Recall@5 = 1/1 = 1.0（D 被召回了）
# MRR = 1/2 = 0.5（第一个相关文档在第2位）

# 若 D 没被召回：
# Recall@5 = 0, MRR = 0
```

### 4.3 生成质量指标

- **LLM 评测**：让 LLM 判断答案是否"忠实于检索片段、无幻觉、覆盖关键点"
- **规则评测**：答案是否包含关键实体（金额、流程步骤）

## 五、自动评测工具

### 5.1 评测入口

```bash
# 运行质量评测（用评测集 + 真实场景）
python scripts/eval_pipeline.py --scenario enterprise_knowledge
```

### 5.2 评测流程

```python
# scripts/eval_pipeline.py
def run_eval(scenario_id, eval_set):
    results = []
    for case in eval_set:
        # 用 debug_retrieval 评测检索
        docs = qa_service.debug_retrieval(case.query, ...)
        recall = compute_recall(docs, case.expected_docs)
        mrr = compute_mrr(docs, case.expected_docs)
        # 用 stream_query 评测生成
        answer = qa_service.stream_query(case.query, ...)
        score = llm_eval(case, answer)
        results.append({...})
    return summarize(results)
```

### 5.3 评测报告

```
场景: enterprise_knowledge  评测集: 40题
检索: Recall@5 = 0.875, MRR = 0.72
生成: 忠实度 = 0.90, 覆盖率 = 0.85
Bad Case: 4 个（来源：表格类问题）
```

## 六、LLM 评测 Prompt

让 LLM 打分时，Prompt 要明确维度：

```text
请评估以下回答是否忠实于给定制度片段：
【制度片段】...
【回答】...
评分维度（1-5）：
1. 忠实度：是否只依据片段内容
2. 完整性：是否覆盖问题关键点
3. 幻觉：是否有片段之外的信息
```

> 评测本身也是 Prompt 工程，要**可复现、可校准**。

## 七、Bad Case 分析与改进循环

```
评测发现 Bad Case
  → 归类（检索没召回 / 排序靠后 / 生成幻觉 / 切分问题）
  → 定位环节（debug_retrieval 帮忙区分）
  → 改进（调检索参数 / 改切分 / 改Prompt / 补FAQ）
  → 回归验证
```

## 八、企业知识库场景的评测示例

```
评测集：
Q1: "入职流程有哪些步骤" → 期望召回 hr/入职流程文档
Q2: "报销超5000谁审批" → 期望召回 finance/报销制度
Q3: "VPN连不上怎么办" → 期望召回 it/FAQ

运行评测 → Recall/MRR 指标 → 发现 Q3 召回率低
  → 分析：FAQ 检索参数过严
  → 调整 faq_top_k → 回归 → 通过
```

---

**本篇小结**：数据驱动评测（上下文记录 + Recall/MRR + LLM 评测 + Bad Case 循环）让"答得准"可量化、可回归。下一篇讲测试策略。
