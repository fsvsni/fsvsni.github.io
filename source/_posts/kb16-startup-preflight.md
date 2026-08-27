---
title: "系列一·第16篇 启动自检：环境不对就绝不假启动"
date: 2026-08-27 18:30:00
series_group: 1
series_order: 16
tags:
  - RAG
  - 启动校验
  - Preflight
categories:
  - 企业知识库 RAG
---

> 对应课件：第 13 讲 启动自检与前置校验
> 本篇目标：讲清企业知识库的**启动自检（Preflight）**——为什么服务启动前要全面校验环境，校验哪些项目，校验失败怎么处理。

## 一、为什么需要启动自检

服务依赖大量外部资源（MySQL、Milvus、Redis、模型、LLM）。如果环境配置错了却"假启动"，会在运行时才报错，难以排查。

**设计原则：环境不对，就绝不假启动**——启动阶段把问题暴露出来，给出明确报错。

## 二、Preflight 校验内容

| 校验项 | 目的 | 失败处理 |
|---|---|---|
| **占位符检测** | 发现 `.env` 里还是示例值 | 拒绝启动 |
| **TCP 连接校验** | MySQL/Redis/Milvus 端口可连 | 明确报错 |
| **路径校验** | 模型目录存在 | 明确报错 |
| **Milvus URI 校验** | 向量库连接正常 | 明确报错 |
| **LLM 运行态探测** | DashScope key 有效 | 警告或失败 |

### 2.1 占位符检测

```python
# qa_core/config/preflight.py
def check_placeholder(settings):
    placeholders = [
        ("DASHSCOPE_API_KEY", "your-api-key"),
        ("MYSQL_PASSWORD", "your-password"),
    ]
    for key, placeholder in placeholders:
        if getattr(settings, key) == placeholder:
            raise ConfigError(f"{key} 还是占位符，请先填写真实值")
```

> 防止"配置忘了填"导致的假启动。

### 2.2 TCP 连接校验

```python
def check_tcp(host, port, name, timeout=3):
    try:
        with socket.create_connection((host, port), timeout):
            return True
    except OSError as e:
        raise ConfigError(f"{name} 无法连接 {host}:{port}: {e}")
```

对 MySQL（3306）、Redis（6379）、Milvus（19530）逐一校验。

### 2.3 路径校验

```python
def check_model_paths(settings):
    for path in [settings.EMBEDDING_MODEL_PATH,
                 settings.RERANKER_MODEL_PATH,
                 settings.INTENT_MODEL_PATH]:
        if not os.path.isdir(path):
            raise ConfigError(f"模型目录不存在: {path}")
```

### 2.4 Milvus URI 校验

```python
def check_milvus(uri):
    try:
        client = MilvusClient(uri=uri)
        client.list_collections()   # 连接测试
    except Exception as e:
        raise ConfigError(f"Milvus 连接失败: {e}")
```

### 2.5 LLM 运行态探测

```python
def check_llm(settings):
    try:
        llm = ChatOpenAI(base_url=settings.DASHSCOPE_BASE_URL,
                         api_key=settings.DASHSCOPE_API_KEY)
        llm.invoke("ping")   # 最小调用
    except Exception:
        raise ConfigError("DashScope API key 无效或网络不可达")
```

## 三、环境前置校验的使用方式

### 3.1 手动 CLI 校验

```bash
# 在容器/宿主机上手动执行校验
python scripts/preflight_check.py
```

### 3.2 启动时自动校验

```python
# qa_core/config/preflight.py — 在配置加载后自动执行
def run_preflight(settings):
    check_placeholder(settings)
    check_tcp(settings.MYSQL_HOST, 3306, "MySQL")
    check_tcp(settings.REDIS_HOST, 6379, "Redis")
    check_tcp(settings.MILVUS_HOST, 19530, "Milvus")
    check_model_paths(settings)
    check_milvus(settings.MILVUS_URI)
    check_llm(settings)
    logger.info("Preflight checks passed.")
```

> 如果任何一项失败，`ConfigError` 抛出，应用拒绝启动，日志给出明确原因。

## 四、校验失败的处理方式

```python
# qa_core/api/app.py 启动时
try:
    run_preflight(settings)
except ConfigError as e:
    logger.error(f"Preflight failed: {e}")
    sys.exit(1)   # 启动失败，退出码非0
```

> **拒绝启动**比"假启动后运行时爆炸"好得多。

## 五、与企业知识库场景的关系

`enterprise_knowledge` 场景启动时：
- 校验模型目录存在（BGE-M3 等）
- 校验 Milvus 连接 + 场景 collection 存在
- 校验 LLM key 有效
- 校验 MySQL 连接（会话历史存储）

## 六、测试启动自检

```python
# tests/test_startup_preflight.py
def test_placeholder_detected():
    settings = make_settings(api_key="your-api-key")
    with pytest.raises(ConfigError):
        run_preflight(settings)

def test_missing_model_path_detected():
    settings = make_settings(model_path="/nonexistent")
    with pytest.raises(ConfigError):
        run_preflight(settings)
```

## 七、故障排查口诀

```
服务起不来？
  → 看启动日志第一条报错
  → 占位符没填？→ 填 .env
  → MySQL/Milvus 连不上？→ docker compose ps 查容器
  → 模型目录缺失？→ 检查 ./models
  → LLM key 无效？→ 检查 DashScope
```

---

**本篇小结**：启动自检把"环境错误"挡在启动阶段，五项校验覆盖配置、连接、模型、LLM。拒绝假启动，运行时才稳定。下一篇讲版本管理。
