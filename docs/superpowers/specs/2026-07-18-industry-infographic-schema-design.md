# 行业初稿信息图 Schema 设计

日期：2026-07-18

## 目标

把 `行业概览 -> 初稿` 的表达能力，从“tab + 少量固定卡片”升级为“tab + 通用研报表达语法库 + 信息图 spec 渲染系统”。

这次设计仍然只在 `HBM -> 初稿` 试点验证，但输出的能力必须是通用的，后续可以迁移到光互联、机器人、PCB 设备链等其他行业。

本次设计要解决的问题：

- 初稿内容不够丰富，提取后仍然主要是文字
- 现在的通用画布仍偏“几张卡片”，对研报里的复杂表达支持不够
- 产业链图、流程图、分位带、对比表、堆叠柱状图等高频表达缺乏统一抽象
- 每出现一种新图形就增加一个专用组件，扩展性差

不在本次范围内：

- 不改 `深度`
- 不改非 HBM 行业的默认展示入口
- 不要求一次支持“所有可能图形”
- 不做任意自由布局
- 不做所见即所得图形编辑器

## 核心结论

这次不再把“图形能力”理解为“每来一种图就新增一个专卡”，而是引入一层通用的 **研报表达语法库**。

行业初稿的生成链路应升级为：

1. 提取原始资料
2. 抽取结构化表达单元
3. 生成 `infographic_spec`
4. 前端按 spec 自动选择对应 renderer

也就是说，前端需要的是一组稳定的 **表达原语**，而不是无限增长的行业专用组件。

## 新的表达模型

### 顶层结构

保留当前 `tab` 浏览方式，但每个 tab 下不再只是一组 cards，而是一组更通用的 `blocks`。

建议结构：

