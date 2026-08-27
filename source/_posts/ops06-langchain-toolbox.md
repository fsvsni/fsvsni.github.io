---
title: "系列二·第6篇 LangChain 工具箱：运维问答中的生态边界"
date: 2026-08-27 20:50:00
tags:
  - RAG
  - LangChain
categories:
  - 设备运维 RAG
---

> 对应课件：第 3 讲 LangChain 生态系统
> 本篇目标：从**设备运维**视角讲清 LangChain 用在哪、自研在哪——流式快答、多轮运维咨询、四类资料检索各自落在哪里。

## 一、LangChain 在运维项目的定位

设备运维问答同样遵循"**工具箱而非业务流程**"原则：

- **用它的封装**：ChatOpenAI（模型调用）、Message（对话结构）、SQLChatMessageHistory（运维咨询历史）、VectorStore（Milvus 接口）、Document（统一结构）
- **不用它的编排**：四条链路（巡检/告警/维修/工单）由项目自研 Pipeline 编排

## 二、ChatOpenAI：流式快答

设备告警要**快**。巡检员提问后，系统要快速流式给出处理步骤：

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url=settings.DASHSCOPE_BASE_URL,
    api_key=settings.DASHSCOPE_API_KEY,
    model=settings.LLM_MODEL,
    temperature=0.2,       # 运维场景：低温度，要确定性
    streaming=True,        # 流式输出
)
```

> **温度低**很关键：运维处理步骤要**准确、确定**，不要发散。温度过高可能编造不存在的处理步骤——这在设备场景是危险的。

## 三、Message：多轮运维咨询

巡检员会连续追问：

```
巡检员："空压机压力偏高怎么办？"
助手："1.检查压力表校准 2.检查管路泄漏 3.若仍偏高，报修工单"
巡检员："那温度呢？"（追问：温度偏高怎么办）
```

- 第一轮问题存入 MySQL（SQLChatMessageHistory）
- 追问时**查询改写**补全指代（"那温度呢"→"空压机温度偏高怎么办"）
- 历史随上下文发给 LLM

## 四、Structured Output：结构化处理方案

让 LLM 输出结构化运维方案：

```python
class MaintenancePlan(BaseModel):
    severity: str          # P0/P1/P2 等级
    steps: list[str]       # 处理步骤
    escalate: bool         # 是否升级
    spare_part: str | None # 所需配件
```

```python
parser = JsonOutputParser(pydantic_object=MaintenancePlan)
```

> 结构化输出便于前端渲染（分级展示、步骤列表、升级按钮）。

## 五、Document：统一数据结构

```python
from langchain_core.documents import Document

doc = Document(
    page_content="P0 告警：空压机超压，立即停机并上报...",
    metadata={
        "source": "alarm",
        "alarm_level": "P0",
        "device_id": "compressor_A",
        "kb_version": "sop_2026v3",
    },
)
```

## 六、Loader / Splitter / VectorStore 边界

| 组件 | LangChain 提供 | 运维项目做法 |
|---|---|---|
| Loader | PDF/文本加载 | 表格专用加载（巡检表）+ Docling 增强 |
| Splitter | 通用切分 | 父子块 + 表格/故障码专用切分 |
| VectorStore | Milvus 集成 | 自定义过滤（source/设备/等级） |

## 七、运维场景自研的部分

| 交给 LangChain | 自研 |
|---|---|
| ChatOpenAI / Message / History | 四条链路 Pipeline 编排 |
| VectorStore 接口 | 四类 source 过滤 + 设备/故障码过滤 |
| Document | 巡检表向量化、故障码段切分 |
| Structured Output | 告警分级 Prompt、维修步骤模板 |

## 八、常见误区（运维视角）

### 误区一：温度越高越"聪明"

**错**。运维场景要**确定性**，temperature=0.2 左右，避免编造处理步骤。

### 误区二：用了 LangChain 就用 RetrievalQA

**错**。运维需要按 source/设备/故障码过滤，自研 Pipeline 更可控。

### 误区三：历史全发给 LLM

**错**。早期咨询压缩成摘要，最近几轮保留原文，控制成本。

---

**本篇小结**：LangChain 提供模型调用、对话结构、向量库接口，运维特有的"四链路编排 + 过滤 + 低温度"自研。下一篇讲 Milvus 存储。
