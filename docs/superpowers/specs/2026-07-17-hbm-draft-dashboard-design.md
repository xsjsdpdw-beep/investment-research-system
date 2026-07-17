# HBM 初稿看板实验设计

日期：2026-07-17

## 1. 背景

当前行业概览的“初稿”已经具备自动提取、结构化预览、候选池和有道主笔记同步等能力，但展示层仍以通用文档流为主：

- 自动生成结果主要表现为文字模块
- 已有 `StructuredRenderBlock` 能力，但缺少行业主题化 schema
- 初稿更像“摘要页”，不是“单屏看板”

用户希望先以 `HBM` 为试验对象，把初稿做成固定五栏目 tab 看板：

- `总览`
- `技术代际`
- `成本与卡口`
- `产业龙头`
- `周期温度计`

目标不是改深度，不是改所有行业，而是在当前系统里验证一条更高质量的“行业主题 schema -> 看板渲染”链路。

## 2. 本期目标

本期只完成以下事情：

1. 只对 `HBM` 行业概览初稿启用专用 schema
2. 初稿展示改为五个 tab 的看板形式
3. 后端为 HBM 生成固定结构数据，而不是仅生成通用 markdown 模块
4. 前端为 HBM 初稿提供专用 renderer，显示信息卡、对比条、时间轴、温度状态等原生结构块

## 3. 不做什么

本期明确不做：

- 不改 `HBM` 深度区
- 不改 `光互联` 或其他行业
- 不替换通用 `StructuredOverviewRenderer` 的整体逻辑
- 不为所有行业新增专用 schema
- 不接入外部图片海报生成
- 不追求与外部示例逐像素一致

## 4. 用户体验定义

当用户在行业中心选择 `HBM`，并进入 `行业概览 -> 初稿` 时：

1. 初稿顶部出现五个固定 tab
2. tab 顺序固定，不受自动提取结果标题影响
3. 每个 tab 内部显示为“单屏看板式布局”，而不是长文档流
4. 若 HBM 专用结构数据缺失，则回退到现有通用初稿预览
5. 对除 `HBM` 外的任何行业，页面行为完全不变

## 5. 方案对比

### 方案 A：只改前端样式

做法：

- 继续使用现有通用初稿文本
- 前端按标题或关键词把内容硬拆成五个 tab

优点：

- 改动快

缺点：

- 内容质量不稳定
- 标题和层级容易漂移
- 很难生成真正内嵌式图表

### 方案 B：HBM 专用 schema + HBM 专用 renderer

做法：

- 后端为 HBM 额外生成固定 schema
- 前端只在 HBM 初稿命中时调用专用看板组件

优点：

- 内容和展示都稳定
- 可控地做出结构化看板
- 只影响一个行业、一个区域，风险最小

缺点：

- 需要增加一层 HBM 专用数据模型

### 方案 C：重做所有行业初稿模型

做法：

- 把全部行业概览统一升级为行业主题 schema 体系

优点：

- 长期上限高

缺点：

- 范围过大，不适合当前试验

推荐采用 `方案 B`。

## 6. 总体设计

### 6.1 后端职责

在现有行业概览构建逻辑之外，为 `HBM` 增加一个专用生成链：

- 继续复用现有 HBM 资料源收集逻辑
- 继续复用现有句子筛选、研报摄取和相关度排序能力
- 但不再把结果只落成通用“行业概览模块文本”
- 额外生成一份 `HBM 初稿看板结构数据`

### 6.2 前端职责

在行业概览初稿展示时：

- 若 `selectedSector === "HBM"` 且存在 HBM 看板结构数据，则优先渲染 HBM 看板
- 否则保持当前通用初稿展示路径不变

### 6.3 数据存储策略

本期不新开独立数据表。

优先将 HBM 看板结构数据保存在现有 `overview workbench` 的 `draft_structured_blocks` 或可兼容的扩展字段中，确保：

