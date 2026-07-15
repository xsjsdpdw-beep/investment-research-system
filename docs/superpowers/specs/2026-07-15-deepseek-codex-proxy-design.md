# DeepSeek Codex Proxy Design

## Goal

在本机提供一个极小的 OpenAI Responses API 兼容代理，让 Codex 可以通过本地 `model_provider` 使用 DeepSeek。

## Scope

- 新增一个本地 FastAPI 代理服务。
- 暴露 `POST /v1/responses` 和基础 `GET /v1/models`、`GET /health`。
- 将 Codex 发来的 Responses 请求翻译为 DeepSeek `chat/completions` 请求。
- 将 DeepSeek 返回结果包装为最小可用的 Responses 结果。
- 支持基础文本对话、工具定义透传、工具调用回包。

## Non-Goals

- 不做流式转发。
- 不做图片输入支持。
- 不做完整 Responses 全字段兼容，只覆盖 Codex 启动和工具回合所需的核心字段。

## Architecture

代理单独放在 `backend/deepseek_codex_proxy.py`。它读取本地环境变量 `DEEPSEEK_API_KEY`，把 `/v1/responses` 请求转成 `https://api.deepseek.com/chat/completions`，再把响应映射回 Responses 结构。

Codex 配置中的 `base_url` 指向本机代理，例如 `http://127.0.0.1:8787/v1`。这样 Codex 仍然以 Responses 协议工作，而 DeepSeek 只看到兼容的 Chat Completions 请求。

## Error Handling

- 未设置 `DEEPSEEK_API_KEY` 时返回 500 明确报错。
- DeepSeek 非 2xx 返回时，原样透传状态码和错误主体。
- 输入内容无法映射时返回 400，而不是静默降级。

## Verification

- 单元测试验证请求翻译和返回包装。
- 本机启动代理后，直接 `curl` 代理的 `/v1/responses` 验证可用。
- 最后把 Codex `config.toml` 切到本地代理并再次发最小请求。
