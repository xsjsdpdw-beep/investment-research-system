# Data Storage Map

当前这套 `投研体系` 的数据，分成两类：

- backend-managed files：由后端写入用户目录的文件数据
- browser-managed local data：由浏览器 `localStorage` 保存的本地数据

这份文档只描述当前行为，不做迁移建议，也不改变现有路径命名。

## Backend-Managed Files

这部分数据不在仓库目录里，而是在当前用户目录下保存。重新下载或覆盖 `/Users/leo/Documents/投研体系` 不会直接清掉它们。

### Portfolio Data

- 默认路径：`~/.vibe-research/portfolio.json`
- 用途：保存“我的持仓”和已清仓记录
- 覆盖方式：设置 `VR_DATA_DIR` 后，持仓文件会改为写入 `"$VR_DATA_DIR/portfolio.json"`
- 兼容说明：较早版本曾写到仓库内 `backend/.cache/portfolio.json`，当前版本首次启动时会尝试迁移到用户目录

### Report Files

- 默认路径：`~/.vibe-research/myreports/`
- 用途：保存“我的研报”上传文件和对应索引
- 覆盖方式：
  - 设置 `VR_REPORTS_DIR`：直接指定研报目录
  - 只设置 `VR_DATA_DIR`：研报目录默认变为 `"$VR_DATA_DIR/myreports/"`
- 兼容说明：较早版本曾写到仓库内 `backend/.cache/myreports/`，当前版本会在合适条件下迁移到用户目录

## Browser-Managed Local Data

这部分数据存在浏览器本地 `localStorage` 中，不在仓库目录，也不在后端用户目录里。换浏览器、清浏览器站点数据或换浏览器 profile 时，这些内容可能会丢失。

### Watchlist

- key：`vr-watchlist`
- 用途：保存自选股代码列表

### Research Notes

- key：`vr-notes`
- 用途：保存研究记录、AI 输出沉淀和复盘笔记

### AI Config

- key：`vr-llm`
- 用途：保存 AI 接入配置，包括 provider、baseURL、apiKey、model

### Backend Access Key

- key：`vr-access-key`
- 用途：保存后端访问密钥，对应部署时启用的 `VR_API_KEY`

### Theme Preference

- key：`vr-theme`
- 用途：保存亮色 / 暗色主题选择

### Sidebar State

- key：`vr-sidebar`
- 用途：保存侧边栏展开 / 收起状态

## Environment Variable Overrides

当前与数据路径直接相关的环境变量主要有两个：

### `VR_DATA_DIR`

- 作用：覆盖后端默认用户数据根目录
- 影响：
  - 持仓文件默认写入 `"$VR_DATA_DIR/portfolio.json"`
  - 如果没有单独设置 `VR_REPORTS_DIR`，研报目录默认写入 `"$VR_DATA_DIR/myreports/"`

### `VR_REPORTS_DIR`

- 作用：单独覆盖研报目录
- 影响：上传的“我的研报”文件和索引写入这个目录，而不是默认的 `~/.vibe-research/myreports/`

### Related Security Setting

- `VR_API_KEY` 不是数据路径配置
- 它的作用是给后端接口加访问鉴权，防止公网部署时被未授权访问

## Compatibility Notes

当前命名和路径保持不变，目的是兼容已有本地数据和浏览器设置：

- `~/.vibe-research` 目录名暂时不改
- 浏览器 key 仍保留 `vr-` 前缀
- 这一步只是把当前落点讲清楚，不做任何迁移

## Backup Guidance

如果我们想保住已有数据，建议按两类分别看：

### Back Up Backend-Managed Files

备份以下目录或文件即可覆盖后端写入的数据：

- `~/.vibe-research/portfolio.json`
- `~/.vibe-research/myreports/`

如果你已经使用了 `VR_DATA_DIR` 或 `VR_REPORTS_DIR`，则按实际生效路径备份。

### Back Up Browser-Managed Local Data

浏览器本地数据不跟随后端目录走：

- `vr-watchlist`
- `vr-notes`
- `vr-llm`
- `vr-access-key`
- `vr-theme`
- `vr-sidebar`

如果需要保留这部分内容，当前可行方式是备份浏览器 profile；后续如果我们做导入导出能力，再补更直接的工作流。
