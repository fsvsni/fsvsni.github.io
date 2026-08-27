---
title: "系列一·第3篇 RAG 系统组成与项目架构全景"
date: 2026-08-27 16:20:00
tags:
  - RAG
  - 架构
  - 系统设计
categories:
  - 企业知识库 RAG
---

> 对应课件：第 1 讲 2.2~2.6 节（全景架构、部署架构、技术栈、核心模块）
> 本篇目标：把企业知识库这个项目的**整体架构**讲清楚——离线入库、在线问答两条链路，部署拓扑、技术栈选型、代码模块划分。

## 一、一句话描述项目

这是一个基于 **LangChain + Milvus 2.5 Hybrid Search** 的多场景 RAG 平台，不是简单 Demo，而是补齐了**企业级 RAG 完整工程闭环**的项目：从文档入库、检索、生成，到版本管理、数据隔离、质量评测、测试、可观测、Docker 交付。

## 二、全景架构：两条链路 + 一个核心

```
┌───────────────────── 离线链路（入库） ─────────────────────┐
│  文档加载(PDF/MD/Word/Excel)                                │
│    → 文档切分(父子块策略)                                    │
│    → 向量化(BGE-M3 Embedding)                               │
│    → 向量存储(Milvus Collection)                            │
└──────────────────────────┬─────────────────────────────────┘
                           │ 检索
┌──────────────────────────▼─────────────────────────────────┐
│  在线链路（问答）                                            │
│  用户提问 → 意图识别 → 语义检索(Dense+Sparse Hybrid)          │
│    → 重排序(BGE Reranker) → 上下文构建                       │
│    → LLM 生成(DashScope 流式输出) → 可溯源答案                │
└────────────────────────────────────────────────────────────┘
```

两条链路通过 **Milvus 向量库**衔接：离线链路负责"入库"，在线链路负责"检索问答"。

## 三、流式主链路 vs 检索诊断链路

项目提供两条在线链路：

| 链路 | 入口 | 用途 |
|---|---|---|
| **流式主链路**（完整 RAG） | `stream_query()` | 用户提问 → 完整 RAG 流程 → 通过 Generator 逐事件产出流式答案 |
| **检索诊断**（只查不生成） | `debug_retrieval()` | 只做检索不做生成，用于调试和评测召回质量 |

检索诊断链路是工程化的关键设计：**把"检索质量"和"生成质量"分离**，方便定位问题出在召回还是生成。

## 四、部署架构

```
┌───────────────────────── 宿主机(Host) ────────────────────────┐
│  Docker Compose 管理：                                         │
│   ┌─────┐   ┌──────┐   ┌─────┐   ┌────┐   ┌─────┐            │
│   │ API │   │ MySQL│   │Redis│   │Milvus│ │MinIO│            │
│   └──┬──┘   └──────┘   └─────┘   └──┬──┘   └─────┘            │
│      │   ┌───────┐      Etcd ──────┤                          │
│      └──▶│ Local │◀────────────────┘                          │
│          │Models │                                            │
│          └──┬────┘                                            │
│             └─ BGE-M3 / BGE-Reranker / BERT意图模型（进程内调用）│
└─────────────┼─────────────────────────────────────────────────┘
              │ HTTPS 出站
      ┌───────▼────────┐
      │ DashScope 云端LLM│
      └────────────────┘
```

关键点：
- **本地组件都绑定 127.0.0.1**，不暴露公网，安全由操作系统网络栈保证
- **模型本地化部署**：BGE-M3（Embedding）、BGE-Reranker（重排）、BERT（意图分类）都放本地 `./models`
- **LLM 云端调用**：DashScope（通义千问，OpenAI 兼容接口）

## 五、技术栈选型详解

