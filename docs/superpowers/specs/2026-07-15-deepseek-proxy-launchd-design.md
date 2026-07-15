# DeepSeek Proxy Launchd Design

## Goal

让本地 DeepSeek Codex 代理在 macOS 登录后自动常驻启动，避免每次手动开代理。

## Scope

- 使用 `~/Library/LaunchAgents` 注册用户级 `launchd` 服务。
- 使用 `~/.codex/deepseek-proxy.env` 保存 `DEEPSEEK_API_KEY`。
- 复用现有 `scripts/dev-deepseek-codex-proxy.sh` 作为实际启动入口。
- 提供安装、卸载、状态检查脚本。

## Architecture

用一个小的 Python 模块负责生成 `plist` 内容，方便测试。安装脚本创建环境文件、日志目录与 `LaunchAgent plist`，然后执行 `launchctl bootstrap/kickstart`。

代理仍然监听 `127.0.0.1:8787`，只是从“手动前台启动”切换成“登录后自动拉起”。

## Verification

- 单测验证 `plist` 的关键字段。
- 本机安装后用 `launchctl print` 验证服务已注册。
- 用 `curl http://127.0.0.1:8787/health` 验证代理在线。
