---
title: "系列二·第15篇 FastAPI 接口层：运维问答的入口"
date: 2026-08-27 22:20:00
tags:
  - RAG
  - FastAPI
  - WebSocket
categories:
  - 设备运维 RAG
---

> 对应课件：第 12 讲 FastAPI 接口层实战
> 本篇目标：从**设备运维**视角讲接口层——FastAPI 路由如何组织、WebSocket 如何支撑紧急告警的流式咨询、启动生命周期怎么管理。

## 一、为什么 FastAPI 适合运维问答

- **WebSocket 流式**：告警咨询要"边等边看"，逐字输出处理步骤
- **异步高并发**：多台设备同时告警，多巡检员同时咨询
- **自动文档**：Swagger 便于运维系统接入

## 二、应用结构

```python
# qa_core/api/app.py
from fastapi import FastAPI

app = FastAPI(title="KnowForge RAG Platform - Equipment Ops")

app.include_router(health.router)
app.include_router(scenarios.router)
app.include_router(chat.router)
```

## 三、路由一览（运维版）

| 路由 | 类型 | 作用 |
|---|---|---|
| `GET /api/health` | HTTP | 健康检查 |
| `GET /api/scenarios` | HTTP | 场景列表（含 equipment_ops） |
| `GET /api/scenarios/equipment_ops/sources` | HTTP | 四类资料源 |
| `GET /api/chat/ws` | WS | 流式问答（主入口） |

## 四、WebSocket 流式问答

```python
@router.websocket("/api/chat/ws")
async def chat_ws(websocket: WebSocket):
    await websocket.accept()
    session_id = websocket.query_params.get("session_id", uuid4().hex)
    try:
        while True:
            data = await websocket.receive_json()
            query = data["query"]
            async for event in qa_service.stream_query(
                session_id=session_id,
                query=query,
                scenario_id=data.get("scenario_id", "equipment_ops"),
            ):
                await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
```

> 一次 WebSocket 连接可连续多轮咨询，`session_id` 关联多轮历史。

## 五、前端消费事件（运维版）

```js
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  switch (event.type) {
    case "status": showStatus(event.stage); break;    // "检索告警SOP..."
    case "candidate": showRetrieved(event.docs); break; // 展示召回的SOP片段
    case "token": appendText(event.content); break;     // 流式处理步骤
    case "citation": showSources(event.sources); break; // 引用来源
    case "done": stopLoading(); break;
  }
};
```

> 紧急告警时，巡检员能看到"检索到哪些 SOP""处理步骤逐条出现"，可信度更高。

## 六、启动生命周期

```python
@app.on_event("startup")
async def startup():
    await warm_up()   # 加载模型、连接 Milvus/MySQL
```

启动顺序：

```
加载配置 → 环境校验(preflight) → 加载模型 → 连接Milvus/MySQL/Redis → 启动FastAPI
```

> 模型/连接启动时加载，请求期直接复用，避免首请求慢。

## 七、运维系统接入

运维系统（告警平台、工单系统）可通过：
- **HTTP**：健康检查、场景配置查询
- **WebSocket**：嵌入式问答
- **Swagger**：`http://localhost:8000/docs` 查看/调试接口

---

**本篇小结**：FastAPI + WebSocket 支撑运维流式问答，一次连接多轮咨询，启动时预热依赖。下一篇讲启动自检。