- 不破坏已有工作台读取逻辑
- 不需要改动深度卡片存储模型
- 结构预览和回退能力可共存

如果现有 `draft_structured_blocks` 难以清晰承载 HBM 看板元数据，则允许在 workbench 中新增一个仅服务初稿的字段，例如：

- `draft_render_recipe`
- `draft_theme_schema`

字段命名以实现时最小改动为准，但只允许用于 `scope_type=sector` 且 `scope_id=HBM` 的初稿渲染。

## 7. HBM schema

HBM 初稿固定输出五个 tab，每个 tab 的 key、标题和展示顺序写死：

1. `overview` -> `总览`
2. `generation` -> `技术代际`
3. `cost_bottleneck` -> `成本与卡口`
4. `leaders` -> `产业龙头`
5. `cycle_meter` -> `周期温度计`

### 7.1 总览

建议字段：

- `headline`
- `thesis`
- `why_now`
- `chain_nodes[]`
- `key_metrics[]`
- `watch_points[]`
- `sources[]`

展示目标：

- 一句话讲清 HBM 当前主矛盾
- 用 3-5 个关键指标表达热度和约束
- 用简化产业链链路表示位置关系

### 7.2 技术代际

建议字段：

- `generations[]`
- `comparison_dimensions[]`
- `packaging_notes[]`
- `upgrade_signals[]`
- `sources[]`

其中 `generations[]` 每项至少包含：

- `name`
- `bandwidth`
- `capacity`
- `stack_layers`
- `status`

展示目标：

- 做成代际阶梯或横向对比条
- 让读者一眼看清从 HBM2E 到 HBM3E 及后续演进的区别

### 7.3 成本与卡口

建议字段：

- `cost_stack[]`
- `bottlenecks[]`
- `yield_risks[]`
- `capex_points[]`
- `watch_points[]`
- `sources[]`

展示目标：

- 用成本堆栈卡或占比条展示成本结构
- 用告警卡展示良率、产能、封装、设备、材料等卡点

### 7.4 产业龙头

建议字段：

- `global_leaders[]`
- `china_mapping[]`
- `positioning_matrix[]`
- `who_wins_where[]`
- `sources[]`

展示目标：

- 讲清全球龙头、环节卡位和 A 股映射
- 不做股票推荐，只做产业角色定位

### 7.5 周期温度计

建议字段：

- `temperature_label`
- `temperature_score`
- `signals[]`
- `validation_events[]`
- `inventory_signal`
- `price_signal`
- `capex_signal`
- `sources[]`

展示目标：

- 用 1 个温度状态概括景气位置
- 再用几条信号解释温度为何如此

## 8. 提取逻辑

HBM 看板提取不依赖自由生成标题，而是按固定 tab 目标做定向抽取。

提取流程：

1. 收集 HBM 相关资料源
2. 沿用现有 HBM 关键词和相关度打分
3. 对资料句子进行去重和排序
4. 按五个 tab 的字段目标做归类
5. 生成 HBM schema 数据
6. 将 schema 转换为前端可渲染的结构块

### 8.1 资料源

继续复用现有：

- 知识库条目
- 自定义行业模块
- 行业指标
- 本地研报与附件
- 自动摄取的公开行业研报

### 8.2 归类原则

每个 tab 只吸收与自身目标直接相关的信息。

例如：

- 出现代际、层数、带宽、封装演进的信息，优先进入 `技术代际`
- 出现良率、设备、产能、成本、供给约束的信息，优先进入 `成本与卡口`
- 出现龙头、份额、环节卡位、映射关系的信息，优先进入 `产业龙头`
- 出现库存、价格、扩产、验证节点的信息，优先进入 `周期温度计`

### 8.3 内容风格约束

提取出的内容必须服务看板表达，而不是写成长文。

因此生成结果应以：

- 短标题
- 单句结论
- 短项列表
- 指标项
- 对比项

为主，避免输出长段落正文。

## 9. 前端渲染设计

### 9.1 入口判断

