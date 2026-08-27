---
title: "系列二·第20篇 质量评测：怎么证明处理方案是对的"
date: 2026-08-27 23:10:00
series_group: 2
series_order: 20
tags:
  - RAG
  - 质量评测
categories:
  - 设备运维 RAG
---

> 本篇目标：从**设备运维**视角讲质量评测——怎么评测告警处理方案的准确性、运维评测集怎么构造、召回指标怎么算。

## 一、为什么运维评测尤其重要

设备运维回答**错了会出事故**：
- 告警升级路径说错 → 该升级的没升级
- 维修步骤缺失 → 工程师按错步骤操作
- 故障码匹配错 → 修错方向

必须用**数据驱动**评测，且形成回归机制。

## 二、运维评测闭环

```
构造运维评测集（巡检/告警/维修/工单真实问题）
  → 运行检索/生成
  → 记录上下文（问题、SOP片段、答案）
  → 计算指标（Recall/MRR/命中率）
  → LLM 评测（忠实度/完整性/安全性）
  → Bad Case 分析 → 改进 → 回归
```

## 三、运维评测集构造

```python
EVAL_SET = [
    # (问题, 期望召回 source, 期望关键点)
    ("日检异常怎么升级", "alarm", ["P0", "上报", "停机"]),
    ("空压机压力偏高怎么办", "repair", ["压力表", "管路", "报修"]),
    ("E-203 故障码什么意思", "repair", ["E-203", "故障原因"]),
    ("工单怎么创建", "work_order", ["创建", "填写"]),
    ("巡检项有哪些", "inspection", ["压力", "温度", "润滑"]),
]
```

> 关键点（期望答案包含的要素）用于规则评测。

## 四、上下文记录

```python
def record_context(session_id, query, pipeline_events, metadata):
    record = {
        "session_id": session_id,
        "query": query,
        "events": pipeline_events,
        "retrieved_docs": [...],
        "final_answer": ...,
        "metadata": {"sop_version": active_sop_version, "latency_ms": ...},
    }
    save_record(record)
```

> 任何回答可回放、可定位。

## 五、核心指标（运维版）

| 指标 | 含义 | 运维意义 |
|---|---|---|
| **Recall@K** | 相关 SOP 是否被召回 | 漏掉关键 SOP = 事故 |
| **MRR** | 第一个相关文档排位 | 排序靠后 = 看错文档 |
| **命中率** | 标准答案被召回 | 基本保障 |
| **关键点覆盖** | 答案含关键要素 | 步骤是否完整 |

```python
def compute_recall(docs, expected_source):
    hit = any(d.metadata["source"] == expected_source for d in docs)
    return 1.0 if hit else 0.0

def check_key_points(answer, key_points):
    return sum(1 for kp in key_points if kp in answer) / len(key_points)
```

## 六、LLM 评测（运维版）

```python
EVAL_PROMPT = """评估以下运维回答的质量：
【告警/SOP片段】...
【回答】...
评分维度（1-5）：
1. 忠实度：是否只依据SOP片段
2. 步骤完整性：处理步骤是否完整
3. 安全性：是否遗漏安全注意事项（停机/断电等）
4. 幻觉：是否有片段外信息"""
```

> 运维评测必须包含**安全性**维度——漏掉"断电、挂牌"等安全提示是严重问题。

## 七、Bad Case 分析

```
评测发现"E-203"回答错误
  → 回放上下文 → 发现检索未命中 fault_code=E-203
  → 定位：BM25 sparse 权重太低
  → 改进：提高 sparse_weight + 补 FAQ
  → 回归验证
```

## 八、运维场景的评测示例

```
评测集 40 题（巡检10/告警10/维修10/工单10）
  → 检索：Recall@5 = 0.85, MRR = 0.70
  → 生成：忠实度 = 0.88, 安全分 = 0.95, 关键点覆盖 = 0.82
  → Bad Case：5个（告警升级路径缺 P0 细节）
  → 改进：告警模板强化 P0 细节 + 检索宽召回
  → 回归：安全分 = 0.98
```

---

**本篇小结**：运维评测用"召回指标 + 关键点覆盖 + 安全性维度"，保证告警/维修方案准确、完整、安全。下一篇讲测试策略。
