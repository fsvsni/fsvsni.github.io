---
title: "系列一·第8篇 意图分类：员工这句话该怎么走"
date: 2026-08-27 17:10:00
series_group: 1
series_order: 8
tags:
  - RAG
  - 意图识别
  - NLU
categories:
  - 企业知识库 RAG
---

> 对应课件：第 5 讲 意图分类与路由入口
> 本篇目标：讲清企业知识库的**意图识别**——员工一句话进来，系统如何判断它"该走哪条路"，为什么不能把所有问题都丢给检索。

## 一、什么是意图识别

**意图识别（Intent Classification）** 是判断"用户想干什么"。

在企业知识库场景，员工可能问：

- "入职流程有哪些步骤" → 制度查询（要走检索）
- "你好，在吗" → 闲聊（不检索，直接聊）
- "谢谢" → 寒暄（不检索）
- "报销超5000谁审批" → 费用类制度查询
- "帮我查一下我的考勤" → 可能涉及个人数据（特殊处理）

如果把所有问题都丢给 RAG 检索，会出现：闲聊也去检索一堆无关制度，浪费算力还答非所问。

## 二、路由意图 vs 检索意图（核心设计）

本项目的意图体系分两类：

| 类型 | 作用 | 例子 |
|---|---|---|
| **路由意图（route）** | 决定走哪条路 | 闲聊 / 制度查询 / 追问 / 无关话题 |
| **检索意图（retrieval intent）** | 决定怎么检索 | FAQ 直出 / 文档检索 / 费用类 / 表格类 |

```
用户提问
  → 路由意图：是制度查询，还是闲聊/寒暄/追问？
  → 若是制度查询：检索意图 → 检索计划（FAQ 直出 or 翻文档）
```

## 三、入口判断顺序（核心设计）

系统按**固定顺序**判断意图，从"最轻量"到"最重量"：

```
1. 闲聊/寒暄规则（关键词：你好、谢谢、再见...）
2. 追问规则（"那审批呢""然后呢"——指代上一轮）
3. 费用类规则（报销、金额、发票...）
4. 制度查询（走检索）
5. 兜底：都判断不了 → 保守进入知识查询
```

> **为什么不用 LLM 先判断？** 规则判断快、零成本、可评测、确定性高。LLM 留到改写/生成阶段。这是"规则优先、模型兜底"的工程原则。

## 四、规则分数阶梯

规则不是简单的"命中/不命中"，而是**打分**：

```python
# 规则分数：多个规则可叠加，分数越高越确定
rules = {
    "greeting": 0.95,      # "你好"
    "thanks": 0.95,        # "谢谢"
    "faq_hit": 0.9,        # 命中 FAQ 关键词
    "expense": 0.7,        # "报销""发票"
    "hr_process": 0.6,     # "入职""请假"
    "fallback": 0.3,       # 弱命中，保守兜底
}
```

分数进入检索计划，作为**保护机制**：置信度低的问题，检索计划会更保守（多查、宽召回）。

## 五、知识查询保守兜底

当规则和模型都不能可靠细分时，**保守进入知识查询**：

```python
# 规则与模型都不能可靠细分时，保守进入知识查询
def classify(query):
    route = rule_classifier(query)
    if route is not None:
        return route
    # 模型判断
    model_route = bert_model.predict(query)
    if model_route is not None and model_route.confidence > THRESHOLD:
        return model_route
    # 兜底：保守进入知识查询
    return Route.RETRIEVAL
```

> **设计边界**：宁可多查（把问题交给检索），也不瞎答。检索不命中时，系统会明确说"知识库中没有找到相关内容"。

## 六、Source 自动推断（企业知识库特色）

企业知识库有 hr/it/finance 三个 source。员工提问时，系统要**推断问题属于哪个 source**，从而过滤检索范围：

```python
# qa_core/scenarios/boundary.py
def infer_source(query):
    scores = {}
    for source in ["hr", "it", "finance"]:
        scores[source] = score_query_against_source(query, source)
    return max(scores, key=scores.get), scores
```

### 推断依据（Source Pattern 评分）

- **关键词命中**："报销""发票" → finance；"入职""请假" → hr；"VPN""电脑" → it
- **跨场景边界比较**：比较双方分数，避免误判

### 为什么比较双方分数

如果"报销审批流程"同时命中 hr（审批）和 finance（报销），系统要比较两者分数决定优先 source，避免检索范围过宽导致噪声。

## 七、IntentResult 与下游联动

意图识别结果（IntentResult）是一个结构化对象，字段直接决定下游行为：

| 字段 | 下游影响 |
|---|---|
| `route` | 是否进入检索计划（闲聊则不检索） |
| `intent` | 检索计划参数（FAQ 直出 or 文档检索） |
| `confidence` / `final_score` | 检索计划保护（低置信度 → 宽召回） |
| `requires_rewrite` | 是否调用改写模型（追问场景） |
| `suggested_source` | Milvus 过滤表达式（source == "hr" 等） |

```python
@dataclass
class IntentResult:
    route: str                 # chat / retrieval / rewrite ...
    intent: str                # faq / doc / expense / table ...
    confidence: float          # 模型置信度
    rule_score: float          # 规则分数
    requires_rewrite: bool     # 是否需要改写
    suggested_source: str      # 建议 source
```

## 八、BERT 意图模型（可选）

当规则不够时，可以训练/使用 **BERT 意图分类模型**（`bert_intent_classifier_v1`）：

- 输入：员工问题文本
- 输出：意图类别 + 置信度
- 本地部署（`models/bert_intent_classifier_v1`）

但**规则优先**：规则能覆盖的场景不用模型，模型处理规则的盲区。规则 + 模型形成闭环，且都能通过评测数据集验证。

## 九、企业知识库场景的意图设计

| 员工问题 | 路由 | 检索意图 | source 推断 |
|---|---|---|---|
| "入职流程有哪些步骤" | retrieval | doc | hr |
| "报销超5000谁审批" | retrieval | expense | finance |
| "VPN连不上怎么办" | retrieval | faq | it |
| "你好" | chat | - | - |
| "那请假呢"（追问） | rewrite | - | hr |

---

**本篇小结**：意图识别是 RAG 的"路口交警"，决定问题走哪条路、怎么查、查哪里。规则优先 + 模型兜底 + Source 推断，让企业知识库精准路由。下一篇讲检索策略。
