---
title: "系列二·第22篇 可观测性：告警处理出问题能追得到"
date: 2026-08-27 23:30:00
series_group: 2
series_order: 22
tags:
  - RAG
  - 可观测
categories:
  - 设备运维 RAG
---

> 对应课件：第 19 讲 可观测性与持续改进
> 本篇目标：从**设备运维**视角讲可观测体系——线上告警咨询出错时，怎么回放完整过程、怎么追踪性能、怎么沉淀 Bad Case。

## 一、为什么运维可观测是硬需求

线上巡检员问"P0 告警怎么办"，回答错了处理步骤。必须能回答：
- 检索到了哪些 SOP？
- 用了哪个版本？
- 告警等级被正确识别了吗？
- 哪个阶段慢？

**可观测 = 每个运维回答可回放、可定位、可改进**。

## 二、可观测三层

| 层 | 内容 |
|---|---|
| **日志** | 结构化日志 |
| **追踪** | 单次请求完整链路（各阶段耗时） |
| **评测** | 质量指标 + Bad Case 沉淀 |

## 三、追踪：一次告警咨询的链路

```python
with Timer() as t:
    docs = retriever.search(...)
log.info("retrieval_latency_ms=%s", t.elapsed_ms)
```

```json
{
  "session_id": "sess_007",
  "query": "P0 告警：空压机超压",
  "trace_id": "tr_xyz",
  "intent_route": "alarm",
  "alarm_level": "P0",
  "sop_version": "sop_2026v3",
  "stages": {"intent": 2.0, "retrieval": 38.0, "rerank": 10.0, "first_token": 350.0},
  "retrieved_sources": ["alarm", "inspection"]
}
```

> 一眼看出：告警等级识别是否对、版本是否最新、哪个阶段慢。

## 四、结构化日志

```python
def search(query, plan, scope):
    logger.info("search_start", extra={
        "query": query, "sources": plan.sources, "scope": scope.summary()
    })
    docs = do_search(query, plan, scope)
    logger.info("search_done", extra={"hit_count": len(docs), "sources": ...})
```

## 五、Bad Case 沉淀与改进闭环

```python
def add_bad_case(query, answer, retrieved_docs, feedback):
    bad_case = {
        "query": query, "answer": answer,
        "retrieved": [d.page_content for d in retrieved_docs],
        "feedback": feedback,
        "time": now(),
    }
    bad_cases.append(bad_case)
```

```
线上 Bad Case（如"E-203"回答错）
  → 回放（上下文记录）
  → 归类（检索没召回 / 排序靠后 / 生成幻觉）
  → 定位（debug_retrieval）
  → 改进（调检索/补FAQ/改Prompt）
  → 补进评测集 → 回归
```

> **评测集是活的**：Bad Case 不断补充，系统越用越准。

## 六、运维性能监控指标

| 指标 | 含义 |
|---|---|
| P50/P95 延迟 | 回答耗时分布 |
| 首 token 延迟 | 紧急告警等待时长 |
| 检索耗时 | 检索阶段 |
| 缓存命中率 | 高频告警问题缓存 |
| 告警链路错误率 | 关键链路健康度 |

```python
def check_latency(alerts):
    if p95_latency > 3000:
        alerts.raise_alert("p95_latency_high", p95_latency)
```

## 七、安全与质量监控

| 监控 | 意义 |
|---|---|
| 高危操作回答是否带安全提示 | 防安全事故 |
| 幻觉率 | 是否编造处理步骤 |
| 告警等级识别准确率 | 升级路径正确性 |

> 运维可观测除了性能，还要监控**安全和准确性**——这是运维场景的独特维度。

## 八、运维场景的可观测落点

- 巡检员反馈"P0 处理步骤不对" → 回放 → 发现版本还是旧 SOP → 修复激活
- "E-203"回答错误 → 沉淀 Bad Case → 修复检索 → 回归
- 告警链路延迟高 → 追踪 → 发现 LLM 首 token 慢 → 优化

---

**本篇小结**：可观测体系（日志+追踪+评测+Bad Case）让每个运维回答可回放、可定位、可改进，并额外监控安全与准确性。最后一篇 Docker 交付与总结。