在 [frontend/src/pages/Framework.tsx](/Users/leo/Documents/投研体系/frontend/src/pages/Framework.tsx:5959) 的行业概览初稿区增加 HBM 判断：

- 行业为 `HBM`
- 初稿结构数据中存在 HBM 专用 schema 或 render recipe

命中后渲染 `HBMDraftDashboard`

未命中则继续走现有：

- `renderStructuredOverviewShell`
- `renderOverviewPreviewShell`

### 9.2 组件划分

新增一个专用组件，例如：

- `frontend/src/components/research/HBMDraftDashboard.tsx`

职责：

- 渲染 tab 条
- 为五个 tab 输出固定布局
- 对移动端做顺序堆叠
- 不提供深度编辑器逻辑

### 9.3 布局原则

视觉方向：

- 深色底看板风格
- 强信息密度
- 卡片、横向对比条、温度条、信号 chips 为主
- 每个 tab 尽量单屏闭环

为了控制范围，本期不追求复杂动画，只做：

- tab 切换
- 轻量 hover / focus 状态

### 9.4 编辑策略

本期 HBM 看板只做“展示优先”。

不在这个试验里引入对每个信息卡的逐块编辑。需要编辑时，仍走现有概览工作台已有编辑路径。

## 10. 接口与类型

### 10.1 后端

现有 `build_sector_overview_modules(sector)` 保持为总入口。

当 `sector == "HBM"` 时：

- 额外调用 `build_hbm_draft_dashboard(...)`
- 将结果写入 workbench 的初稿结构字段

### 10.2 前端类型

在 [frontend/src/lib/api.ts](/Users/leo/Documents/投研体系/frontend/src/lib/api.ts:603) 附近扩展初稿可读结构类型，新增 HBM 专用类型定义，例如：

- `HBMDraftDashboardData`
- `HBMDraftTab`
- `HBMGenerationItem`
- `HBMBottleneckItem`
- `HBMLeaderItem`
- `HBMCycleSignal`

类型只服务 HBM 初稿，不应污染通用深度卡片模型。

## 11. 错误处理与回退

必须保证任何异常都不会影响其他行业。

规则如下：

1. HBM schema 生成失败：
   回退到现有通用初稿展示
2. HBM schema 部分字段缺失：
   对应 tab 显示“资料不足”占位，不中断整页
3. 前端 renderer 识别失败：
   回退到 `renderStructuredOverviewShell`
4. 其他行业：
   不走 HBM 分支

## 12. 测试策略

### 12.1 后端测试

新增针对 HBM 初稿的测试，至少覆盖：

- HBM 会生成五个固定 tab
- tab 顺序固定
- 缺字段时仍返回合法结构
- 非 HBM 行业不会命中 HBM schema

### 12.2 前端测试

至少覆盖：

- `HBM` 初稿命中专用 renderer
- 非 `HBM` 行业不命中
- 五个 tab 能正确切换
- 缺失字段时展示占位，不崩溃

### 12.3 回归验证

至少验证：

- HBM 初稿正常显示
- HBM 深度无变化
- 光互联与其他行业概览无变化
- 现有结构化初稿与编辑链路无回归

## 13. 实施边界

允许修改：

- `backend/research_hub.py`
- `backend/app.py` 或相关 workbench 保存逻辑
- `frontend/src/lib/api.ts`
- `frontend/src/pages/Framework.tsx`
- 新增 HBM 初稿专用组件
- 新增对应测试

不允许修改：

- 深度区的展示和交互
- 非 HBM 行业概览的展示逻辑
- 现有候选池行为
- 行业中心其他页面的布局

## 14. 成功标准

本次试验完成后，满足以下标准即算成功：

1. 只有 `HBM` 初稿新增看板展示
2. 五个 tab 固定出现，顺序稳定
3. 看板内容不再是纯长文，而是结构化卡片和原生信息图块
4. HBM 以外页面无可见变化
5. 失败时能稳定回退到现有通用展示

