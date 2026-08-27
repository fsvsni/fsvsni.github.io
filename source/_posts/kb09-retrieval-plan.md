---
title: "系列一·第9篇 检索策略：FAQ 直出还是翻制度全文"
date: 2026-08-27 17:20:00
series_group: 1
series_order: 9
tags:
  - RAG
  - 检索策略
  - RetrievalPlan
categories:
  - 企业知识库 RAG
---

> 本篇目标：讲清企业知识库的**检索计划（RetrievalPlan）**——系统如何根据问题类型，动态决定"查 FAQ 还是查文档全文、查多少、怎么查"。

## 一、什么是 RetrievalPlan

**RetrievalPlan（检索计划）** 是根据意图识别结果生成的**检索执行方案**。它回答四个问题：

1. **查什么**：FAQ collection？Doc collection？还是两者？
2. **查多少**：Top-K 取多少？
3. **怎么查**：Dense 权重？Sparse 权重？是否用查询变体？
4. **过滤什么**：source？版本？租户？可见性？

```
意图识别结果 → build_retrieval_plan() → RetrievalPlan → 检索执行
```

## 二、检索计划如何生成

### 2.1 从 route="retrieval" 开始

只有路由为检索类意图（制度查询），才会生成检索计划。闲聊/寒暄直接跳过。

### 2.2 先识别风险和资料形态

系统先判断问题的特点：
- **风险类别**：费用类？合规类？普通制度？
- **资料形态**：制度全文？FAQ？表格？

### 2.3 按固定顺序叠加规则

```python
def build_retrieval_plan(intent_result, scenario):
    plan = RetrievalPlan.default()
    if intent_result.is_faq:
        plan = plan.with_faq_priority()      # FAQ 优先
    if intent_result.is_doc_query:
        plan = plan.with_doc_priority()      # 文档优先
    if intent_result.is_expense:
        plan = plan.with_expense_params()    # 费用类参数
    if intent_result.is_table:
        plan = plan.with_prefer_table()      # 表格优先
    if intent_result.confidence < THRESHOLD:
        plan = plan.widen_recall()           # 低置信度 → 宽召回
    return plan
```

## 三、三种检索倾向

### 1. FAQ 优先（常见问题）

- 问题命中 FAQ（如"入职流程有哪些步骤"）
- 行为：先查 FAQ collection，尝试**精确直出**
- 参数：FAQ 取 Top-K 小（如 3），文档不查或少查

### 2. 文档优先（深度制度查询）

- 问题复杂，需要翻制度全文（如"报销超5000谁审批"的审批链）
- 行为：重点查 Doc collection
- 参数：文档取 Top-K 大（如 8），FAQ 作为补充

### 3. FAQ 和文档都多（混合）

- 问题既可能命中 FAQ，也可能要查文档
- 行为：两边都查，合并后重排

## 四、风险类别怎么参与

企业知识库对**费用类、合规类**问题特别敏感：

| 风险类别 | 处理 |
|---|---|
| **费用类** | 强调金额、审批链、发票要求；检索窗口更大确保不漏 |
| **合规类** | 强调法规依据、材料清单；答案要求严谨 |
| **普通制度** | 常规检索 |

> 风险类别直接影响 Prompt 模板（第 14 篇）和检索参数（本篇）。

## 五、五类问题的参数体感

| 问题类型 | 例子 | 检索倾向 | 参数特点 |
|---|---|---|---|
| FAQ 查询 | "入职流程有哪些步骤" | FAQ 优先 | FAQ topk=3，doc topk=2 |
| 知识查询 | "报销超5000谁审批" | 文档优先 | doc topk=8，faq topk=3 |
| 追问 | "那审批呢" | 结合上文 | 改写后按新意图查 |
| 费用类 | "发票丢失怎么办" | 费用参数 | 宽召回 + 严格模板 |
| 表格类 | "各岗位报销额度表" | prefer_table | 表格 collection 优先 |

## 六、容易混淆的边界

### FAQ 直出 vs FAQ 精确路由

- **FAQ 精确命中**（路由层）：问题几乎完全匹配 FAQ → 直接返回标准答案，不走完整 RAG
- **FAQ 优先检索**（检索层）：命中 FAQ 相关但不精确 → 检索 FAQ 作为候选，走重排和生成

### 追问的检索

追问（"那审批呢"）会先触发**查询改写**（第 10 篇），改写后的完整问题再生成检索计划。

## 七、参数数字怎么解释

检索计划的每个参数都有意义：

```python
@dataclass(frozen=True)
class RetrievalPlan:
    faq_top_k: int = 3        # FAQ 查多少
    doc_top_k: int = 5        # 文档查多少
    dense_weight: float = 0.7 # Dense 权重
    sparse_weight: float = 0.3# Sparse 权重
    use_query_variants: bool = False  # 是否用查询变体
    prefer_table: bool = False # 是否表格优先
```

**怎么从评测结果落到参数**：评测时对比不同参数组合的 Recall/MRR（第 20 篇质量回归），把表现好的参数固化到检索计划。

## 八、测试

检索计划的纯逻辑部分可单测：

```python
# tests/test_retrieval_and_prompt.py
def test_expense_query_gets_wider_recall():
    plan = build_retrieval_plan(expense_intent)
    assert plan.doc_top_k > DEFAULT_TOP_K
```

## 九、企业知识库场景的检索计划示例

| 员工问题 | 检索计划 |
|---|---|
| "入职流程有哪些步骤" | FAQ 优先：faq_top_k=3, doc_top_k=2 |
| "报销超5000谁审批" | 文档优先 + 费用参数：doc_top_k=8 |
| "VPN连不上怎么办" | FAQ 优先 + it source 过滤 |

---

**本篇小结**：检索计划是"查什么、查多少、怎么查"的动态决策。它让常见问题秒答、复杂制度查得全。下一篇讲多轮追问的查询改写。
