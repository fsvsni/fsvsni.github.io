---
title: "系列二·第17篇 知识库版本管理：SOP 更新怎么安全上线"
date: 2026-08-27 22:40:00
tags:
  - RAG
  - 版本管理
categories:
  - 设备运维 RAG
---

> 对应课件：第 14 讲 版本管理与知识治理
> 本篇目标：从**设备运维**视角讲版本管理——告警 SOP、维修手册会更新，系统如何安全上线新版本，避免运维人员查到过期处理流程。

## 一、为什么运维版本管理更关键

**告警 SOP 更新**意味着处理流程变了：
- 旧版：P0 告警先电话通知主管
- 新版：P0 告警先停机 + 线上工单 + 通知主管

如果系统还检索旧版，运维人员按旧流程处理 → 可能造成安全事故。**版本正确性是运维的命脉**。

## 二、版本生命周期

```
draft（草稿）→ active（已激活）→ archived（已归档）→ deleted（删除）
```

| 状态 | 检索时 |
|---|---|
| draft | 不参与检索 |
| active | 参与检索 |
| archived | 不参与检索（可追溯） |
| deleted | 不可见 |

## 三、版本快照

```python
def create_snapshot(scenario_id, version_label, data_pack):
    return KBSnapshot(
        scenario_id=scenario_id,
        version_label=version_label,   # 如 sop_2026v3
        data_pack_id=data_pack.id,
        status="draft",
        created_at=now(),
    )
```

> SOP 更新 = 新版本快照，不是零散改文件。

## 四、激活机制

```python
def activate_version(kb_version):
    deactivate(active_versions(scenario_id=kb_version.scenario_id))
    kb_version.status = "active"
    kb_version.activated_at = now()
    cache.invalidate_namespace(kb_version.scenario_id)   # 关键：缓存失效
    version_history.append(kb_version)
```

### 为什么激活必须缓存失效

如果旧 SOP 还在缓存里，运维人员提问仍可能命中旧处理流程 → **事故**。

```python
# 激活新版本 → 使相关缓存失效
cache.invalidate_namespace(kb_version.scenario_id)
```

### 检索过滤 active 版本

```python
expr = f'source == "alarm" and kb_version == "{active_sop_version}"'
```

## 五、版本差异与审计

```python
def diff_versions(old, new):
    changes = []
    for source in ["inspection", "alarm", "repair", "work_order"]:
        added = set(new.docs.get(source, [])) - set(old.docs.get(source, []))
        removed = set(old.docs.get(source, [])) - set(new.docs.get(source, []))
        if added: changes.append({"source": source, "type": "added", "items": added})
        if removed: changes.append({"source": source, "type": "removed", "items": removed})
    return changes
```

> 变更审计：SOP 改了什么，何时上线，责任可追溯。

## 六、版本废弃与清理

```python
def cleanup_versions(scenario_id, keep_archived=3):
    old = get_archived_versions(scenario_id)
    if len(old) > keep_archived:
        for v in old[:-keep_archived]:
            delete_version(v)
            remove_from_milvus(v)
```

> 归档保留几份追溯，更早的清理，兼顾合规与存储。

## 七、设备运维场景的版本落点

| 运维需求 | 版本管理支撑 |
|---|---|
| 告警 SOP 更新 | 新版本激活 → 缓存失效 → 检索新版 |
| 维修手册修订 | 快照新手册 → 激活 |
| 安全事故审计 | 版本快照 + diff 记录 |
| 巡检表换版 | 版本切换 → 过滤 |

## 八、版本管理测试

```python
def test_activate_invalidates_cache():
    activate_version(v2)
    assert not cache.has_namespace("equipment_ops")

def test_alarm_search_uses_active_version():
    activate_version(sop_2026v3)
    docs = search("P0告警", ...)
    assert all(d.metadata["kb_version"] == "sop_2026v3" for d in docs)
```

---

**本篇小结**：SOP/手册更新通过"快照+状态机+激活+缓存失效"安全上线，运维人员永远查到当前有效流程。下一篇讲数据隔离。
