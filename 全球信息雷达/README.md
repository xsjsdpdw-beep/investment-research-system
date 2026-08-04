# 独立全球信息雷达

一个本地运行、可自行配置数据源的全球信息看板。首版支持 RSS/Atom 与 JSON API，覆盖宏观、地缘政治、全球科技、行业、个股。

## 启动

```bash
cd /Users/leo/Documents/Codex/投研体系/全球信息雷达
./scripts/start.sh
```

- Web：<http://127.0.0.1:5910>
- API：<http://127.0.0.1:8910/api/health>
- 数据：`/Users/leo/.global-information-radar/`

停止服务：

```bash
./scripts/stop.sh
```

## 使用方式

1. 打开“信息源”，添加 RSS/Atom 或 JSON API。
2. 点击“测试”确认端点和字段映射有效。
3. 点击“立即刷新”，或等待后台按源轮询。
4. 在“全部动态”中按领域、主题、来源和时间筛选。
5. “精选流”默认采用规则排序；配置可选 LLM 后才启用模型摘要、标签和精选。

## 导入投研资讯雷达来源

如果需要把主项目 `backend/news_sources.json` 中的公开 RSS 源复制到本项目：

```bash
python3 scripts/import-investment-news-sources.py --dry-run
python3 scripts/import-investment-news-sources.py
```

导入脚本只读取投研体系的来源配置，并通过本项目自己的 API 写入本项目数据库；不会修改投研体系。导入后可在“信息源”页面逐个测试，或点击“立即刷新”批量抓取。

JSON API 的默认映射字段为 `items`、`id`、`title`、`url`、`summary`、`published_at`、`author`，可以在信息源表单中修改点路径。

## 边界

项目位于“投研体系”目录内，但仍独立运行，不修改主系统的路由、侧栏或 API，也不自动复制 AI HOT 的信息源和内容。默认只保存规范化索引、摘要、标签与原文链接，不保存第三方全文或原始响应。

## 验证

```bash
./scripts/check.sh
```
