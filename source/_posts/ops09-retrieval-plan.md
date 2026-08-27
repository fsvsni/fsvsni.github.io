---
title: "系列二·第9篇 检索策略：告警问题怎么查、查多少"
date: 2026-08-27 21:20:00
series_group: 2
series_order: 9
tags:
  - RAG
  - 检索策略
  - RetrievalPlan
categories:
  - 设备运维 RAG
---

> 对应课件：第 6 讲 检索策略与动态计划
> 本篇目标：从**设备运维**视角讲检索计划（RetrievalPlan）——系统如何根据问题类型动态决定查哪个 source、查多少、怎么查。

## 一、RetrievalPlan 在运维中回答什么

运维场景的检索计划回答：

1. **查哪个 source**：inspection？alarm？repair？work_order？组合？
2. **查多少**：Top-K 取多少
3. **怎么查**：Dense/Sparse 权重、是否查询变体
4. **过滤什么**：source、设备、故障码、告警等级、版本

```
意图识别结果 → build_retrieval_plan() → RetrievalPlan → 检索执行
```

## 二、运维场景的检索倾向

| 问题类型 | 检索倾向 | 参数特点 |
|---|---|---|
| 巡检类 | inspection 优先 | inspection topk 大 |
| 告警类 | alarm 优先 + 升级路径 | alarm topk 大，跨 inspection |
| 维修类 | repair 优先 + 故障码 | repair topk 大 |
| 工单类 | work_order 优先 | work_order topk 大 |
| 升级类 | alarm + inspection 跨查 | 宽召回 |

## 三、检索计划生成（运维版）

```python
def build_retrieval_plan(intent_result, scenario):
    plan = RetrievalPlan.default()
    if intent_result.route == "inspection":
        plan = plan.with_source_priority("inspection")
    elif intent_result.route == "alarm":
        plan = plan.with_source_priority("alarm")
        plan = plan.include_source("inspection")   # 升级路径跨查巡检
    elif intent_result.route == "repair":
        plan = plan.with_source_priority("repair")
        plan = plan.include_source("work_order")   # 配件更换跨查工单
    elif intent_result.route == "work_order":
        plan = plan.with_source_priority("work_order")
    if intent_result.confidence < THRESHOLD:
        plan = plan.widen_recall()   # 低置信度 → 宽召回
    return plan
```

## 四、告警问题的检索计划（重点）

告警问题**时效性强、要准确**：

```python
def build_alarm_plan(intent):
    return RetrievalPlan(
        sources=["alarm", "inspection"],   # 告警 SOP + 巡检记录
        alarm_level_filter=intent.alarm_level,  # P0 过滤（如可推断）
        faq_top_k=3,
        doc_top_k=8,           # 宽召回，别漏
        dense_weight=0.7,
        sparse_weight=0.3,
        use_query_variants=True,  # 生成变体提高召回
    )
```

> 告警问题宁可多查（宽召回），也不能漏掉关键 SOP——漏了就是处理事故。

## 五、风险类别（运维版）

| 风险类别 | 处理 |
|---|---|
| **P0 高危告警** | 强制宽召回 + 严格 Prompt（立即停机类） |
| **普通故障** | 常规检索 |
| **操作类**（停机、拆机） | 提示需工程师确认 |

> 涉及**安全操作**（停机、断电）的回答要特别谨慎，Prompt 强调"仅作参考，操作需专业人员确认"。

## 六、五类问题的参数体感（运维版）

| 问题 | 检索倾向 | 参数 |
|---|---|---|
| "巡检项有哪些" | inspection 优先 | inspection topk=5 |
| "日检异常怎么升级" | alarm + inspection | doc topk=8 |
| "E-203 故障码" | repair 优先 + 故障码过滤 | repair topk=5 |
| "工单怎么关闭" | work_order 优先 | work_order topk=5 |
| "配件更换流程" | repair + work_order | 宽召回 |

## 七、参数怎么从评测落到配置

评测不同参数组合的 Recall/MRR（第 20 篇），把表现好的固化到检索计划：

- 告警问题 doc_top_k 从 5 → 8 提升 Recall → 固化
- 巡检问题 dense_weight 从 0.7 → 0.8 提升 MRR → 固化

## 八、检索计划测试（运维版）

```python
def test_alarm_query_gets_wider_recall():
    intent = IntentResult(route="alarm", ...)
    plan = build_retrieval_plan(intent, scenario)
    assert "alarm" in plan.sources
    assert plan.doc_top_k > DEFAULT_TOP_K
```

---

**本篇小结**：检索计划让巡检/告警/维修/工单问题各查各的、按需宽召回。告警问题宁可多查不漏。下一篇讲多轮追问的查询改写。
