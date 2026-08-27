---
title: 欢迎来到我的技术博客
date: 2026-08-27 15:10:00
tags:
  - 博客
  - Hexo
categories:
  - 杂记
---
## 课程大纲

**课前体验**：00 Vibe Coding 入门实训（从需求到可运行 Mini RAG）

第一阶段：基础概念
01 项目概述与 Docker 环境搭建
02 RAG 核心概念深入
第二阶段：核心 RAG 链路
03 LangChain 生态系统
04 Milvus 索引机制与基本操作
05 意图分类
06 检索策略与动态计划
07 查询改写与变体生成
08 Milvus 混合检索
09 QAService 核心编排
10 RAG Pipeline 主流程
11 Prompt 工程与 Profile 系统
第三阶段：Web 服务基础设施
12 FastAPI 与异步 Web 框架
13 应用入口与环境前置校验
第四阶段：治理与运维
14 知识库多版本管理
15 数据隔离与多租户
16 文档入库与索引链路
17 RAG 回归验收与入库质量
18 测试与接口验收
19 LangSmith 观测、Trace 与生产化部署
20 Docker 交付深化与排障
技术附录
A Pydantic 数据校验与 Settings 管理
B SHA256 文件指纹
C HNSW 索引参数调优
D CrossEncoder Reranker 原理
E RecursiveCharacterTextSplitter
F Embedding 模型选型
G 文档切分策略 Parent-Child Chunking
H 项目工具类开发详解
欢迎！这是一套基于 LangChain + Milvus Hybrid Search 构建的 KnowForge RAG Platform 20 讲系统课程，并额外提供 00 课前体验（Mini RAG）。

讲义版本：V1.0 封版讲义，最近更新：2026-07-06。

🎬 快速入门：先看 RAG Pipeline 执行流程动画演示，5 分钟建立对整个系统执行流程的直观认识。

前言：如何高效学习这个项目
这个项目已经接近企业级 RAG 系统项目的完整度。如果第一次学习时把所有模块都当成同等重要，会很容易迷失。正确方式是先抓住"能跑通一次高质量问答"的主链路，再逐步补治理、评测、多场景和复杂资料能力。

核心原则
首轮学习只回答一个问题：

用户问一个业务问题，系统如何找到正确资料，并流式生成一个有引用、可追溯的答案？

能把这条链路讲清楚，就已经掌握了项目的主干。其他内容是为了让系统更像企业项目、更适合汇报表达，但不是首轮必须全部吃透。

四层学习优先级
层级	定位	是否必须	学习目标
P0 主链路	在线问答闭环	必须掌握	能解释一次请求从页面到 RAG Pipeline 再到流式返回的全过程
P1 核心工程能力	检索质量、Prompt、入库、版本、评测	建议掌握	能说明为什么答案可靠、资料如何更新、如何防止质量退化
P2 企业化增强	多租户隔离、多场景、可选 LangSmith Trace、本地领域指标、生产部署、Docker 交付深化、容量评估、企业资料治理	项目亮点	能把项目讲成企业可落地方案
P3 扩展能力	OCR/VLM、表格复杂治理、GraphRAG	了解即可	知道边界和升级路线，不要求第一期完全掌握
观测学习提示：本项目默认用本地评测报告和 Gate 判断回答效果；LangSmith Trace 是企业环境的可选观测入口，用来页面化查看一次 RAG 请求内部发生了什么。详细实现和项目落地点放在 第 17 讲：RAG 回归验收与入库质量 和 第 19 讲：LangSmith 观测、Trace 与生产化部署。

