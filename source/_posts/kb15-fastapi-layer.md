---
title: "系列一·第15篇 FastAPI 接口层：HTTP 与 WebSocket"
date: 2026-08-27 18:20:00
series_group: 1
series_order: 15
tags:
  - RAG
  - FastAPI
  - WebSocket
categories:
  - 企业知识库 RAG
---

> 对应课件：12 FastAPI 与异步 Web 框架
> 本篇目标：讲清企业知识库的**接口层**——FastAPI 应用如何组织、HTTP 路由提供什么、WebSocket 如何实现流式问答、启动生命周期怎么管理。

## 一、为什么用 FastAPI

| 需求 | FastAPI 的支持 |
|---|---|
| 异步/流式 | 原生 async + WebSocket |
| API 文档 | 自动生成 Swagger/OpenAPI |
| 类型校验 | Pydantic 自动校验请求 |
| 性能 | 高并发异步处理 |

企业知识库的"流式逐字回答"是核心体验，WebSocket 是 FastAPI 的强项。

## 二、应用结构：单应用多路由

```python
# qa_core/api/app.py
from fastapi import FastAPI
from qa_core.api import health, scenarios, chat

app = FastAPI(title="KnowForge RAG Platform")

app.include_router(health.router)
app.include_router(scenarios.router)
app.include_router(chat.router)
```

**单应用、多路由**：健康检查、场景管理、问答聊天都是同一个 FastAPI 应用的路由。

## 三、路由一览

| 路由 | 类型 | 作用 |
|---|---|---|
| `GET /api/health` | HTTP | 健康检查 |
| `GET /api/scenarios` | HTTP | 列出 8 个业务场景 |
| `GET /api/scenarios/{id}` | HTTP | 场景详情 |
| `GET /api/scenarios/{id}/sources` | HTTP | 场景资料源 |
| `POST /api/chat`（可选） | HTTP | 非流式问答（演示） |
| `GET /api/chat/ws`（WebSocket） | WS | 流式问答（主入口） |

### 3.1 健康检查路由

```python
# qa_core/api/health.py
@router.get("/api/health")
def health():
    return {
        "status": "ok",
        "services": {
            "mysql": check_mysql(),
            "milvus": check_milvus(),
            "redis": check_redis(),
        },
    }
```

> 健康检查聚合下游依赖状态，运维/前端轮询确认服务可用。

### 3.2 场景列表路由

```python
# qa_core/api/scenarios.py
@router.get("/api/scenarios")
def list_scenarios():
    return [s.summary() for s in scenarios.all()]
```

返回 8 个场景：enterprise_knowledge、saas_support、equipment_ops 等。

## 四、WebSocket 流式问答

### 4.1 为什么用 WebSocket

- HTTP 是"请求-响应"，一个答案要多次往返
- WebSocket 是**长连接**，服务端可**持续推送** token

### 4.2 实现

```python
# qa_core/api/chat.py
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
                scenario_id=data.get("scenario_id", "enterprise_knowledge"),
            ):
                await websocket.send_json(event)
    except WebSocketDisconnect:
        pass  # 客户端断开
```

### 4.3 关键点

| 点 | 说明 |
|---|---|
| `session_id` | 由前端传入或自动生成，关联多轮历史 |
| 事件循环 | `while True` 持续接收新问题，一次连接多轮对话 |
| 断开处理 | `WebSocketDisconnect` 优雅退出 |

## 五、启动生命周期

### 5.1 为什么不能等启动后再初始化

模型加载（BGE-M3）、Milvus 连接、MySQL 连接都耗时。如果每次请求才初始化，首请求会慢 + 资源浪费。

### 5.2 启动时加载依赖

```python
# qa_core/api/app.py
@app.on_event("startup")
async def startup():
    # 预热：加载模型、连接 Milvus/MySQL
    await warm_up()
```

> **Lifespan 预热**：启动时一次性加载模型/连接，请求期直接复用。

### 5.3 启动校验顺序

```
启动
  → 加载配置（.env）
  → 校验环境（preflight，见第16篇）
  → 加载模型（BGE-M3 / Reranker / BERT）
  → 连接 Milvus / MySQL / Redis
  → 启动 FastAPI
```

## 六、HTTP vs WebSocket 的选择

| 场景 | 用哪个 |
|---|---|
| 健康检查、场景列表 | HTTP（简单查询） |
| 流式问答（主体验） | WebSocket（持续推送） |
| 检索诊断调试 | HTTP（一次性返回） |

## 七、企业知识库场景的接口落点

```
前端页面
  → GET /api/scenarios 选择"企业知识库"
  → WS /api/chat/ws 建立连接
  → 发"报销超5000谁审批"
  → 后端流式返回 token + 引用
  → 前端实时渲染 + 显示来源
```

---

**本篇小结**：FastAPI 单应用多路由，HTTP 管健康/场景，WebSocket 管流式问答，启动生命周期预热依赖。下一篇讲启动自检，保证服务可靠启动。
