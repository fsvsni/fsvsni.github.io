---
title: "系列一·第12篇 QAService 编排：服务门面"
date: 2026-08-27 17:50:00
series_group: 1
series_order: 12
tags:
  - RAG
  - QAService
  - 服务编排
categories:
  - 企业知识库 RAG
---

> 对应课件：第 9 讲 QAService 核心编排
> 本篇目标：讲清企业知识库的**服务编排层（QAService）**——它是所有问答请求的"门面"，如何统一入口、如何用 Generator 模式实现流式输出。

## 一、什么是服务编排

**服务编排（Orchestration）** 是定义一个"门面"，把意图识别、检索、改写、生成、记忆等子模块**按顺序组织**成完整业务流程。

QAService 就是企业知识库问答的**统一业务入口**：API 路由只负责接请求，真正的业务流程由 QAService 编排。

## 二、QAService 不做什么（边界）

QAService **不做**：
- 不直接操作 HTTP/WebSocket（那是 API 层）
- 不做具体检索细节（那是 retrieval 层）
- 不写 Prompt（那是 prompts 层）

它只做一件事：**把各模块串成一条可运行的业务链路**。

## 三、QAService 的两个核心方法

| 方法 | 职责 | 用途 |
|---|---|---|
| `stream_query()` | 完整 RAG 链路（唯一主干） | 员工正常提问 → 流式回答 |
| `debug_retrieval()` | 检索诊断半链路（只查不生成） | 调试、评测召回质量 |

### 3.1 stream_query() — 唯一主干链路

```python
# qa_core/application/qa_service.py
def stream_query(self, session_id, query, scenario, data_scope):
    # 1. 历史加载
    history = self.memory.load(session_id)
    # 2. 意图识别
    intent = self.intent_classifier.classify(query, history)
    # 3. 改写（如需）
    query = self.rewriter.rewrite(query, history) if intent.requires_rewrite else query
    # 4. 检索计划
    plan = self.retrieval_planner.build(intent, scenario)
    # 5. 检索 + 重排
    docs = self.retriever.search(query, plan, data_scope)
    # 6. 上下文构建
    context = self.context_builder.build(docs)
    # 7. Prompt 选择
    prompt = self.prompt_selector.select(intent, scenario)
    # 8. 流式生成（Generator 逐事件产出）
    for event in self.generator.generate(query, context, prompt, history):
        yield event
```

### 3.2 debug_retrieval() — 检索诊断半链路

```python
def debug_retrieval(self, query, scenario, data_scope):
    # 只做检索，不生成
    plan = self.retrieval_planner.build(...)
    docs = self.retriever.search(query, plan, data_scope)
    return [{"content": d.page_content, "score": d.score, "source": d.metadata} for d in docs]
```

> **为什么需要 debug_retrieval**：回答质量差时，先看"是检索没召回，还是生成没用好"。把问题定位到环节。

### 3.3 source 白名单校验

```python
# 防止请求方指定越权 source
def _validate_source(self, requested_source, scenario):
    allowed = scenario.get_allowed_sources()   # 如 {"hr","it","finance"}
    if requested_source and requested_source not in allowed:
        raise SourceNotAllowedError(requested_source)
```

## 四、Generator 模式在 RAG 中的应用

### 4.1 什么是 Generator

**Generator** 是一个逐事件产出的生成器（yield），配合流式协议，把"检索到生成"的中间过程**逐步**推给前端。

### 4.2 为什么 RAG 适合用 Generator

- RAG 流程有多阶段（意图→检索→重排→生成），用户等待时可看到进度
- 答案可**流式输出**（逐字），体验好
- 中间事件（检索结果、引用）可实时展示，增强可解释性

### 4.3 前端接收到的体验

```
用户提问 →
  前端收到事件：
  1. {"type":"status","stage":"检索中..."}
  2. {"type":"candidate","docs":[...]}     # 检索到的制度片段
  3. {"type":"token","content":"报销超5000"} # 流式答案
  4. {"type":"citation","sources":[...]}    # 引用来源
  5. {"type":"done"}
```

## 五、应用工厂模式

### 5.1 get_qa_service() 工厂函数

```python
# qa_core/application/factory.py
def get_qa_service() -> QAService:
    """单例工厂：只初始化一次，全局复用"""
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

### 5.2 在 API 中使用

```python
# qa_core/api/chat.py
from qa_core.application.factory import get_qa_service

qa_service = get_qa_service()

@app.websocket("/api/chat")
async def chat(ws: WebSocket):
    await ws.accept()
    async for event in qa_service.stream_query(...):
        await ws.send_json(event)
```

> **工厂 + 单例**：依赖只初始化一次，避免每个请求重复创建模型/连接，性能和资源最优。

## 六、错误处理与事件协议

### 6.1 异常不抛给 WebSocket 路由

```python
# qa_core/pipeline/rag.py
try:
    for event in pipeline.run(query, ...):
        yield event
except Exception as e:
    # 转成错误事件，而不是让 WebSocket 断掉
    yield {"type": "error", "message": "系统繁忙，请稍后再试", "detail": str(e)}
```

> 用户感知：错误以事件形式返回，前端友好提示；后端记录 trace。

### 6.2 事件类型

| 事件类型 | 内容 |
|---|---|
| `status` | 阶段状态（检索中/生成中） |
| `candidate` | 检索候选（供展示/调试） |
| `token` | 流式答案片段 |
| `citation` | 引用来源 |
| `done` | 完成 |
| `error` | 错误 |

## 七、企业知识库场景的编排落点

```
员工问"入职流程有哪些步骤"
  → QAService.stream_query()
  → 意图识别(hr制度查询) → 改写(完整问题) → 检索计划(FAQ优先)
  → 混合检索(过滤 source=hr) → 重排
  → Prompt 选择(制度流程模板)
  → Generator 流式输出 + 引用
```

---

**本篇小结**：QAService 是问答的门面，统一编排各模块；Generator 模式让流式输出和过程可视化成为可能。下一篇深入 RAG 主流程的 8 个 Stage。