P0 主链路一览
模块	对应代码	核心概念
意图识别	qa_core/intent/classifier.py	决定是否检索、如何检索、用什么 Prompt
检索策略	qa_core/retrieval/strategy.py	不同问题动态调整 top_k 和阈值
查询改写	qa_core/pipeline/rewrite.py	补全追问、生成多路检索变体
Milvus 混合检索	qa_core/retrieval/store.py	Dense + BM25 Sparse 混合召回
上下文构建	qa_core/pipeline/context.py	控制哪些证据进入 LLM，避免噪声
Prompt Profile	qa_core/prompts/	不同问题类别用不同回答口径
流式生成 + 引用	qa_core/pipeline/rag.py	WebSocket 流式输出 + 来源标注
P0 最低验收标准
能画出"页面 → API → QAService → Pipeline → 检索 → LLM → 流式返回"的流程
能解释为什么先做意图识别，再做检索计划
能解释 Dense、Sparse、Reranker 在一次检索中的作用
能解释为什么答案必须带来源引用
推荐学习节奏
阶段	时长	内容	对应讲次
课前体验	1 天	用 AI 编程工具生成并跑通一个简易 RAG，先看见完整流程	00 课前体验
快速体验	1 天	启动完整项目，提问看流式输出，理解 RAG vs ChatGPT 区别	第 1-2 讲
主链路	3-5 天	P0 全部内容：LangChain→意图→检索→改写→Milvus→Pipeline→Prompt	第 3-10 讲
工程化	2-3 天	框架原理、入库、版本管理、数据隔离、评测、测试	第 12-18 讲
汇报提升	1-2 天	多场景复用、本地 Bad Case 沉淀、可选 LangSmith 诊断、生产部署、Docker 交付深化、容量评估、扩展边界	第 19-20 讲
首轮可以暂时跳过的内容
企业 overlay、dirty samples 和复杂 OCR / VLM 细节
复杂 Excel 语义还原
所有 scripts 脚本的逐行解释
所有 8 个业务场景的完整资料细节
Mermaid 架构图里的每个辅助节点
历史报告复盘的实现细节
GraphRAG、OCR/VLM 等不进入主链路的扩展细节
LlamaIndex 入库替代方案的实现细节
状态页前端样式和非核心 UI 交互
首轮只需要知道它们存在，以及它们服务于哪个工程目标。

最小闭环作业
完成下面 5 件事，就说明已经掌握一期主线：

启动项目并完成一次流式问答
解释该问题的意图分类结果
解释该问题的检索计划为什么这样设置
找到至少一条引用来源，并说明它是怎么从 Milvus 召回来的
修改一份文档或 FAQ，重新入库并让新版本生效
代码阅读路线
如果要读代码，按这条线走——不要跳，不要从中间开始：


app.py
  → qa_core/api/chat.py          （WebSocket 流式事件 + HTTP 诊断/历史/反馈）
  → qa_core/application/service.py （QAService 编排层）
  → qa_core/pipeline/rag.py        （RAG 主流程）
  → qa_core/pipeline/steps.py      （意图识别、边界判断、上下文构建）
  → qa_core/pipeline/retrieval_steps.py （FAQ 检索、文档检索）
  → qa_core/retrieval/             （Milvus Hybrid Search、过滤、重排）
  → qa_core/prompts/               （Prompt Profile 路由）
  → qa_core/indexing/              （文档加载、切分、入库）
项目表达主线
汇报时不要从"项目有很多功能"开始讲，而应按主次讲：

这个项目的核心是一套企业级 RAG 问答主链路。 在线侧通过 WebSocket 实现统一流式问答； 检索侧通过意图识别、动态检索计划、查询改写、Milvus Dense+Sparse 混合检索和 Reranker 提高召回质量； 生成侧通过 Prompt Profile、引用增强和上下文筛选保证答案可控； 工程侧通过知识库版本、数据隔离、入库质量检查、本地领域评测指标和可选 LangSmith Trace 保证系统可维护、可回滚、可诊断。 OCR/VLM、GraphRAG 和 LlamaIndex 入库替代属于后续扩展方向，不混入当前主链路。

复杂度控制：一期不引入 Python 本地 BM25 或 LlamaIndex QueryEngine。FAQ 和文档召回统一由 Milvus Hybrid Search 执行；Redis 只缓存 query embedding 和带版本/权限边界的检索候选，不替代 Milvus 检索。企业级边界由 scenario、kb_version、DataScope、质量门禁、缓存 epoch 和 Prompt Profile 显式表达。

