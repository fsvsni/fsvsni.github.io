---
title: "系列二·第21篇 测试策略：运维系统的质量护栏"
date: 2026-08-27 23:20:00
series_group: 2
series_order: 21
tags:
  - RAG
  - 测试
categories:
  - 设备运维 RAG
---

> 对应课件：18 测试与接口验收
> 本篇目标：从**设备运维**视角讲测试体系——pytest 怎么组织、核心测试测什么、离线测试怎么做。

## 一、为什么要认真测试运维系统

运维系统一个改动可能影响告警处理准确性。测试把质量护栏焊死：

- 意图分类改错 → 告警问题走错链路
- 过滤表达式改错 → 数据泄露
- 检索参数改错 → 漏召回关键 SOP

## 二、测试目录（运维版）

```
tests/
├── test_pipeline.py              # 主流程/意图/检索计划
├── test_equipment_intent.py      # 四链路意图识别
├── test_retrieval_and_prompt.py  # 检索 + Prompt
├── test_kb_versions.py           # 版本管理
├── test_data_isolation.py        # 数据隔离
├── test_safety_prompt.py         # 安全Prompt约束
├── conftest.py
└── data/                         # 测试数据（样例SOP/巡检表）
```

## 三、核心测试：四链路意图

```python
def test_alarm_query_routes_to_alarm():
    intent = classify("设备告警怎么处理")
    assert intent.route == "alarm"

def test_inspection_query_routes_to_inspection():
    intent = classify("巡检项有哪些")
    assert intent.route == "inspection"

def test_repair_query_routes_to_repair():
    intent = classify("E-203 故障怎么修")
    assert intent.route == "repair"

def test_work_order_query_routes_to_work_order():
    intent = classify("工单怎么关闭")
    assert intent.route == "work_order"
```

## 四、安全 Prompt 测试

```python
def test_safety_guard_in_prompt():
    prompt = select_prompt(alarm_intent, scenario)
    assert "持证专业人员" in prompt          # 安全提示存在
    assert "停机" in prompt or "断电" in prompt   # 高危操作强调
```

> 运维专属测试：高危操作的 Prompt 必须带安全提示。

## 五、离线测试（不依赖外部服务）

```python
class FakeRetriever:
    def search(self, query, plan, scope):
        return [Document(page_content="P0告警：立即停机并上报", metadata={"source": "alarm", "alarm_level": "P0"})]

@pytest.fixture
def qa_service():
    return QAService(
        intent_classifier=RuleIntentClassifier(),
        retriever=FakeRetriever(),
        generator=FakeGenerator(),
        memory=InMemoryHistory(),
        ...
    )
```

> 用桩件替换 Milvus/DashScope，核心逻辑离线验证，CI 友好。

## 六、快照测试

```python
def test_alarm_prompt_snapshot(qa_service):
    prompt = select_prompt(alarm_intent, scenario)
    assert_snapshot(prompt)   # 防 Prompt 意外改动
```

> Prompt/检索参数主动调优后需人工确认更新快照。

## 七、测试数据（运维版）

```python
TEST_ALARM_SOP = Document(
    page_content="P0 告警：立即停机、切断电源、挂牌、按流程上报主管",
    metadata={"source": "alarm", "alarm_level": "P0", "kb_version": "sop_2026v3"},
)
TEST_INSPECTION_ROW = Document(
    page_content="设备:空压机A | 巡检项:压力 | 结果:偏高 | 异常:是",
    metadata={"source": "inspection", "device_id": "compressor_A"},
)
```

## 八、测试重点（运维版）

| 测试 | 落点 |
|---|---|
| 意图 | 告警/巡检/维修/工单路由正确 |
| 检索计划 | 告警宽召回 |
| 安全 | 高危操作带安全提示 |
| 数据隔离 | 工厂/角色隔离 |
| 版本 | 激活 v3 后检索 v3 |

---

**本篇小结**：运维测试体系用 pytest + 桩件 + 快照 + 安全测试，把四链路意图、过滤、安全、版本焊死。下一篇讲可观测性。
