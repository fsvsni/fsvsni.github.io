---
title: "系列一·第17篇 知识库版本管理：制度更新怎么安全上线"
date: 2026-08-27 18:40:00
series_group: 1
series_order: 17
tags:
  - RAG
  - 版本管理
  - 知识治理
categories:
  - 企业知识库 RAG
---

> 对应课件：14 知识库多版本管理
> 本篇目标：讲清企业知识库的**知识版本管理**——制度文件会更新（如报销额度调整），系统如何安全地把新版本上线，而不让员工查到过期制度。

## 一、为什么版本管理如此重要

企业制度**会更新**：
- 报销额度从 5000 调整到 8000
- 入职流程新增了线上环节
- 新增了 IT 安全规定

如果系统还在检索旧制度，会给出**过时甚至错误**的答案（说 5000 其实是 8000），这在财务/合规场景非常危险。

## 二、版本生命周期

一个知识库版本的生命周期：

```
draft（草稿）
  → active（已激活/线上）
  → archived（已归档/废弃）
  → deleted（删除）
```

| 状态 | 含义 | 检索时 |
|---|---|---|
| **draft** | 正在构建，未上线 | 不参与检索 |
| **active** | 已激活，线上可用 | 参与检索 |
| **archived** | 已下线归档 | 不参与检索（可追溯） |
| **deleted** | 已删除 | 不可见 |

## 三、版本快照与 data_pack

### 3.1 版本快照

**快照**是某个时间点的完整资料状态：

```python
# qa_core/governance/kb_versions.py
def create_snapshot(scenario_id, version_label, data_pack):
    snapshot = KBSnapshot(
        scenario_id=scenario_id,
        version_label=version_label,   # 如 kb_2026v3
        data_pack_id=data_pack.id,
        created_at=now(),
        status="draft",
    )
    return snapshot
```

> 版本不是"零散改文件"，而是**带状态的完整快照**。

### 3.2 data_pack 与企业仿真资料包

课件第 16 讲提到的 **data_packs/enterprise_realistic_pack**：企业仿真增强资料包，包含更真实的制度资料。这些资料按版本归入快照。

```python
# data_packs/enterprise_realistic_pack/
# 包含 hr/it/finance 增强资料，可按版本组织
data_pack = {
    "version": "v3",
    "sources": {
        "hr": [...], "it": [...], "finance": [...],
    },
}
```

> 版本 = 特定资料包在某时刻的入库结果。

## 四、激活机制

### 4.1 激活流程

```python
def activate_version(kb_version):
    # 1. 标记旧版本为 archived（或保留多版本）
    deactivate(active_versions(scenario_id=kb_version.scenario_id))
    # 2. 标记新版本为 active
    kb_version.status = "active"
    kb_version.activated_at = now()
    # 3. 使相关缓存失效
    cache.invalidate_namespace(kb_version.scenario_id)
    # 4. 记录激活事件
    version_history.append(kb_version)
```

### 4.2 为什么激活要缓存失效

如果旧版本内容还留在缓存里，员工提问仍可能命中旧制度。

```python
# 激活新版本 → 使相关缓存失效
cache.invalidate_namespace(kb_version.scenario_id)
# 下次检索强制走新版本
```

> 缓存失效是"新旧版本切换正确性"的关键闭环。

### 4.3 版本切换时检索过滤

```python
# 检索时过滤 active 版本
expr = f'kb_version == "{active_version}" and source == "{source}"'
```

## 五、版本差异与内容变更

### 5.1 什么是版本差异（diff）

记录新旧版本的**内容变化**，便于审计：

```python
def diff_versions(old, new):
    changes = []
    for source in union(old.sources, new.sources):
        added = set(new.docs.get(source, [])) - set(old.docs.get(source, []))
        removed = set(old.docs.get(source, [])) - set(new.docs.get(source, []))
        if added: changes.append({"source": source, "type": "added", "items": added})
        if removed: changes.append({"source": source, "type": "removed", "items": removed})
    return changes
```

> 版本差异用于变更审计：谁在什么时候改了哪些制度内容。

### 5.2 发布变更通知

版本激活后，可通知相关方（如 HR 制度更新）：

```
知识库企业知识库已更新至 kb_2026v3：
- hr：入职流程新增线上环节
- finance：报销额度调整为 8000 元
```

## 六、版本废弃与清理

### 6.1 废弃归档

- 新版本激活 → 旧版本归档（archived），保留可追溯
- 归档版本不参与检索

### 6.2 数据清理策略

```python
def cleanup_versions(scenario_id, keep_archived=3):
    old_versions = get_archived_versions(scenario_id)
    if len(old_versions) > keep_archived:
        for v in old_versions[:-keep_archived]:
            delete_version(v)   # 删除最早的归档
            remove_from_milvus(v)  # 清理 Milvus 数据
```

> 归档版本保留若干份用于追溯，更早的才物理清理，兼顾合规与存储成本。

## 七、版本管理在企业知识库场景的作用

| 场景需求 | 版本管理的支撑 |
|---|---|
| 报销额度调整 | 新版本激活 → 缓存失效 → 检索新额度 |
| 制度发布新流程 | 快照新资料 → 激活 |
| 需要审计历史 | 版本快照 + diff 记录 |
| 清理过期数据 | 归档保留 + 定期清理 |

## 八、版本管理测试

```python
# tests/test_kb_versions.py
def test_activate_invalidates_cache():
    activate_version(v2)
    assert not cache.has_namespace(scenario_id)

def test_search_uses_active_version():
    activate_version(v3)
    docs = search(...)
    assert all(d.metadata["kb_version"] == "kb_2026v3" for d in docs)
```

---

**本篇小结**：版本管理用"快照+状态机+激活+缓存失效"保证制度更新安全上线，员工永远查到当前有效版本。下一篇讲数据隔离——企业知识的权限红线。