| 层级 | 技术 | 为什么选它 |
|---|---|---|
| API 框架 | FastAPI | 原生异步、WebSocket、自动生成 OpenAPI 文档 |
| RAG 编排 | LangChain | 开源生态成熟，封装 ChatModel、VectorStore、MessageHistory |
| 向量数据库 | Milvus 2.5.x | 支持 BGE-M3 Dense + Milvus BM25 Sparse 混合检索 |
| Embedding | BGE-M3 | 中文语义强、本地部署、1024 维 Dense 向量 |
| Sparse 向量 | Milvus BM25BuiltInFunction | 服务端内置函数，不需要额外部署分词器 |
| Reranker | BGE Reranker Large | CrossEncoder 架构，对召回结果精细排序 |
| LLM | DashScope (OpenAI 兼容) | 通过 LangChain ChatOpenAI 统一调用 |
| 会话存储 | MySQL | LangChain SQLChatMessageHistory 自动管理表结构 |
| 缓存 | Redis + 进程内缓存 + MySQL | 支撑查询 embedding、FAQ/Doc 检索和版本激活缓存失效 |
| 配置 | .env.compose / .env + scenario.toml | 运行时环境变量 + 场景级 TOML 配置 |

### 为什么这些技术组合适合企业知识库

1. **FastAPI + WebSocket**：RAG 生成是流式的，WebSocket 才能实现"逐字输出"的流畅体验
2. **Milvus 混合检索**：制度文档既有语义化表述又有精确术语，Dense+Sparse 兼顾
3. **本地模型**：企业数据不出内网，Embedding/重排本地跑，只有 LLM 走云端
4. **scenario.toml 配置**：同一引擎支撑 8 个场景，切换场景只需换配置

## 六、核心模块一览（代码结构）

```
qa_core/
├── api/              # FastAPI 路由 — HTTP/WebSocket 请求入口
├── application/      # 服务编排 — QAService 统一业务入口
├── intent/           # 意图识别 — 判断用户想干什么
├── retrieval/        # 检索系统 — Milvus 连接、过滤、重排
├── pipeline/         # RAG 主流程 — 事件生成、上下文构建
├── prompts/          # 提示词 — 模板选择、场景注入
├── indexing/         # 入库 — 文档加载、切分、FAQ 入库
├── governance/       # 治理 — 知识库版本、数据隔离
├── memory/           # 记忆 — 聊天历史、摘要、反馈
├── quality/          # 质量 — 入库质量、冲突检测
├── scenarios/        # 场景 — 多行业配置、source 推断
├── config/           # 配置 — 设置、日志、启动校验
└── observability/    # 可观测 — 追踪、评测、Bad Case
```

这个模块划分体现的核心设计思想：**单一职责、分层清晰、场景可扩展**。

### 模块职责速记

| 模块 | 一句话职责 |
|---|---|
| `api` | 请求入口，薄薄一层，不堆业务 |
| `application` | 服务门面（QAService），统一编排 |
| `intent` | 判断"用户想干什么"（制度查询/闲聊/费用等） |
| `retrieval` | 怎么查（混合检索、过滤、重排） |
| `pipeline` | 主流程编排（8 个 Stage） |
| `prompts` | 用什么样的提示词（按场景/意图选择模板） |
| `indexing` | 离线入库（文档→向量） |
| `governance` | 知识库版本 + 数据隔离（企业合规核心） |
| `memory` | 多轮对话历史管理 |
| `quality` | 入库质量检查、冲突检测 |
| `scenarios` | 8 个业务场景配置 |
| `observability` | 追踪、评测、Bad Case |

## 七、企业知识库场景的架构落点

回到 `enterprise_knowledge` 场景，架构如何落地：

- **资料源**：hr/it/finance 三类制度 → `scenario.toml` 里配置 sources
- **入库**：制度 PDF/表格 → `indexing` 模块 → Milvus 分 collection 存储
- **检索**：员工提问 → `intent` 识别 → `retrieval` 按 source 过滤（如只查 hr）→ 混合检索 + 重排
- **生成**：`pipeline` 主流程 → LLM 基于检索片段作答
- **合规**：`governance` 管版本（制度更新安全上线）和数据隔离（HR 数据不对全员可见）

---

**本篇小结**：理解了项目"两条链路 + 分层模块"的整体架构。企业知识库场景是这套架构的一个实例化。下一篇讲 Docker 底座，把环境跑起来。
