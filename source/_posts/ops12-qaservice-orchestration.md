---
title: "系列二·第12篇 QAService 编排：四条链路的统一门面"
date: 2026-08-27 21:50:00
tags:
  - RAG
  - QAService
categories:
  - 设备运维 RAG
---

> 对应课件：第 9 讲 QAService 核心编排
> 本篇目标：从**设备运维**视角讲服务编排——QAService 如何统一管理四条链路（巡检/告警/维修/工单），如何用 Generator 实现流式输出。

## 一、QAService 的职责

QAService 是设备运维问答的**统一门面**：
- API 路由只接请求，不堆业务
- 业务编排在 QAService：意图 → 路由到对应链路 → 检索 → 生成

## 二、四条链路的统一入口

```python
def stream_query(self, session_id, query, scenario, data_scope):
    # 1. 历史加载
    history = self.memory.load(session_id)
    # 2. 意图识别 → 决定走哪条链路
    intent = self.intent_classifier.classify(query, history)
    # 3. 改写（如需）
    query = self.rewriter.rewrite(query, history) if intent.requires_rewrite else query
    # 4. 检索计划（按 route 选择 source）
    plan = self.retrieval_planner.build(intent, scenario)
    # 5. 检索 + 重排
    docs = self.retriever.search(query, plan, data_scope)
    # 6. 上下文构建
    context = self.context_builder.build(docs)
    # 7. Prompt 选择（巡检/告警/维修/工单模板）
    prompt = self.prompt_selector.select(intent, scenario)
    # 8. 流式生成（Generator 逐事件产出）
    for event in self.generator.generate(query, context, prompt, history):
        yield event
```

> 同一份编排代码处理四条链路，差异在**意图→计划→Prompt** 的选择上。

## 三、检索诊断链路（运维调试）

```python
def debug_retrieval(self, query, scenario, data_scope):
    plan = self.retrieval_planner.build(...)
    docs = self.retriever.search(query, plan, data_scope)
    return [{"content": d.page_content, "score": d.score, "metadata": d.metadata} for d in docs]
```

> 巡检员反馈"查不到"时，用 debug_retrieval 看检索到底召回什么，定位是召回问题还是生成问题。

## 四、Generator 模式在运维问答中的价值

### 4.1 运维问答的"过程可见"

告警处理是**紧急操作**，巡检员等待时希望看到进展：

```
巡检员问"空压机压力偏高怎么办" →
  {"type":"status","stage":"检索告警SOP..."}
  {"type":"candidate","docs":[...]}
  {"type":"token","content":"1.检查压力表校准"}
  {"type":"token","content":"2.检查管路泄漏"}
  {"type":"citation","sources":["空压机维护手册.pdf"]}
  {"type":"done"}
```

### 4.2 Generator 的好处

- **流式输出**：逐字显示，体验好、响应快
- **过程可见**：检索到哪个 source 一目了然
- **可中断**：前端可随时停止

## 五、source 白名单校验

```python
def _validate_source(self, requested_source, scenario):
    allowed = scenario.get_allowed_sources()   # 4 类 source
    if requested_source and requested_source not in allowed:
        raise SourceNotAllowedError(requested_source)
```

> 防止请求方指定越权 source（如让员工查某设备的机密维修记录）。

## 六、工厂 + 单例

```python
# qa_core/application/factory.py
def get_qa_service() -> QAService:
    if _instance is None:
        _instance = QAService(
            intent_classifier=get_intent_classifier(),
            retriever=get_retriever(),
            generator=get_generator(),
            memory=get_memory_store(),
            ...
        )
    return _instance
```

> 模型/连接只初始化一次，全局复用，避免每个请求重复加载。

## 七、错误处理

```python
try:
    for event in pipeline.run(query, ...):
        yield event
except Exception as e:
    yield {"type": "error", "message": "处理失败，请稍后再试", "detail": str(e)}
```

> 错误以事件返回，WebSocket 不断连；后端记录 trace。

## 八、设备运维场景的编排落点

```
巡检员问"日检异常怎么升级"
  → QAService.stream_query()
  → 意图识别(alarm/升级) → 改写(完整) → 检索计划(alarm+inspection)
  → 混合检索(过滤source+设备+版本) → 重排
  → Prompt 选择(告警升级模板)
  → Generator 流式输出升级步骤 + 引用
```

---

**本篇小结**：QAService 统一编排四条链路，Generator 模式让紧急告警咨询过程可见、流式快答。下一篇讲 RAG 主流程 8 阶段。
