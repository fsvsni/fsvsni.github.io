---
title: "系列二·第8篇 意图分类：巡检员这句话该走哪条链路"
date: 2026-08-27 21:10:00
series_group: 2
series_order: 8
tags:
  - RAG
  - 意图识别
  - NLU
categories:
  - 设备运维 RAG
---

> 对应课件：05 意图分类
> 本篇目标：从**设备运维**视角讲意图识别——巡检员/维修工程师的一句话，系统如何判断该走巡检/告警/维修/工单哪条链路。

## 一、运维提问的多样性

巡检员会问各种问题：

- "日检异常怎么升级" → 告警/升级类（查 alarm + inspection）
- "设备告警怎么处理" → 告警类（查 alarm）
- "巡检项有哪些" → 巡检类（查 inspection）
- "配件更换流程" → 维修/工单类（查 repair + work_order）
- "你好" → 闲聊（不检索）
- "帮我查下工单 W0001 的状态" → 工单类（查 work_order）

如果所有问题都走同一条检索，会答非所问（问告警却查到工单规则）。**意图分类**决定走哪条链路。

## 二、运维场景的路由意图 vs 检索意图

| 类型 | 作用 | 运维例子 |
|---|---|---|
| **路由意图** | 走哪条路 | 巡检 / 告警 / 维修 / 工单 / 闲聊 |
| **检索意图** | 怎么检索 | FAQ 直出 / 文档检索 / 表格检索 |

```
用户提问
  → 路由意图：巡检？告警？维修？工单？闲聊？
  → 检索意图 → 检索计划（查哪个 source、怎么查）
```

## 三、入口判断顺序（运维版）

```
1. 闲聊/寒暄规则（你好、谢谢、再见）
2. 追问规则（"那温度呢"——指代上一轮）
3. 巡检类规则（巡检、日检、巡检项）
4. 告警类规则（告警、报警、P0、升级）
5. 维修类规则（维修、故障、配件、更换）
6. 工单类规则（工单、报修、关闭）
7. 兜底：保守进入知识查询
```

> **规则优先、模型兜底**：规则快、零成本、可评测；BERT 模型处理规则盲区。

## 四、规则分数阶梯（运维版）

```python
rules = {
    "greeting": 0.95,        # "你好"
    "inspection": 0.8,       # "巡检""日检"
    "alarm": 0.85,           # "告警""报警""P0"
    "repair": 0.75,          # "维修""故障""配件"
    "work_order": 0.8,       # "工单""报修"
    "escalate": 0.7,         # "升级""上报"
    "fallback": 0.3,         # 弱命中
}
```

> 分数进入检索计划作为保护：低置信度问题 → 宽召回、多 source 查。

## 五、Source 自动推断（运维特色）

设备运维有 4 个 source。系统要推断问题属于哪个 source：

```python
# qa_core/scenarios/boundary.py
def infer_source(query):
    scores = {}
    for source in ["inspection", "alarm", "repair", "work_order"]:
        scores[source] = score_query_against_source(query, source)
    return max(scores, key=scores.get), scores
```

### 推断依据

- **关键词命中**："巡检""日检" → inspection；"告警""P0" → alarm；"维修""故障码" → repair；"工单""报修" → work_order
- **跨 source 边界比较**：问题同时命中多个 source 时比较分数

### 为什么要比较

"日检异常怎么升级"同时命中 inspection（日检）和 alarm（升级），要比较两者分数，优先 source 为 alarm（升级路径在告警 SOP）。

## 六、IntentResult 与下游联动

```python
@dataclass
class IntentResult:
    route: str               # inspection / alarm / repair / work_order / chat
    intent: str              # faq / doc / table
    confidence: float
    rule_score: float
    requires_rewrite: bool   # 是否需要改写
    suggested_source: str    # 建议 source
```

| 字段 | 下游影响 |
|---|---|
| `route` | 选择哪条链路 |
| `suggested_source` | Milvus 过滤 source |
| `requires_rewrite` | 是否调用改写（追问场景） |
| `confidence` | 检索计划保护 |

## 七、运维意图识别示例

| 巡检员问题 | 路由 | source | 处理 |
|---|---|---|---|
| "日检异常怎么升级" | alarm | alarm+inspection | 告警链路 |
| "设备告警怎么处理" | alarm | alarm | 告警链路 |
| "巡检项有哪些" | inspection | inspection | 巡检链路 |
| "配件更换流程" | repair | repair+work_order | 维修链路 |
| "工单怎么关闭" | work_order | work_order | 工单链路 |
| "你好" | chat | - | 闲聊 |

## 八、为什么意图分类对运维很重要

1. **时效**：告警问题要快速路由到告警链路，不能绕弯路
2. **精准**：问告警不能查工单规则（答非所问）
3. **安全**：有些运维操作（如停机）要谨慎回答，意图识别是前置判断

---

**本篇小结**：运维意图分类判断问题走巡检/告警/维修/工单哪条链路，规则优先 + 模型兜底 + Source 推断。下一篇讲检索计划。
