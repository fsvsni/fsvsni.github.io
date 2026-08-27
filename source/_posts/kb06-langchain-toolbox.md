---
title: "系列一·第6篇 LangChain 工具箱：生态与自研的边界"
date: 2026-08-27 16:50:00
series_group: 1
series_order: 6
tags:
  - RAG
  - LangChain
  - 架构
categories:
  - 企业知识库 RAG
---

> 本篇目标：讲清 LangChain 在企业知识库项目中**实际用到什么、哪些是自己实现的**，避免"用了 LangChain 就该用 RetrievalQA"的误区。

## 一、核心观点：LangChain 不是完整业务流程

很多教程把 LangChain 包装成"一句话搭 RAG"，但真实的企业项目里，**LangChain 只是工具箱**，不是业务流程本身。

本项目对 LangChain 的定位：
- **用它的封装**：ChatModel（模型调用）、Message（对话结构）、MessageHistory（历史存储）、VectorStore（向量库接口）、Document（统一数据结构）
- **不用它的编排**：不用 RetrievalQA、不把 LCEL 当主流程——主流程由项目自己的 Pipeline 编排

> 为什么？企业场景需要精确控制每一步（意图识别、检索计划、过滤、重排、事件流），通用链路的自由度不够。

## 二、在线问答链路中的 LangChain

### 2.1 ChatOpenAI：统一模型调用入口

通过 OpenAI 兼容接口统一调用 DashScope：

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url=settings.DASHSCOPE_BASE_URL,  # DashScope OpenAI 兼容端点
    api_key=settings.DASHSCOPE_API_KEY,
    model=settings.LLM_MODEL,              # qwen 系列模型
    temperature=0.2,
    streaming=True,
)
```

**企业知识库的关键**：`streaming=True` 支持流式输出，配合 WebSocket 实现"逐字回答"体验。

### 2.2 Message：让多轮对话结构稳定

企业员工会连续追问（"入职流程呢？""那请假呢？"）。LangChain Message 类型让对话结构稳定：

```python
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

messages = [
    SystemMessage(content=system_prompt),          # 场景人设
    HumanMessage(content="入职流程有哪些步骤"),      # 用户
    AIMessage(content="入职需要准备..."),            # 助手
    HumanMessage(content="那请假呢？"),             # 追问
]
```

### 2.2.1 History 不等于模型自带记忆

**关键认知**：模型本身没有记忆，历史是从存储中读取拼进上下文的。

```python
# 模拟进程重启：重新创建适配器，仍然能从数据库读出消息
history = SQLChatMessageHistory(session_id="sess_001", connection=mysql_conn)
messages = history.messages  # 从 MySQL 读出历史
```

> 这正是为什么需要 MySQL 存会话：进程重启后，多轮上下文不丢失。

### 2.3 Structured Output：把 LLM 输出变成业务对象

让 LLM 输出结构化结果（比如意图判断、改写结果）：

```python
from langchain_core.pydantic_v1 import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser

class IntentDecision(BaseModel):
    intent: str = Field(description="意图类型")
    confidence: float = Field(description="置信度")

parser = JsonOutputParser(pydantic_object=IntentDecision)
# LLM 输出 JSON → 解析为 IntentDecision 对象
```

### 2.4 Prompt Profile：不是一个 Prompt 走天下

企业知识库场景，不同问题用不同提示词模板（这就是第 14 篇"Prompt 工程"的内容）：

- 制度流程问题 → 严谨流程模板
- 费用报销问题 → 费用类模板（强调金额、审批链）
- 闲聊 → 宽松模板

### 2.5 最终答案：ChatOpenAI.stream() 推给前端

```python
for chunk in llm.stream(messages):
    # 每个 chunk 通过 WebSocket 推给前端
    await ws.send_json({"type": "token", "content": chunk.content})
```

## 三、离线入库链路中的 LangChain

### 3.1 Document：统一数据结构

```python
from langchain_core.documents import Document

doc = Document(
    page_content="报销金额超过5000元需总经理审批...",
    metadata={
        "source": "finance",
        "kb_version": "kb_2026v3",
        "tenant_id": "company_a",
    },
)
```

### 3.2 Loader、Splitter 与 VectorStore 的接口边界

LangChain 定义了清晰的接口，但实现可以自研：

| 组件 | LangChain 提供 | 本项目做法 |
|---|---|---|
| Loader（加载） | 各种格式的 Loader | 两层解析策略（含 Docling 增强） |
| Splitter（切分） | RecursiveCharacterTextSplitter 等 | 项目自研父子块策略 + 表格专用切分 |
| VectorStore（向量库） | Milvus 集成 | 基于 LangChain Milvus + 自定义过滤器 |

> 接口用 LangChain 的，实现按企业场景自研——这是"用生态但不被生态绑架"。

## 四、Runnable 和 LCEL 的边界

### 4.1 Runnable 的意义

LangChain 的 `Runnable` 是统一接口（`invoke`/`stream`/`batch`），理解即可。

### 4.2 LCEL 是线性链路语法，不是项目主流程

LCEL（LangChain Expression Language）适合简单线性链路，但本项目主流程有**分支、事件、过滤、重排**等复杂逻辑，用项目自己的 Pipeline（第 13 篇）更可控。

## 五、自研与生态的分工

| 交给 LangChain | 项目自己实现 |
|---|---|
| ChatOpenAI（模型调用） | Pipeline 编排（8 Stage） |
| Message / History（对话结构） | 意图识别 + 检索计划 |
| VectorStore 接口（Milvus 封装） | 过滤表达式、安全转义 |
| Document（数据结构） | 父子块切分、表格入库 |
| Structured Output | Prompt Profile 选择器 |
| | 缓存设计、事件协议、质量评测 |

## 六、常见误区

### 误区一：用了 LangChain 就应该用 RetrievalQA

**错**。RetrievalQA 是通用封装，企业场景要精确控制检索参数（source 过滤、版本过滤、多查询合并），用自研 Pipeline 更合适。

### 误区二：LCEL 越多越工程化

**错**。LCEL 适合简单链路，复杂业务逻辑用 LCEL 反而难维护、难调试。

### 误区三：SemanticChunker 一定比 RecursiveCharacterTextSplitter 更好

**不一定**。SemanticChunker 基于 Embedding 语义切分，但成本高、不稳定；父子块策略 + 规则切分在企业场景往往更可控。本项目采用父子块策略。

### 误区四：VectorStore 就是 Milvus

**错**。VectorStore 是 LangChain 的**接口**，Milvus 是**实现**。接口解耦让切换后端更容易。

## 七、企业知识库场景的 LangChain 落点

回到 `enterprise_knowledge`：
- 员工提问 → ChatOpenAI 流式生成
- 多轮追问 → SQLChatMessageHistory 读 MySQL
- 检索 → LangChain Milvus VectorStore + 自研过滤
- 输出 → Structured Output 解析 + WebSocket 推送

---

**本篇小结**：LangChain 是工具箱不是业务流程。用它的模型调用、对话结构、向量库接口，业务逻辑自研，才能满足企业知识库的精确控制需求。下一篇进入 Milvus 向量数据库。
