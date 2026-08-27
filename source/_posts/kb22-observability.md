---
title: "系列一·第22篇 可观测性：线上出问题能查得到"
date: 2026-08-27 19:30:00
series_group: 1
series_order: 22
tags:
  - RAG
  - 可观测
  - 追踪
categories:
  - 企业知识库 RAG
---

> 对应课件：第 19 讲 可观测性与持续改进
> 本篇目标：讲清企业知识库的**可观测体系**——线上回答出错时，怎么回放完整过程、怎么追踪性能、怎么沉淀 Bad Case 持续改进。

## 一、为什么可观测性是硬需求

线上用户问"报销多少"，回答错了。怎么查？
- 检索到了什么？
- 用了哪个版本？
- LLM 输出前发生了什么？
- 哪个阶段慢？

没有可观测体系，这些问题无法回答。**可观测 = 让每个回答都可回放、可定位、可改进**。

## 二、可观测的三层

| 层 | 内容 |
|---|---|
| **日志（Logging）** | 结构化日志，记录关键事件 |
| **追踪（Tracing）** | 单次请求的完整链路（各阶段耗时） |
| **评测（Evaluation）** | 质量指标 + Bad Case 沉淀 |

## 三、追踪：一次回答的完整链路

### 3.1 阶段计时

```python
# qa_core/pipeline/runtime.py
class Timer:
    def __enter__(self):
        self.start = time.perf_counter()
        return self
    def __exit__(self, *args):
        self.elapsed_ms = (time.perf_counter() - self.start) * 1000

# 使用
with Timer() as t:
    docs = retriever.search(...)
log.info("retrieval_latency_ms=%s", t.elapsed_ms)
```

### 3.2 追踪数据样例

```json
{
  "session_id": "sess_001",
  "query": "报销超5000谁审批",
  "trace_id": "tr_abc123",
  "stages": {
    "intent": 2.1,
    "rewrite": 0,
    "retrieval": 45.6,
    "rerank": 12.3,
    "generate_first_token": 380.0
  },
  "kb_version": "kb_2026v3",
  "retrieved_count": 5
}
```

> 一眼看出哪个阶段慢（如 generate_first_token 380ms → LLM 首 token 延迟）。

## 四、结构化日志

```python
import logging
logger = logging.getLogger("qa_core")

def search(query, plan, scope):
    logger.info("search_start", extra={
        "query": query, "plan": plan.summary(), "scope": scope.summary()
    })
    docs = do_search(query, plan, scope)
    logger.info("search_done", extra={
        "hit_count": len(docs), "top_sources": [d.metadata["source"] for d in docs[:3]]
    })
```

> 结构化日志（key-value）便于检索、聚合、告警。

## 五、质量评测与 Bad Case 沉淀

### 5.1 上下文记录复用

```python
# qa_core/observability/context_recorder.py
def record_context(session_id, query, pipeline_events, metadata):
    record = {...}   # 记录完整过程
    save_record(record)
```

### 5.2 Bad Case 从线上沉淀

线上回答被用户反馈"不对"，或评测发现低分 → 沉淀为 Bad Case：

```python
def add_bad_case(query, answer, retrieved_docs, feedback):
    bad_case = {
        "query": query,
        "answer": answer,
        "retrieved": [d.page_content for d in retrieved_docs],
        "feedback": feedback,   # 用户反馈 / 评测低分原因
        "time": now(),
    }
    bad_cases.append(bad_case)  # 进入待分析池
```

### 5.3 Bad Case 改进闭环

```
线上 Bad Case
  → 回放（上下文记录）
  → 归类（检索/排序/生成/切分）
  → 定位（debug_retrieval）
  → 改进（参数/Prompt/FAQ/切分）
  → 补进评测集 → 回归
```

> **评测集是活的**：Bad Case 不断补充进评测集，让系统越用越准。

## 六、性能监控

### 6.1 关键指标

| 指标 | 含义 |
|---|---|
| P50/P95 延迟 | 回答耗时分布 |
| 首 token 延迟 | 用户体验关键 |
| 检索耗时 | 检索阶段 |
| 缓存命中率 | 缓存是否有效 |
| 错误率 | 事件 error 占比 |

### 6.2 告警

```python
def check_latency(alerts):
    if p95_latency > 3000:      # P95 > 3秒
        alerts.raise_alert("p95_latency_high", p95_latency)
```

## 七、评测报告与周报

```python
def generate_report():
    return {
        "period": "本周",
        "queries": 1200,
        "p95_latency_ms": 1800,
        "error_rate": 0.01,
        "retrieval_recall": 0.87,
        "bad_cases": 12,
        "top_issue": "表格类问题召回率低",
    }
```

> 定期报告让质量趋势可见，改进有据。

## 八、企业知识库场景的可观测落点

- 员工问"报销超5000" → 追踪记录检索/生成耗时 + 版本
- 回答引用错误制度 → 回放上下文 → 发现是版本切换缓存问题 → 修复
- 表格类问题总召回低 → 沉淀 Bad Case → 改进表格切分 → 回归

---

**本篇小结**：可观测体系（日志 + 追踪 + 评测 + Bad Case）让每个回答可回放、可定位、可改进，驱动系统持续变准。最后一篇讲 Docker 交付与系列一总结。