可选扩展方向：GraphRAG 与多模态入库
当前版本先把企业级 RAG 平台做可靠，重点解决检索、重排、Prompt、版本、隔离、评测和观测。GraphRAG 可以作为独立的关系推理扩展，多模态能力可以作为 OCR/VLM 入库增强，但都不替代当前的 Milvus Hybrid RAG 主链路。

GraphRAG 适合合同风险、跨境供应链、工程项目等强实体关系场景，用来回答“风险如何传导”“实体之间有什么关联”“某个项目会影响哪些节点”这类问题。

快速导航
课程大纲与学习路线 — 00 课前体验 + 20 讲主体结构和推荐学习顺序
00 课前体验：Vibe Coding 入门实训 — 先学需求拆解、分阶段生成、测试和调试，再用 Mini RAG 完成一次完整实训
第 1 讲：项目概述与 Docker 环境搭建 — 从这里开始，先理解 Docker/Compose 再部署
第 20 讲：Docker 交付深化与排障 — 部署交付和排障收口
技术附录 — 专题深度解析
🎬 流程动画演示 — 5 分钟建立系统整体认知
📊 业务流程图 — 在线问答、离线入库、系统全景、章节实现路线图
第 05-08 章检索主链路流程图 — 意图识别、检索计划、查询改写和 Milvus 分层检索的串联视图
课程结构
阶段	讲次	内容	优先级
课前体验	00	Vibe Coding：生成并跑通 Mini RAG	可选但推荐
第一阶段	01-02	基础概念：RAG 原理、向量检索、Embedding	P0
第二阶段	03-11	核心 RAG 链路：LangChain→Milvus索引→意图→检索→改写→混合检索→编排→Pipeline→Prompt	P0（核心）
第三阶段	12-13	Web 服务基础设施：FastAPI、Preflight	P1
第四阶段	14-20	治理与运维：版本管理、数据隔离、知识库离线构建、评测、测试、追踪、Docker 交付深化	P1-P2
00 课前体验 + 20 讲详细优先级
讲次	主题	优先级	首轮学习要求
00	Vibe Coding 入门实训	课前体验	推荐先完成一次需求到验收的 AI 协作闭环
01	项目概述与 Docker 环境搭建	P0	必学，先理解 Docker/Compose，再跑通系统
02	RAG 核心概念	P0	必学，理解 Dense/Sparse/Reranker
03	LangChain 生态	P0	必学，RAG 的"语言基础" — Runnable 协议、ChatModel 调用、LCEL 组合
04	Milvus 索引机制与基本操作	P0	必学，理解 pymilvus 操作和索引选型
05	意图分类	P0	必学，后续策略都依赖它
06	检索策略	P0	必学，理解动态参数
07	查询改写与变体	P0	必学，追问补全和多路检索
08	Milvus 混合检索	P0	必学，RAG 召回核心
09	QAService 编排	P0	必学，理解服务层如何串联
10	RAG Pipeline	P0	必学，全项目主流程
11	Prompt Profile	P0	必学，控制答案结构和业务边界
12	FastAPI 与异步	P1	理解 async/await、WebSocket，RAG 的"骨架"
13	应用入口与前置校验	P1	理解为什么环境必须完整
14	知识库版本	P1	建议掌握，体现工程可靠性
15	数据隔离	P1	建议掌握，企业项目必问
16	文档入库	P1	建议掌握，解释知识如何进入系统
17	RAG 回归验收与入库质量	P1	建议掌握，证明效果不是拍脑袋
18	测试与接口验收	P1	先掌握核心测试思路
19	LangSmith 观测、Trace 与生产化部署	P2	进阶学习，项目亮点；能讲生产部署、容量评估和监控
20	Docker 交付深化与排障	P2	进阶学习，能讲清镜像构建、模型挂载、初始化和部署排障
技术栈
层级	技术
API 框架	FastAPI + WebSocket
RAG 编排	LangChain
向量数据库	Milvus 2.5 Hybrid Search
Embedding	BGE-M3 (本地部署)
Reranker	BGE Reranker Large (CrossEncoder)
LLM	DashScope (OpenAI 兼容)
会话存储	MySQL
