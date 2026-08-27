---
title: "系列一·第23篇 Docker 交付与系列总结：从课程到企业知识库"
date: 2026-08-27 19:40:00
series_group: 1
series_order: 23
tags:
  - RAG
  - Docker
  - 交付
  - 系列总结
categories:
  - 企业知识库 RAG
---

> 对应课件：第 20 讲 Docker 交付与部署上线 + 全课总结
> 本篇目标：讲清企业知识库的**生产化交付**，并复盘整个系列一的知识脉络，形成一张可用的"学习地图"。

## 一、从开发到交付：Docker 的角色

前面讲了项目怎么构建，但**怎么交付给别人用**是另一件事。Docker 解决"环境一致性"：

- 开发机上能跑 → 交付机上也该能跑
- 依赖（MySQL/Milvus/模型）打包编排
- 一条命令拉起全部

## 二、Compose 生产化要点

### 2.1 服务清单

```yaml
# docker-compose.yml（核心服务）
services:
  api:        # 应用
  mysql:      # 会话历史
  redis:      # 缓存
  etcd:       # Milvus 依赖（元数据）
  minio:      # Milvus 依赖（对象存储）
  milvus:     # 向量数据库
```

### 2.2 配置与安全

```yaml
services:
  api:
    env_file:
      - .env.compose        # 环境变量（密钥、模型路径）
    volumes:
      - ./models:/app/models   # 模型目录挂载
      - ./logs:/app/logs       # 日志持久化
      - ./reports:/app/reports # 评测报告
    ports:
      - "8000:8000"
```

| 注意点 | 说明 |
|---|---|
| **密钥走 env** | 不写死在镜像 |
| **数据卷持久化** | 日志/报告/模型不随容器消失 |
| **本地绑定 127.0.0.1** | 依赖不暴露公网 |
| **健康检查** | Compose healthcheck 探活 |

### 2.3 健康检查

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

> Compose 会等待依赖健康后再启动 api，避免启动顺序问题。

## 三、镜像分层与构建优化

### 3.1 分层思想

Docker 镜像按层构建，**改动少的层放前面**，复用缓存：

```dockerfile
# 依赖层（改动少）→ 代码层（改动多）
FROM python:3.12-slim AS base
COPY requirements.txt /app/
RUN pip install -r requirements.txt    # 依赖层，复用

COPY qa_core/ /app/qa_core/           # 代码层，常变
```

### 3.2 基础镜像

```bash
# 首次构建基础镜像（含 Python 3.12 基础依赖）
docker build -f Dockerfile.base -t localhost/knowforge-rag-platform-base:py312 .
```

> 已有基础镜像的机器可跳过重复构建，加速交付。

## 四、一键部署流程回顾

```bash
# 1. 准备配置和模型
cp .env.compose.example .env.compose   # 填 key/密码

# 2. 启动基础设施
docker compose --env-file .env.compose up -d mysql redis etcd minio milvus

# 3. 构建 API
docker compose --env-file .env.compose build api

# 4. 初始化并激活八个业务场景
docker compose --env-file .env.compose run --rm api python scripts/rebuild_scenarios.py \
  --reset-collections --description "init all scenarios"

# 5. 启动 API
docker compose --env-file .env.compose up -d api

# 6. 验证
curl http://localhost:8000/api/health
curl http://localhost:8000/api/scenarios   # 应看到 enterprise_knowledge 等 8 个场景
```

## 五、交付验证清单

| 验证项 | 方法 |
|---|---|
| 服务健康 | `GET /api/health` 全 ok |
| 场景就绪 | `GET /api/scenarios` 含 8 场景 |
| 检索可用 | `debug_retrieval("报销超5000谁审批")` 返回 finance 文档 |
| 流式问答 | WebSocket 发问，收到 token 事件 |
| 数据隔离 | 越权查询返回"未找到" |
| 版本正确 | 激活 v3 后检索到 v3 |

## 六、八大业务场景 → 两套学习笔记

整套课件覆盖八大业务场景：enterprise_knowledge、saas_support、equipment_ops、compliance_qa、cross_border_risk、tender_contract_risk、insurance_claims、engineering_project_qa。

本系列（系列一）聚焦 **enterprise_knowledge（企业知识库）**；另一套系列二聚焦 **equipment_ops（设备运维）**。两套笔记共享同一套技术底座，但场景配置、资料形态、典型问题各不相同。

## 七、系列一：23 篇学习地图复盘

| 阶段 | 篇章 | 主题 |
|---|---|---|
| 入门 | kb01~02 | 场景设定 / RAG 核心概念 |
| 底座 | kb03~04 | 系统架构 / Docker 底座 |
| 核心 | kb05~07 | Embedding / LangChain / Milvus |
| 检索 | kb08~11 | 意图分类 / 检索计划 / 改写 / 混合检索 |
| 流程 | kb12~13 | QAService / RAG 主流程 |
| 工程 | kb14~16 | Prompt / FastAPI / 启动自检 |
| 治理 | kb17~19 | 版本管理 / 数据隔离 / 文档入库 |
| 质量 | kb20~22 | 质量评测 / 测试 / 可观测 |
| 交付 | kb23 | Docker 交付 / 总结 |

## 八、系列一核心结论

1. **RAG 不是"向量检索 + LLM"一句话**：完整工程含意图、检索计划、混合检索、重排、上下文、Prompt、版本、隔离、评测、测试、可观测
2. **企业场景的三条红线**：数据隔离（检索层过滤）、版本正确（激活+缓存失效）、防幻觉（信息不足兜底）
3. **工程化靠闭环**：评测 → Bad Case → 改进 → 回归，系统越用越准
4. **用生态但不被绑架**：LangChain 当工具箱，核心流程自研

---

**系列一完**：从场景设定到 Docker 交付，企业知识库 RAG 的完整工程脉络已经打通。下一篇（系列二第1篇）进入第二个业务场景——设备运维。
