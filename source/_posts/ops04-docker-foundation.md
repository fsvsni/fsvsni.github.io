---
title: "系列二·第4篇 Docker 底座：运维系统的运行环境"
date: 2026-08-27 20:30:00
tags:
  - RAG
  - Docker
  - 环境搭建
categories:
  - 设备运维 RAG
---

> 对应课件：第 1 讲 第三部分（环境搭建与首次启动）
> 本篇目标：从设备运维项目角度讲清 Docker 底座——为什么用 Compose 管理依赖、怎么初始化 equipment_ops 场景、首次启动怎么验证。

## 一、设备运维系统依赖什么

设备运维 RAG 系统的运行依赖：

- **Milvus + etcd + MinIO**：存储巡检/告警/维修/工单的向量
- **MySQL**：运维咨询的多轮会话历史
- **Redis**：查询/检索/版本缓存
- **本地模型**：BGE-M3、BGE-Reranker、BERT 意图分类

手动逐个安装不现实，**Docker Compose 一条命令拉起**。

## 二、两种运行方式

| 方式 | API 位置 | 适用 |
|---|---|---|
| **Docker Compose** | API 也在容器 | 标准部署、环境复现 |
| **本机 API** | Python 在宿主机 | 高频改代码调试 |

首次学习用 Compose 方式。

## 三、准备配置与模型

```bash
# 创建环境配置（.env.compose）
cp .env.compose.example .env.compose   # 填 DashScope key、数据库密码

# 确认模型目录
test -d models/bge-m3
test -d models/bge-reranker-large
test -d models/bert_intent_classifier_v1
```

设备运维场景的数据安全要求高（设备数据敏感），**模型本地部署、数据不出内网**是硬约束。

## 四、最小启动流程

```bash
# 1. 启动基础设施
docker compose --env-file .env.compose up -d mysql redis etcd minio milvus

# 2. 首次构建基础镜像（如无）
docker build -f Dockerfile.base -t localhost/knowforge-rag-platform-base:py312 .

# 3. 构建 API
docker compose --env-file .env.compose build api

# 4. 初始化并激活八个业务场景（含 equipment_ops）
docker compose --env-file .env.compose run --rm api python scripts/rebuild_scenarios.py \
  --reset-collections --description "docker init all scenarios"

# 5. 启动 API
docker compose --env-file .env.compose up -d api

# 6. 验证
docker compose --env-file .env.compose ps
```

> 第 4 步是关键：`rebuild_scenarios.py` 会为 8 个场景（含 equipment_ops）创建 Milvus collection。

## 五、验证 equipment_ops 场景就绪

```bash
# 查看场景列表，确认 equipment_ops 存在
curl http://localhost:8000/api/scenarios

# 查看 equipment_ops 的 4 个 source
curl http://localhost:8000/api/scenarios/equipment_ops/sources
# 应返回 inspection / alarm / repair / work_order
```

## 六、启动前置校验（Preflight）

启动时自动校验环境：

- **占位符检测**：.env 是否还是示例值
- **TCP 连接**：MySQL/Redis/Milvus 端口
- **模型路径**：三模型目录存在
- **LLM 探测**：DashScope key 有效

> 环境不对就拒绝启动，避免"假启动后运行时爆炸"。

## 七、设备运维场景的启动后动作

启动完成后，`equipment_ops` 场景：
- 在 Milvus 创建 inspection/alarm/repair/work_order 对应的 collection
- 等待巡检表、告警 SOP 等资料入库
- 巡检员即可开始提问

---

**本篇小结**：Docker Compose 拉起全部依赖，初始化 equipment_ops 场景，验证 4 个 source 就绪。下一篇讲 Embedding 在运维资料上的工程实践。
