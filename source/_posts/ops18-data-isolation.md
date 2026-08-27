---
title: "系列二·第18篇 数据隔离：设备数据的安全红线"
date: 2026-08-27 22:50:00
tags:
  - RAG
  - 数据隔离
categories:
  - 设备运维 RAG
---

> 对应课件：第 15 讲 数据隔离与安全治理
> 本篇目标：从**设备运维**视角讲数据隔离——为什么设备数据不能随便查、隔离维度有哪些、检索怎么读取过滤。

## 一、设备数据的敏感性

设备运维资料**不是所有角色都能看**：
- 设备核心参数、安全设置 → 仅高级工程师
- 某工厂的专有设备资料 → 其他工厂不可见
- 涉密生产数据 → 特定角色

如果检索不隔离，普通员工可能套出敏感设备信息 → **安全事故/合规问题**。

## 二、五大隔离维度（运维版）

| 维度 | 含义 | 例子 |
|---|---|---|
| **租户** | 工厂/企业隔离 | plant_a 与 plant_b 互不可见 |
| **Source** | 四类资料源 | inspection/alarm/repair/work_order |
| **可见性** | 公开/内部/机密 | 设备核心参数 confidential |
| **角色** | 谁能看 | 巡检员/维修工程师/高级工程师 |
| **版本** | 版本隔离 | 只查 active SOP |

## 三、Schema 中的隔离字段

```python
FieldSchema(name="tenant_id", dtype=DataType.VARCHAR, max_length=64),    # 工厂
FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=32),        # 四类
FieldSchema(name="visibility", dtype=DataType.VARCHAR, max_length=16),
FieldSchema(name="allowed_roles", dtype=DataType.ARRAY,
            element_type=DataType.VARCHAR, max_capacity=16),              # 角色
FieldSchema(name="kb_version", dtype=DataType.VARCHAR, max_length=64),
```

## 四、读取过滤（DataScope 强制注入）

```python
def build_filter(scope: DataScope) -> str:
    parts = []
    if scope.active_kb_version:
        parts.append(f'kb_version == "{scope.active_kb_version}"')
    parts.append(f'tenant_id == "{scope.tenant_id}"')          # 工厂必带
    if scope.sources:
        parts.append("(" + " or ".join(f'source == "{s}"' for s in scope.sources) + ")")
    parts.append(f'visibility in {scope.visible_visibilities()}')
    parts.append(f'array_contains(allowed_roles, "{scope.role}")')
    return " and ".join(parts)
```

> **DataScope 强制注入**：无论怎么调用检索，租户/版本/角色条件必然带上。

## 五、安全转义（防注入）

```python
def escape_expr_value(value):
    return value.replace('"', '\\"').replace("'", "\\'")
```

> 设备号/故障码若来自用户输入，必须转义。否则 `'ABC" or 1==1 or "'` 可能绕过 source/设备过滤 → 数据泄露。

## 六、写入隔离：入库带元数据

```python
def ingest_document(doc, source, tenant_id, visibility, roles, **kw):
    chunks = split_document(doc)
    records = [
        {
            "text": chunk,
            "dense_vector": embedding(chunk),
            "sparse_vector": bm25(chunk),
            "source": source,
            "tenant_id": tenant_id,
            "visibility": visibility,
            "allowed_roles": roles,
            "kb_version": active_version,
            **kw,   # 设备号/故障码等
        }
        for chunk in chunks
    ]
    collection.insert(records)
```

## 七、为什么在检索层过滤（而不是 LLM 判断）

| 方案 | 问题 |
|---|---|
| 检索全部，靠 LLM 判断 | LLM 可能泄露越权信息 |
| **检索前过滤**（本项目） | 越权内容根本不进候选集，从源头杜绝 |

> **最安全的隔离在检索层**：权限外数据根本不进入候选集。

## 八、设备运维的隔离示例

```
普通员工问"空压机的安全设置参数"（越权）
  → DataScope(role="employee", tenant="plant_a")
  → 过滤：visibility in [public, internal] and array_contains(allowed_roles,"employee")
  → 核心参数是 confidential + 角色[senior_engineer] → 不检索到
  → 系统答："知识库中没有找到相关内容"
```

## 九、数据隔离测试（运维版）

```python
def test_confidential_device_data_not_visible():
    scope = DataScope(role="technician", tenant_id="plant_a")
    docs = search("安全设置", scope)
    assert all(d.metadata["visibility"] != "confidential" for d in docs)

def test_other_plant_invisible():
    scope = DataScope(role="engineer", tenant_id="plant_a")
    docs = search("plant_b 设备", scope)
    assert all(d.metadata["tenant_id"] == "plant_a" for d in docs)
```

---

**本篇小结**：设备数据隔离靠"租户/source/可见性/角色/版本"五维 + 检索层强制过滤 + 安全转义，从源头杜绝越权。下一篇讲文档入库。
