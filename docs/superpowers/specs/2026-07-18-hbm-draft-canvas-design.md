# HBM 初稿通用 Tab 画布设计

日期：2026-07-18

## 目标

把 `行业概览 -> HBM -> 初稿` 从当前的 HBM 专用五 tab 看板，升级为一套可扩展的通用 `tab + 卡片画布` 体系。

本次设计只覆盖 HBM 初稿试点，满足以下目标：

- 保留 `tab` 浏览方式，避免长内容全部堆成单页卡片流
- 把 tab 下内容升级为信息图卡片画布，而不是纯文本段落
- 支持 tab 自定义：可改名、增删、排序
- 支持卡片自定义：可新增、删除、切换模板、排序、编辑文字
- 保持 HBM 旧数据兼容，且不影响其他行业、不影响深度区

不在本次范围内：

- 不改 `深度`
- 不改 HBM 以外行业的默认展示
- 不重做个股数据页
- 不做自由拖拽式画布
- 不做任意绝对定位布局

## 用户体验

### 阅读态

HBM 初稿默认维持 `tab` 切换体验。

每个 tab 下是一块卡片画布，卡片使用统一的深色信息图视觉语言，优先复用个股数据页中已经验证过的表达方式：

- 速览结论卡
- 指标宫格
- 分位/温度条
- 对比卡
- 时间线/代际图

阅读态不显示大段输入框，也不暴露零碎编辑控件。

### 编辑态

点击 `编辑初稿` 后进入画布编辑态，但只针对“当前 tab”工作，避免全页混乱。

编辑界面分两层：

1. `Tab 工具条`
- 改标题
- 新增 tab
- 删除 tab
- 左右调整顺序

2. `当前 Tab 卡片工具条`
- 新增卡片
- 切换卡片模板
- 上下调整顺序
- 删除卡片
- 展开当前卡片编辑

卡片正文统一采用同一种编辑方式：

- 标题直接编辑
- 正文直接编辑
- 标签逐项编辑
- 指标逐格编辑
- 时间线节点逐项编辑
- 对比项逐项编辑

约束：

- 一次只编辑当前 tab
- 一次只展开一张卡片的详细编辑
- 先使用按钮式排序，不做自由拖拽
- 卡片宽度和网格采用固定模板，不开放随意拉伸

## 数据模型

### 现状

当前 `draft_theme_schema` 为 HBM 专用结构，tab key 和每类卡片字段都偏硬编码：

- `overview`
- `generation`
- `cost_bottleneck`
- `leaders`
- `cycle_meter`

这不适合推广到其他行业，因为未来每个行业的栏目结构都不同。

### 新模型

保留 `draft_theme_schema` 这个存储槽，但把内部结构升级成通用画布 schema。

建议顶层结构：

```json
{
  "kind": "industry_draft_canvas",
  "version": "v1",
  "scope": "HBM",
  "tabs": [
    {
      "id": "tab-overview",
      "title": "总览",
      "cards": [
        {
          "id": "card-summary-1",
          "type": "summary_hero",
          "title": "景气总览",
          "layout": "hero",
          "content": {}
        }
      ]
    }
  ],
  "meta": {
    "generated_at": "",
    "source_mode": "auto"
  }
}
```

### 卡片模板

第一版只支持 5 类模板：

1. `summary_hero`
- 用于行业速览
- 字段：`title`、`headline`、`bullets[]`、`tags[]`

2. `metric_grid`
- 用于指标宫格
- 字段：`title`、`items[]`
- `items[]` 每项含 `label`、`value`、`note`

3. `range_band`
- 用于分位条、温度条、区间表达
- 字段：`title`、`current_label`、`current_value`、`segments[]`

4. `comparison_cards`
- 用于路线对比、成本对比、龙头对比
- 字段：`title`、`items[]`
- `items[]` 每项含 `name`、`headline`、`detail`、`tag`

5. `timeline`
- 用于技术代际、产业进展、周期阶段
- 字段：`title`、`steps[]`
- `steps[]` 每项含 `label`、`caption`、`active`

所有卡片都允许附带：

- `sources[]`
- `footnote`
- `style_variant`

## HBM 生成逻辑

### 当前问题

当前 HBM 初稿内容少，根因不是展示层，而是提取层仍偏规则拼接，且输出结构仍然接近“文本 + 几个定制字段”。

### 目标生成方式

HBM 初稿生成时，不再直接构建 HBM 专用 tab，而是先构建通用 canvas：

1. 汇总 source pool
- 行业研报
- 已导入有道正文
- 行业概览 draft sources
- 可用的本地模块内容

2. 抽取成结构化栏目建议
- 建议 tab 名
- 每个 tab 建议卡片组合
- 每张卡片的字段内容

3. 输出 `industry_draft_canvas`

第一版仍只试点 HBM，但 schema 不能再写死成 HBM 专属类型。

### HBM 首版默认栏目

HBM 首版仍默认生成这 5 个 tab，仅作为自动初始值：

