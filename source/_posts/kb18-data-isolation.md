---
title: "系列一·第18篇 数据隔离：企业知识的权限红线"
date: 2026-08-27 18:50:00
tags:
  - RAG
  - 数据隔离
  - 数据安全
categories:
  - 企业知识库 RAG
---

> 对应课件：第 15 讲 数据隔离与安全治理
> 本篇目标：讲清企业知识库的**数据隔离体系**——为什么不能让 HR 制度被普通员工查到、隔离维度有哪些、检索怎么读取过滤、写入怎么分区。

## 一、为什么数据隔离是红线

企业知识库的资料**不是所有员工都能看**：
- HR 的薪酬制度 → 只有 HR 和管理层可见
- 财务的报销细则 → 全员可看但需内部可见
- 机密商业资料 → 仅特定角色可见

如果检索不隔离，员工可能通过提问"套出"越权信息——这是**企业合规事故**。

## 二、五大隔离维度

| 维度 | 含义 | 例子 |
|---|---|---|
| **租户（Tenant）** | 多租户之间的隔离 | 不同公司的知识库互不可见 |
| **Source** | 资料源隔离 | hr / it / finance 分开管理 |
| **可见性** | 公开/内部/机密 | visibility 字段 |
| **角色** | 谁能看 | allowed_roles 字段 |
| **版本** | 版本隔离 | 只检索 active 版本 |

## 三、Schema 中的隔离字段

```python
FieldSchema(name="tenant_id", dtype=DataType.VARCHAR, max_length=64),
FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=32),
FieldSchema(name="visibility", dtype=DataType.VARCHAR, max_length=16),   # public/internal/confidential
FieldSchema(name="allowed_roles", dtype=DataType.ARRAY,
            element_type=DataType.VARCHAR, max_capacity=16),             # ["employee","hr"]
```

## 四、读取过滤：检索时如何隔离

### 4.1 构建过滤表达式（DataScope 强制注入）

```python
# qa_core/governance/data_scope.py
def build_filter(scope: DataScope) -> str:
    parts = []
    # 版本：只查 active 版本
    if scope.active_kb_version:
        parts.append(f'kb_version == "{scope.active_kb_version}"')
    # 租户：必带
    parts.append(f'tenant_id == "{scope.tenant_id}"')
    # source 过滤
    if scope.sources:
        parts.append("(" + " or ".join(f'source == "{s}"' for s in scope.sources) + ")")
    # 可见性 + 角色
    parts.append(f'visibility in {scope.visible_visibilities()}')
    parts.append(f'array_contains(allowed_roles, "{scope.role}")')
    return " and ".join(parts)
```

> **DataScope 强制注入**：无论检索函数怎么调用，过滤表达式必然带上租户/版本/角色条件，防止遗漏。

### 4.2 过滤表达式与安全转义

```python
# qa_core/governance/data_scope.py
def escape_expr_value(value):
    return value.replace('"', '\\"').replace("'", "\\'")
```

> **为什么必须转义**：如果用户输入 `source='hr" or 1==1 or "'`，拼进表达式会绕过 source 过滤，导致数据泄露。转义是安全底线。

## 五、写入隔离：入库时如何分区

### 5.1 入库时必须带隔离字段

```python
def ingest_document(doc, source, tenant_id, visibility, roles):
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
        }
        for chunk in chunks
    ]
    collection.insert(records)
```

> 每个 chunk 入库即携带隔离元数据，检索时才能按元数据过滤。

### 5.2 Collection 分区策略

```python
# qa_core/retrieval/store.py
def get_collection_name(scenario_id, kind, tenant_id):
    return f"{scenario_id}_{kind}"   # 或按租户分区
```

**策略对比**：

| 策略 | 说明 |
|---|---|
| 同一 Collection + 字段过滤 | 简单，依赖过滤表达式正确性 |
| 按租户分 Collection | 隔离更硬，成本更高 |

本项目 V1 采用 **同一 Collection + 强制过滤表达式**，并配合安全转义与测试保护。

## 六、为什么检索要带过滤（而不是 LLM 判断）

| 方案 | 问题 |
|---|---|
| 检索全部，靠 LLM 判断"能不能说" | LLM 可能泄露越权信息，不可靠 |
| **检索前过滤**（本项目） | 越权内容**根本不被检索到**，LLM 无从泄露 |

> **最安全的隔离是在检索层**：权限外的数据根本不进入候选集，从源头杜绝越权输出。

## 七、常见越权风险与防护

| 风险 | 防护 |
|---|---|
| 用户注入绕过 source 过滤 | `escape_expr_value` 安全转义 |
| 检索函数忘记带过滤 | DataScope 强制注入 |
| 越权 source 请求 | `_validate_source` 白名单校验 |
| 旧版本数据残留 | 版本激活缓存失效 + 版本过滤 |

## 八、数据隔离测试

```python
# tests/test_data_isolation.py
def test_hr_data_not_visible_to_employee():
    scope = DataScope(role="employee", tenant_id="company_a")
    docs = search("薪酬制度", scope)
    assert all(d.metadata["visibility"] != "confidential" for d in docs)
    assert all("hr" not in d.metadata["source"] or "hr" in d.metadata["allowed_roles"]
               for d in docs)

def test_injection_blocked():
    malicious = 'hr" or 1==1 or "'
    safe = escape_expr_value(malicious)
    assert '"' not in safe
```

## 九、企业知识库场景的隔离示例

```
普通员工问"公司的薪酬保密制度"（越权）
  → DataScope(role="employee", tenant="company_a")
  → 过滤：visibility in [public, internal] and array_contains(allowed_roles,"employee")
  → 薪酬保密制度是 confidential + 角色[hr] → 不被检索到
  → 系统答："知识库中没有找到相关内容"
```

---

**本篇小结**：数据隔离的五维体系（租户/source/可见性/角色/版本）+ 检索层强制过滤 + 安全转义，从源头杜绝越权输出。这是企业知识库的合规底线。下一篇讲文档入库。
