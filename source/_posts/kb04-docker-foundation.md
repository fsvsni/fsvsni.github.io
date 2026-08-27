---
title: "系列一·第4篇 Docker 底座：让依赖一次跑起来"
date: 2026-08-27 16:30:00
tags:
  - RAG
  - Docker
  - 环境搭建
categories:
  - 企业知识库 RAG
---

> 对应课件：第 1 讲 第三部分（环境搭建与首次启动）
> 本篇目标：在企业知识库项目里，Docker/Compose 如何作为"运行底座"，把 API、MySQL、Redis、Milvus、etcd、MinIO 一整套依赖跑起来，并完成首次启动。

## 一、为什么需要 Docker 底座

企业知识库 RAG 系统依赖一大堆基础设施：

- **MySQL**：会话历史存储
- **Redis**：缓存（查询 embedding、检索结果、版本激活失效）
- **Milvus + etcd + MinIO**：向量数据库及其依赖（元数据、对象存储）

如果每个依赖都手动安装配置，环境搭建会非常痛苦，且不同机器表现不一致。**Docker Compose 统一管理**，一条命令拉起全部依赖，是标准做法。

## 二、两种运行方式

| 方式 | API 位置 | 基础设施 | 适用场景 |
|---|---|---|---|
| **Docker Compose** | API、MySQL、Redis、Milvus、etcd、MinIO 全在容器内 | Compose 统一管理 | 首次学习、标准部署、环境复现 |
| **本机 API** | Python API 在宿主机运行 | MySQL、Redis、Milvus 等仍用 Docker | 高频修改 Python 代码调试 |

首次运行优先选择 Docker Compose。容器之间通过**服务名**访问依赖（`mysql:3306`、`redis:6379`、`milvus:19530`）；宿主机调试则用 `localhost`。

## 三、准备配置和模型

### 3.1 创建环境配置

```powershell
# Windows PowerShell
if (!(Test-Path .env.compose)) { Copy-Item .env.compose.example .env.compose }
New-Item -ItemType Directory -Force models, logs, reports | Out-Null
```

```bash
# Linux Shell
cp -n .env.compose.example .env.compose
mkdir -p models logs reports
```

然后检查本地模型是否就位（**模型本地化部署，不需要下载**）：

```bash
test -d models/bge-m3               # Embedding 模型
test -d models/bge-reranker-large   # Reranker 模型
test -d models/bert_intent_classifier_v1  # BERT 意图分类模型
```

### 3.2 模型路径设计

宿主机模型目录统一用项目相对路径 `./models`，Compose 挂载到容器内 `/app/models`。这样 Windows 和 Linux 不需要在配置中写各自的绝对路径：

```ini
MODEL_VOLUME_HOST_PATH=./models
EMBEDDING_MODEL_PATH=/app/models/bge-m3
RERANKER_MODEL_PATH=/app/models/bge-reranker-large
INTENT_MODEL_PATH=/app/models/bert_intent_classifier_v1
```

然后在 `.env.compose` 中填写真实的 `DASHSCOPE_API_KEY`、数据库密码和管理令牌。

## 四、最小启动流程

```bash
# 1. 启动基础设施（MySQL、Redis、etcd、MinIO、Milvus）
docker compose --env-file .env.compose up -d mysql redis etcd minio milvus

# 2. 首次机器若没有项目基础镜像，先构建一次
docker build -f Dockerfile.base -t localhost/knowforge-rag-platform-base:py312 .

# 3. 构建 API
docker compose --env-file .env.compose build api

# 4. 初始化并激活八个业务场景
docker compose --env-file .env.compose run --rm api python scripts/rebuild_scenarios.py --reset-collections --description "docker init all scenarios"

# 5. 启动 API
docker compose --env-file .env.compose up -d api

# 6. 查看状态
docker compose --env-file .env.compose ps
docker compose --env-file .env.compose logs --tail 80 api
```

> `Dockerfile.base` 只在目标机器没有 `localhost/knowforge-rag-platform-base:py312` 时需要构建；已有该镜像时可跳过第 2 步。

### 启动流程的每一步在做什么

| 步骤 | 作用 |
|---|---|
| 1. 启动基础设施 | 拉起 MySQL/Redis/Milvus 等依赖 |
| 2. 构建基础镜像 | 安装 Python 3.12 基础依赖（一次性） |
| 3. 构建 API | 构建应用镜像 |
| 4. 初始化场景 | **关键**：重建 collection、初始化 8 个业务场景（含企业知识库） |
| 5. 启动 API | 正式运行服务 |
| 6. 查看状态 | 确认所有服务健康 |

## 五、访问与最小检查

启动后访问：

| 环境 | 地址 |
|---|---|
| API 文档（Swagger） | `http://localhost:8000/docs` |
| 前端页面 | `http://localhost:8000/` |
| Milvus 管理 | 通过 API 的健康检查确认 |

最小检查：

```bash
# 检查 API 是否正常响应
curl http://localhost:8000/api/health
# 查看场景列表（应能看到 enterprise_knowledge 等 8 个场景）
curl http://localhost:8000/api/scenarios
```

## 六、启动前置校验的工作机制

项目在启动时做了**环境前置校验**（preflight），确保"环境不对就绝不假启动"：

- `app.py`：FastAPI 应用入口，启动时执行校验
- `qa_core/config/preflight.py`：校验逻辑

校验内容大致包括：
1. **占位符检测**：`.env` 里是否还是示例占位值（如 `DASHSCOPE_API_KEY=xxx`）
2. **TCP 连接校验**：MySQL、Redis、Milvus 端口是否可连
3. **路径校验**：模型目录是否存在
4. **Milvus URI 校验**：向量库连接是否正常
5. **LLM 运行态探测**：DashScope API key 是否有效

> 这些校验在第 16 篇"启动自检"会详细展开。

## 七、企业知识库场景的落地

回到场景本身，Docker 底座启动后，`enterprise_knowledge` 场景会：
- 在 Milvus 中创建对应的 **Collection**（FAQ collection + Doc collection）
- 通过 `scenario.toml` 配置 hr/it/finance 三个 source
- 等待制度文档入库（第 19 篇"文档入库"详细讲）

## 八、重点掌握

1. **Compose 统一管理**：一条命令拉起全部依赖，环境可复现
2. **模型本地化**：`./models` 挂载，Windows/Linux 路径统一
3. **初始化场景**：`rebuild_scenarios.py` 创建 8 个场景的 collection
4. **preflight 校验**：启动前检查环境，避免假启动

---

**本篇小结**：Docker Compose 是项目的运行底座，一条命令拉起 MySQL/Redis/Milvus 等依赖，再初始化场景、启动 API。接下来进入 Embedding 原理的深入。
