---
title: "系列一·第21篇 测试策略：把质量护栏焊死"
date: 2026-08-27 19:20:00
series_group: 1
series_order: 21
tags:
  - RAG
  - 测试
  - pytest
categories:
  - 企业知识库 RAG
---

> 对应课件：第 18 讲 测试策略与质量保障
> 本篇目标：讲清企业知识库的**测试体系**——pytest 怎么组织、核心测试文件测什么、离线测试怎么做到不依赖外部服务、快照测试是什么。

## 一、为什么要认真测试

RAG 系统的逻辑复杂（意图识别、检索计划、过滤、缓存、版本），一个改动可能引入回归。测试是把质量护栏焊死的唯一手段。

## 二、测试目录结构

```
tests/
├── test_pipeline.py          # 主流程/意图/检索计划/上下文
├── test_retrieval_and_prompt.py  # 检索 + Prompt
├── test_kb_versions.py       # 版本管理
├── test_data_isolation.py    # 数据隔离
├── test_startup_preflight.py # 启动自检
├── test_memory.py            # 会话历史
├── conftest.py               # 测试夹具/数据
└── data/                     # 测试数据
```

## 三、核心测试：test_pipeline.py

### 3.1 主流程测试

```python
# tests/test_pipeline.py
def test_retrieval_plan_built_from_intent():
    intent = IntentResult(route="retrieval", intent="doc")
    plan = build_retrieval_plan(intent, scenario)
    assert plan.doc_top_k > 0

def test_context_build_includes_docs():
    docs = [Document(page_content="报销超5000需总经理审批", metadata={"source": "finance"})]
    context = build_context(docs)
    assert "报销超5000" in context
    assert "finance" in context
```

### 3.2 意图识别测试

```python
def test_greeting_routes_to_chat():
    intent = classify("你好")
    assert intent.route == "chat"

def test_expense_query_routes_to_retrieval():
    intent = classify("报销超5000谁审批")
    assert intent.route == "retrieval"
    assert intent.is_expense
```

## 四、离线测试：不依赖外部服务

### 4.1 为什么需要离线测试

CI/CD 环境通常没有 Milvus、DashScope。核心逻辑必须**离线可测**。

### 4.2 依赖注入 + 桩件

```python
# tests/conftest.py
class FakeRetriever:
    def search(self, query, plan, scope):
        return [Document(page_content="入职需准备身份证", metadata={"source": "hr"})]

@pytest.fixture
def qa_service():
    return QAService(
        intent_classifier=RuleIntentClassifier(),
        retriever=FakeRetriever(),        # 桩件
        generator=FakeGenerator(),        # 桩件
        memory=InMemoryHistory(),
        ...
    )

def test_stream_query_returns_events(qa_service):
    events = list(qa_service.stream_query("入职流程", ...))
    assert any(e["type"] == "token" for e in events)
```

> 用**桩件**替换外部依赖，核心编排逻辑离线验证。

### 4.3 离线测试覆盖范围

| 可离线测试 | 需要外部（单独标记） |
|---|---|
| 意图识别（规则） | Milvus 检索集成 |
| 检索计划生成 | LLM 生成集成 |
| 上下文构建 | DashScope 调用 |
| 版本状态机 | 真实模型推理 |
| 数据隔离过滤逻辑 | WebSocket 端到端 |
| 缓存失效逻辑 | |

> 区分"离线单元测试"和"集成测试"，让 CI 快速跑离线，慢的集成单独跑。

## 五、快照测试

### 5.1 什么是快照测试

**快照测试**：把"输入 → 输出"的稳定结果**保存为快照文件**，每次运行对比，防止输出意外变化。

```python
# tests/test_retrieval_and_prompt.py
def test_expense_prompt_snapshot(qa_service):
    prompt = select_prompt(expense_intent, scenario)
    assert_snapshot(prompt)   # 与保存的快照对比
```

### 5.2 快照测试的价值

- 防止 Prompt 被意外改动
- 防止检索参数被无意调整
- 输出变化时**显式暴露**，由人确认是否合理

> 注意：Prompt/检索参数**主动调优**后，需要**更新快照**（人工确认），这是"快照回归"的日常操作。

## 六、测试数据的组织

```python
# tests/data/
# 样例制度片段、FAQ、评测集（小规模，可控）
TEST_DOCS = [
    Document(page_content="入职流程：1.提交材料 2.签订合同 3.培训 4.分配工位", metadata={"source": "hr"}),
    Document(page_content="报销超5000元需总经理审批，附发票和审批单", metadata={"source": "finance"}),
]
```

> 测试数据**小而可控**，覆盖关键边界，不依赖真实大知识库。

## 七、测试边界与注意点

| 注意点 | 说明 |
|---|---|
| 测试不要依赖真实 LLM | 不稳定、慢、花钱 |
| 测试数据要覆盖边界 | 空上下文、低置信度、越权查询 |
| 隔离测试要真实 | 数据隔离测试用真实过滤逻辑 |
| 快照变更要人工确认 | 不静默更新快照 |

## 八、企业知识库场景的测试重点

| 测试 | 场景落点 |
|---|---|
| 意图识别 | "你好"→chat；"报销"→retrieval+expense |
| 检索计划 | 费用类 → doc_top_k 更宽 |
| 数据隔离 | 员工查不到 HR 机密 |
| 版本 | 激活 v3 后检索用 v3 |
| 上下文 | 检索片段正确进 context |

---

**本篇小结**：测试体系用 pytest + 桩件 + 快照，把意图/检索/隔离/版本的核心逻辑焊死，离线可测、CI 友好。下一篇讲可观测性。
