---
title: "系列二·第16篇 启动自检：运维系统不能带病运行"
date: 2026-08-27 22:30:00
series_group: 2
series_order: 16
tags:
  - RAG
  - 启动校验
categories:
  - 设备运维 RAG
---

> 对应课件：第 13 讲 启动自检与前置校验
> 本篇目标：从**设备运维**视角讲启动自检——为什么设备运维系统启动前必须全面校验环境，校验哪些项，失败怎么处理。

## 一、为什么设备运维系统更要自检

设备运维系统支撑**生产安全**相关咨询。如果环境没配好就"假启动"：
- 巡检员问告警处理，Milvus 没连上 → 答不出来
- SOP 模型缺失 → 检索全是空
- LLM key 失效 → 生成报错

**环境不对，就绝不假启动**——启动阶段把问题暴露，给出明确报错。

## 二、Preflight 校验项（运维版）

| 校验项 | 目的 |
|---|---|
| **占位符检测** | .env 是否还是示例值 |
| **TCP 连接** | MySQL/Redis/Milvus 端口 |
| **模型路径** | BGE-M3/Reranker/BERT 目录存在 |
| **Milvus URI** | 四类 collection 可连 |
| **LLM 探测** | DashScope key 有效 |

### 2.1 占位符检测

```python
def check_placeholder(settings):
    for key, placeholder in [("DASHSCOPE_API_KEY", "your-api-key"), ...]:
        if getattr(settings, key) == placeholder:
            raise ConfigError(f"{key} 还是占位符")
```

### 2.2 TCP 连接

```python
def check_tcp(host, port, name, timeout=3):
    try:
        with socket.create_connection((host, port), timeout):
            return True
    except OSError as e:
        raise ConfigError(f"{name} 无法连接: {e}")
```

### 2.3 模型路径

```python
def check_model_paths(settings):
    for path in [settings.EMBEDDING_MODEL_PATH,
                 settings.RERANKER_MODEL_PATH,
                 settings.INTENT_MODEL_PATH]:
        if not os.path.isdir(path):
            raise ConfigError(f"模型目录不存在: {path}")
```

### 2.4 场景 collection 校验

```python
def check_scenario_collections(settings):
    client = MilvusClient(uri=settings.MILVUS_URI)
    for collection in ["equipment_ops_inspection", "equipment_ops_alarm",
                       "equipment_ops_repair", "equipment_ops_work_order"]:
        if not client.has_collection(collection):
            raise ConfigError(f"collection 不存在: {collection}，请先运行 rebuild_scenarios.py")
```

> 设备运维特有：**四类 collection 必须存在**，否则启动无意义。

## 三、校验失败处理

```python
try:
    run_preflight(settings)
except ConfigError as e:
    logger.error(f"Preflight failed: {e}")
    sys.exit(1)   # 拒绝启动
```

## 四、手动校验

```bash
# 手动执行启动自检
python scripts/preflight_check.py
```

## 五、设备运维场景的启动检查重点

- 四类 collection（inspection/alarm/repair/work_order）存在
- 当前 SOP 版本有 active 状态
- 模型目录完整
- 巡检/告警资料已入库（至少非空）

## 六、测试启动自检

```python
def test_missing_collection_detected():
    settings = make_settings(milvus_without_equipment_collections=True)
    with pytest.raises(ConfigError):
        run_preflight(settings)
```

---

**本篇小结**：启动自检把环境错误挡在启动阶段，设备运维还额外校验四类 collection。下一篇讲版本管理。