```json
{
  "kind": "industry_draft_canvas",
  "version": "v2",
  "scope": "HBM",
  "tabs": [
    {
      "id": "tab-overview",
      "title": "总览",
      "blocks": [
        {
          "id": "block-1",
          "type": "summary_hero",
          "title": "景气总览",
          "spec": {}
        },
        {
          "id": "block-2",
          "type": "range_band",
          "title": "估值/温度位置",
          "spec": {}
        },
        {
          "id": "block-3",
          "type": "industry_chain",
          "title": "产业链图谱",
          "spec": {}
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

这里的核心变化是：

- 从 `cards[]` 升级为更通用的 `blocks[]`
- 每个 block 的内容不再由前端组件私有字段决定，而是由 `spec` 驱动
- renderer 只认 `type + spec`

## 研报表达语法库

### 一层：基础信息块

用于“结论、标签、离散指标、摘录”这类最稳定表达。

1. `summary_hero`
- 一句话结论 + 要点
- 适用于行业总览、阶段判断、核心结论

2. `metric_grid`
- 指标宫格
- 适用于市场规模、产能、良率、层数、单价、份额等

3. `tag_strip`
- 标签带
- 适用于“高景气 / 验证中 / 卡口 / 提价 / 龙头集中”等

4. `key_takeaways`
- 重点 bullet 列表
- 适用于研报正文摘要

5. `quote_callout`
- 高亮提示框
- 适用于关键判断、风险提示、行业定义

### 二层：结构关系块

用于表达顺序、链路、层级、产业映射、依赖关系。

6. `timeline`
- 时间线 / 技术代际 / 量产进度

7. `flow_map`
- 工艺流程图 / 生产流程图 / 处理链路
- 适用于 PCB 流程、封装流程、制造步骤

8. `industry_chain`
- 产业链图谱
- 适用于上中下游、原厂/封装/服务器/终端链路

9. `value_chain`
- 价值量分布链
- 适用于价值量迁移、利润池分布

10. `dependency_map`
- 上下游依赖 / 关键卡点 / 约束关系

11. `matrix_map`
- 二维矩阵定位图
- 适用于“技术难度 × 商业化进度”“景气度 × 竞争格局”

12. `org_stack`
- 分层堆栈图
- 适用于层数、材料叠层、架构层次

### 三层：对比分析块

用于研报里高频的横向比较。

13. `comparison_cards`
- 多对象对比卡
- 适用于龙头对比、路线对比、方案对比

14. `comparison_table`
- 结构化对比表
- 适用于参数、成本、性能、份额对比

15. `pros_cons`
- 优劣势对照

16. `scenario_compare`
- 情景分析 / 乐观中性悲观

17. `leaderboard`
- 排名 / 龙头格局 / 份额排序

18. `peer_benchmark`
- 可比公司 / 环节 benchmark

### 四层：图表分析块

用于所有连续或离散数值图形，不再按行业专卡划分。

统一通过 `chart_spec` 实现，第一层子类型建议支持：

19. `chart_spec.bar`
20. `chart_spec.stacked_bar`
21. `chart_spec.grouped_bar`
22. `chart_spec.line`
23. `chart_spec.multi_line`
24. `chart_spec.area`
25. `chart_spec.stacked_area`
26. `chart_spec.pie`
27. `chart_spec.donut`
28. `chart_spec.radar`
29. `chart_spec.scatter`
30. `chart_spec.bubble`
31. `chart_spec.heatmap`
32. `chart_spec.waterfall`
33. `chart_spec.funnel`
34. `chart_spec.tornado`
35. `chart_spec.treemap`

### 五层：研报专用分析块

这是很多研报常见、但不一定属于传统图表的表达。

36. `range_band`
- 分位带 / 温度带 / 区间带
- 适用于估值分位、景气区间、库存水位、价格带

37. `evidence_table`
- 结论 / 证据 / 来源 三列式

38. `driver_tree`
- 驱动树
- 适用于收入拆解、利润驱动、产能拆解

39. `risk_map`
- 风险概率 × 影响程度

40. `milestone_board`
- 催化剂 / 验证节点 / 时间表

41. `ownership_map`
- 格局阵营 / 原厂阵营 / 客户映射

## Block 统一接口

所有 block 共用统一外壳：

```json
{
  "id": "block-1",
  "type": "industry_chain",
  "title": "产业链图谱",
  "subtitle": "从 AI GPU 到服务器兑现",
  "spec": {},
  "sources": [],
  "footnote": "",
  "style_variant": "dark-report"
}
```

统一字段：

- `id`
- `type`
- `title`
- `subtitle`
- `spec`
- `sources[]`
- `footnote`
- `style_variant`

这样未来前端 renderer 不需要认行业，只认：

- `block.type`
- `block.spec`

## 提取层升级

当前的问题是提取层主要抽摘要，导致后端只能吐文字型内容。

升级后，提取层必须能从资料中抽出以下中间结构：

- `claims`：核心结论
- `metrics`：数字指标
- `comparisons`：对象差异
- `steps`：流程步骤
- `nodes`：产业链节点
- `series`：图表序列
- `rows`：表格行
- `drivers`：驱动因子
- `risks`：风险项
- `milestones`：节点事件

然后再由一个“表达选择器”决定用什么 block：

- 顺序流程 -> `flow_map`
- 产业链/上下游 -> `industry_chain`
- 数值区间位置 -> `range_band`
- 排名/份额/对比 -> `comparison_cards` 或 `leaderboard`
- 连续数值走势 -> `chart_spec.line` / `area`
- 结构性占比 -> `chart_spec.pie` / `stacked_bar`
- 证据归纳 -> `evidence_table`

## 与个股数据页的关系

个股数据页不是这套系统的终点，但它已经验证了一批高价值表达原语：

- `估值历史分位` -> `range_band`
- `财报速览` -> `summary_hero + metric_grid + tag_strip`
- `财务关键指标` -> `metric_grid`

行业初稿不应该复制个股页布局，但应该继承它背后的表达逻辑。

## 前端实现策略

### 核心思路

前端新增的不是“越来越多行业专卡”，而是：

- `BlockRenderer`
- 若干基础 block renderer
- 一个通用 `chart_spec` renderer

建议组件边界：

- `IndustryDraftCanvas.tsx`
  - tab 容器
- `IndustryDraftBlockRenderer.tsx`
  - 根据 `block.type` 路由
- `chart-renderers/`
  - `BarChartBlock.tsx`
  - `LineChartBlock.tsx`
  - `StackedBarBlock.tsx`
  - ...
- `structure-renderers/`
  - `FlowMapBlock.tsx`
  - `IndustryChainBlock.tsx`
  - `TimelineBlock.tsx`
- `analysis-renderers/`
  - `RangeBandBlock.tsx`
  - `ComparisonTableBlock.tsx`
  - `EvidenceTableBlock.tsx`

### 编辑策略

编辑态不做图形自由编辑器，仍采用字段编辑：

- block 标题改名
- block 类型切换
- spec 字段编辑
- block 排序
- block 增删

也就是说，用户编辑的是结构化字段，而不是直接拖图形元素。

## HBM 试点边界

这次仍然只试点：

- `HBM -> 初稿`

但试点产出的能力必须是：

- 通用 schema
- 通用 block renderer
- 通用 infographic spec

而不是再做一版 HBM 专用组件集合。

## 第一阶段建议落地的 10 类

为了控制范围，第一阶段不追求 40+ 类全部上线。

建议优先支持：

1. `summary_hero`
2. `metric_grid`
3. `range_band`
4. `comparison_cards`
5. `timeline`
6. `flow_map`
7. `industry_chain`
8. `comparison_table`
9. `chart_spec`
10. `evidence_table`

这 10 类已经能覆盖绝大多数行业初稿高频表达。

## 第一阶段建议优先 renderer

实现顺序建议只先落 4-5 个最值钱的：

1. `range_band`
2. `flow_map`
3. `industry_chain`
4. `comparison_table`
5. `chart_spec`

其中 `chart_spec` 第一版再只支持：

- `bar`
- `stacked_bar`
- `line`
- `area`

这样可以先把“行业初稿图表化能力”真正拉起来，再继续扩。

## 兼容策略

- HBM 已有 `industry_draft_canvas` 旧版 `cards[]` 结构：运行时自动映射为 `blocks[]`
- HBM 旧 `hbm_draft_dashboard`：继续先映射到通用 block schema
- 非 HBM：继续沿当前分支，不自动切换

## 成功标准

满足以下条件视为本轮升级成功：

- HBM 初稿仍保留 tab 方式
- tab 下可渲染不止文字和简单卡片
- 能自动展示至少一种流程/链路图
- 能自动展示至少一种图表
- 能自动展示至少一种对比/证据型结构块
- 表达层已经从“HMB 专卡”升级为“通用研报表达语法库”
- 深度区和其他行业默认路径不受影响
