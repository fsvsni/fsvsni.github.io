---
title: "系列二·第23篇 Docker 交付与系列总结：从课程到设备运维"
date: 2026-08-27 23:40:00
tags:
  - RAG
  - Docker
  - 交付
  - 系列总结
categories:
  - 设备运维 RAG
---

> 对应课件：第 20 讲 Docker 交付与部署上线 + 全课总结
> 本篇目标：讲清设备运维项目的生产化交付，并复盘系列二的知识脉络，形成完整学习地图。

## 一、设备运维系统的交付

设备运维系统交付给工厂/运维部门时，Docker 保证环境一致性：

- 开发机能跑 → 交付机也能跑
- 依赖（MySQL/Milvus/模型）打包编排
- 一条命令拉起全部

## 二、Compose 生产化要点

### 2.1 服务清单

```yaml
services:
  api:      # 应用（四条链路）
  mysql:    # 运维咨询历史
  redis:    # 缓存（高频告警问题）
  etcd:     # Milvus 依赖
  minio:    # Milvus 依赖
  milvus:   # 四类运维资料向量
```

### 2.2 配置与安全

```yaml
services:
  api:
    env_file:
      - .env.compose
    volumes:
      - ./models:/app/models      # 模型（本地部署，数据不出内网）
      - ./logs:/app/logs
      - ./reports:/app/reports
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      retries: 3
```

| 注意点 | 说明 |
|---|---|
| 密钥走 env | 不写死在镜像 |
| 数据卷持久化 | 日志/报告/模型不随容器消失 |
| 本地绑定 127.0.0.1 | 依赖不暴露公网 |
| 健康检查 | Compose 等待依赖健康再启动 |

## 三、一键部署流程

```bash
# 1. 准备配置和模型
cp .env.compose.example .env.compose   # 填 key/密码

# 2. 启动基础设施
docker compose --env-file .env.compose up -d mysql redis etcd minio milvus

# 3. 构建 API
docker compose --env-file .env.compose build api

# 4. 初始化并激活八个业务场景（含 equipment_ops）
docker compose --env-file .env.compose run --rm api python scripts/rebuild_scenarios.py \
  --reset-collections --description "init all scenarios"

# 5. 启动 API
docker compose --env-file .env.compose up -d api

# 6. 验证
curl http://localhost:8000/api/health
curl http://localhost:8000/api/scenarios   # 含 equipment_ops
curl http://localhost:8000/api/scenarios/equipment_ops/sources  # 四类source
```

## 四、交付验证清单（运维版）

| 验证项 | 方法 |
|---|---|
| 服务健康 | `GET /api/health` 全 ok |
| 四类 source 就绪 | `GET /api/scenarios/equipment_ops/sources` |
| 告警检索 | `debug_retrieval("P0告警怎么处理")` 返回 alarm |
| 故障码检索 | `debug_retrieval("E-203")` 命中 fault_code=E-203 |
| 流式问答 | WebSocket 发问，收到 token 事件 |
| 安全提示 | 高危操作回答带"持证人员"提示 |
| 数据隔离 | 越权查询返回"未找到" |

## 五、镜像分层与构建

```dockerfile
FROM python:3.12-slim AS base
COPY requirements.txt /app/
RUN pip install -r requirements.txt     # 依赖层复用
COPY qa_core/ /app/qa_core/            # 代码层常变
```

```bash
# 首次构建基础镜像
docker build -f Dockerfile.base -t localhost/knowforge-rag-platform-base:py312 .
```

## 六、八大业务场景 → 两套学习笔记

整套课件覆盖八大业务场景。本项目两套学习笔记：
- **系列一**：enterprise_knowledge（企业知识库）— 23 篇
- **系列二**（本篇）：equipment_ops（设备运维）— 23 篇

两套共享同一套 RAG 技术底座（FastAPI + LangChain + Milvus + BGE-M3 + Reranker + DashScope），但场景配置、资料源、典型问题、Prompt、风险重点完全独立。

## 七、系列二：23 篇学习地图复盘

| 阶段 | 篇章 | 主题 |
|---|---|---|
| 入门 | ops01~02 | 场景设定 / RAG 核心概念（运维视角） |
| 底座 | ops03~04 | 系统架构 / Docker 底座 |
| 核心 | ops05~07 | Embedding / LangChain / Milvus |
| 检索 | ops08~11 | 意图分类 / 检索计划 / 改写 / 混合检索 |
| 流程 | ops12~13 | QAService / RAG 主流程 |
| 工程 | ops14~16 | Prompt / FastAPI / 启动自检 |
| 治理 | ops17~19 | 版本管理 / 数据隔离 / 文档入库 |
| 质量 | ops20~22 | 质量评测 / 测试 / 可观测 |
| 交付 | ops23 | Docker 交付 / 总结 |

## 八、系列二核心结论

1. **四链路架构**：巡检/告警/维修/工单四条链路共享引擎，靠意图→计划→Prompt 差异化
2. **两条运维红线**：时效（告警快答）与安全（高危操作不编造、带安全提示）
3. **精确匹配**：故障码/设备型号靠 BM25 + 过滤，语义匹配靠 Dense，混合兼顾
4. **数据安全**：工厂/角色隔离在检索层强制过滤，越权内容根本不进候选集
5. **质量闭环**：安全维度评测 + Bad Case 回归，处理方案越用越准

---

**系列二完**：从场景设定到 Docker 交付，设备运维 RAG 的完整工程脉络已经打通。至此，整套课件的两大业务场景（企业知识库 + 设备运维）学习笔记全部完成。