- 总览
- 技术代际
- 成本与卡口
- 产业龙头
- 周期温度计

用户后续可以：

- 改标题
- 删除任一栏目
- 新增新栏目
- 调整顺序

这 5 个栏目不再作为固定产品约束，只是 HBM 自动生成时的起始模板。

## 前端实现

### 总体策略

保留 `Framework.tsx` 现有的 HBM schema 分支入口，不改其他行业分支逻辑。

当前逻辑：

- HBM 且有 `draft_theme_schema` 时渲染 `HBMDraftDashboard`
- 否则回退 `draft_structured_blocks`

调整后：

- HBM 且 schema.kind 为 `industry_draft_canvas` 时渲染新的通用 `IndustryDraftCanvas`
- HBM 且 schema 仍为旧 `hbm_draft_dashboard` 时先映射后渲染
- 其他行业保持现状

### 组件拆分

建议新增：

- `IndustryDraftCanvas.tsx`
  - 通用 tab + card 画布容器
- `industry-draft-canvas.ts`
  - schema 适配、默认值、卡片工厂、排序 helper
- `IndustryDraftCardRenderer.tsx`
  - 按 card type 渲染不同卡片模板
- `IndustryDraftCanvasEditor.tsx`
  - 编辑工具条和卡片编辑区

当前 `HBMDraftDashboard.tsx` 保留为兼容层，后续职责只剩：

- 接旧 HBM schema
- 映射到通用 canvas schema
- 交给 `IndustryDraftCanvas` 渲染

### 视觉方向

复用个股数据模块里已经成熟的视觉表达：

- 卡片层级
- 指标宫格
- 区间带
- 轻量标签
- 深色背景信息图风格

但不直接复制个股页布局，因为行业内容更长，必须服从 `tab -> canvas -> cards` 的阅读结构。

## 后端实现

### 存储

不新开平行 workbench 文件，也不另造新的大对象入口。

继续使用：

- `overview_workbench.json`
- `draft_theme_schema`

但将 `draft_theme_schema` 升级为通用 canvas 存储槽。

### 接口

保留现有：

- `GET /api/research/overview-workbench`
- `POST /api/research/sector-overview/build`

新增一个面向 schema 编辑的保存接口，例如：

- `POST /api/research/overview-workbench/draft-theme-schema`

用途：

- 保存 tab 改名
- 保存 tab 增删排序
- 保存 card 增删排序
- 保存 card 内容编辑

### 兼容逻辑

读取 workbench 时：

1. 若是 HBM 且 schema 为新 `industry_draft_canvas`
- 直接返回

2. 若是 HBM 且 schema 为旧 `hbm_draft_dashboard`
- 自动映射成新 canvas
- 写回新 schema

3. 若是 HBM 且没有 schema
- 继续按已有自动生成逻辑补一份新 canvas

4. 若不是 HBM
- 保持当前逻辑不变

## 迁移策略

这次只做 HBM 初稿试点。

迁移顺序：

1. 定义通用 canvas schema
2. 实现旧 HBM schema 到新 canvas 的映射
3. 实现只读渲染
4. 接入 HBM 读取自动升级
5. 实现编辑态
6. 接入保存接口

不做：

- 其他行业自动迁移
- 深度区迁移
- 批量历史数据清洗脚本

## 错误处理

- schema 缺字段：前端按默认空卡或空 tab 安全渲染，不白屏
- tab 全被删空：自动保底创建一个 `未命名栏目`
- card 数据损坏：仅跳过坏卡片，并保留其余内容
- 保存失败：保留本地编辑态，不清空未保存改动
- 自动升级失败：回退到旧 HBM 渲染，不影响用户查看

## 测试

### 后端

- 新 schema round-trip 存取测试
- 旧 HBM schema 自动映射测试
- HBM 无 schema 自动生成 canvas 测试
- 保存 tab/card 编辑结果测试

### 前端

- 只读渲染测试
- tab 增删改排序测试
- card 增删改排序测试
- 旧 HBM schema 适配测试
- 空数据保底渲染测试

### 人工验证

- HBM 初稿默认展示为 tab + 信息图卡片
- tab 可改名、可新增、可删除、可排序
- card 可新增、切模板、删除、排序、编辑
- 保存后刷新仍保持编辑结果
- 深度区无变化
- 其他行业无变化

## 推荐实现顺序

1. 定义通用 `industry_draft_canvas` 类型和适配 helper
2. 实现 `IndustryDraftCanvas` 只读渲染
3. 让 HBM 旧 schema 自动映射到新 canvas
4. 把 HBM 初稿入口切到新 canvas
5. 增加编辑态 UI
6. 增加保存接口
7. 补齐测试并完成 HBM 人工验收

## 成功标准

满足以下条件即可视为本次试点成功：

- HBM 初稿仍保留 tab 浏览方式
- tab 下展示为信息图卡片画布，而不是纯文本
- tab 可自定义，不再写死 HBM 五栏
- 卡片文字可编辑，编辑体验不混乱
- 保存后可持久化
- 深度区和其他行业完全不受影响
