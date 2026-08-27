---
title: "系列二·第10篇 查询改写：维修工追问“那个故障”怎么办"
date: 2026-08-27 21:30:00
tags:
  - RAG
  - 查询改写
  - 多轮对话
categories:
  - 设备运维 RAG
---

> 对应课件：第 7 讲 查询改写与变体生成
> 本篇目标：从**设备运维**视角讲多轮对话处理——维修工程师追问"那个故障怎么处理"时，系统如何补全指代、如何用查询变体提高召回。

## 一、运维咨询中的指代

维修工程师不会每次问完整问题：

- 第一问："空压机压力偏高怎么处理？"
- 追问："那温度呢？"（指空压机温度偏高怎么处理）
- 追问："E-203 呢？"（指故障码 E-203 怎么处理）

把"那温度呢"直接拿去检索，会查不到内容。**查询改写**补全指代。

## 二、查询改写流程

```python
# qa_core/pipeline/rewrite.py
def rewrite_query(query, history):
    # 基于最近历史补全指代
    messages = [
        SystemMessage(content=REWRITE_PROMPT),
        *history[-4:],       # 最近几轮
        HumanMessage(content=query),
    ]
    rewritten = llm.invoke(messages).content
    return rewritten
```

### 改写示例

```
历史：空压机压力偏高怎么处理？
追问：那温度呢？
改写：空压机温度偏高怎么处理？

历史：故障码 E-203 什么意思？
追问：怎么修？
改写：故障码 E-203 怎么维修？
```

## 三、改写 Prompt 约束

```text
把用户的追问补全为完整、独立的问题：
1. 只补全指代，不改写原意
2. 基于最近 2-4 轮历史
3. 如果问题本身完整，直接返回原问题（不调用 LLM）
4. 保留设备编号、故障码等关键信息
```

> **完整问题不改写**：省一次 LLM 调用，避免改写引入噪声。

## 四、查询变体（Query Variants）

### 4.1 为什么需要变体

同一故障有多种问法：

```
原问题："空压机压力偏高"
变体1："空压机超压怎么办"
变体2："压缩机压力异常处理"
```

多个变体分别检索 → 合并去重 → 重排，提高召回。

### 4.2 什么时候生成变体

```python
plan = RetrievalPlan(
    use_query_variants=should_use_variants(intent),
    ...
)

def should_use_variants(intent):
    # 告警/维修类问题生成变体（故障处理要全）
    return intent.route in ("alarm", "repair")
    # 巡检/工单/闲聊不生成（成本考量）
```

> 告警/维修问题**必须全**（漏掉处理方案 = 事故），所以生成变体。

## 五、历史压缩

运维咨询可能很长，全发历史成本高：

```python
def build_llm_history(session_id, max_recent=6):
    history = store.load(session_id)
    summary = summarize_old(history[:-max_recent])  # 早期 → 摘要
    recent = history[-max_recent:]                   # 最近 → 原文
    return summary + recent
```

> 早期咨询压成摘要，最近几轮保留原文。

## 六、完整链路（运维版）

```
维修工追问："那温度呢"
  → 意图识别：requires_rewrite=True
  → 改写："空压机温度偏高怎么处理"
  → 检索计划：repair 优先 + 宽召回
  → 生成变体（2-3个）
  → 混合检索 → 合并去重 → 重排
  → LLM 给出处理步骤（流式）
```

## 七、运维场景的多轮示例

```
维修工："空压机压力偏高怎么处理？"
助手：（检索 repair）→ "1.检查压力表 2.检查管路 3.仍偏高则报修..."

维修工："那温度呢？"
  → 改写："空压机温度偏高怎么处理？"
  → 检索 repair → "1.检查散热 2.检查冷却液 3.超限停机..."

维修工："E-203 呢？"
  → 改写："故障码 E-203 怎么处理？"
  → 检索 repair（fault_code=E-203）→ ...
```

---

**本篇小结**：查询改写补全指代、查询变体提高召回、历史压缩控成本，让维修工程师的多轮追问流畅可用。下一篇讲混合检索落地。
