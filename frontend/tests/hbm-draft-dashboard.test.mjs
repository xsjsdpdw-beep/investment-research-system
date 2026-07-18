import test from "node:test";
import assert from "node:assert/strict";

import {
  getHBMCostStackBars,
  getHBMDraftActiveTab,
  getHBMCycleMeterModel,
  getHBMGenerationLadder,
  getHBMLeaderMatrix,
  getHBMOverviewChain,
  getHBMDraftMetricRail,
  getHBMDraftTabTheme,
  getHBMDraftTabSummary,
  HBM_DRAFT_TAB_ORDER,
  mapLegacyHbmDashboardToCanvas,
  shouldUseHBMDraftDashboard,
} from "../src/components/research/hbm-draft-dashboard.ts";

const data = {
  kind: "hbm_draft_dashboard",
  tabs: [
    { key: "overview", title: "总览", headline: "HBM 仍处高景气主线", summary: ["供给偏紧"], metrics: [], panels: [], sources: [], empty_state: "" },
    { key: "generation", title: "技术代际", headline: "", summary: ["HBM3E 迭代"], metrics: [], panels: [], sources: [], empty_state: "" },
    { key: "cost_bottleneck", title: "成本与卡口", headline: "", summary: ["先进封装卡口"], metrics: [], panels: [], sources: [], empty_state: "" },
    { key: "leaders", title: "产业龙头", headline: "", summary: ["龙头集中"], metrics: [], panels: [], sources: [], empty_state: "" },
    { key: "cycle_meter", title: "周期温度计", headline: "", summary: ["温度高位"], metrics: [], panels: [], sources: [], empty_state: "" },
  ],
};

test("mapLegacyHbmDashboardToCanvas upgrades old HBM tabs into block-first tabs", () => {
  const result = mapLegacyHbmDashboardToCanvas({
    kind: "hbm_draft_dashboard",
    tabs: [
      {
        key: "overview",
        label: "总览",
        sections: [
          {
            type: "hero",
            title: "景气总览",
            bullets: ["HBM 维持高景气"],
          },
        ],
      },
    ],
  });

  assert.equal(result.kind, "industry_draft_canvas");
  assert.equal(result.tabs[0].blocks[0].type, "summary_hero");
});

test("mapLegacyHbmDashboardToCanvas clamps unsupported section chart types", () => {
  const result = mapLegacyHbmDashboardToCanvas({
    kind: "hbm_draft_dashboard",
    tabs: [{
      key: "overview",
      label: "总览",
      sections: [{
        type: "chart_spec",
        title: "供需趋势",
        spec: { chart_type: "pie", series: [] },
      }],
    }],
  });

  assert.equal(result.tabs[0].blocks[0].type, "chart_spec");
  assert.equal(result.tabs[0].blocks[0].spec.chart_type, "bar");
});

test("mapLegacyHbmDashboardToCanvas preserves classic tabs in mixed legacy payloads", () => {
  const result = mapLegacyHbmDashboardToCanvas({
    kind: "hbm_draft_dashboard",
    tabs: [
      {
        key: "overview",
        label: "总览",
        sections: [{ type: "hero", title: "结构化总览", bullets: ["HBM 维持高景气"] }],
      },
      {
        key: "generation",
        title: "技术代际",
        headline: "HBM3E 持续迭代",
        summary: ["验证范围扩大"],
        metrics: [{ label: "主线", value: "HBM3E" }],
        panels: [],
      },
    ],
  });

  assert.equal(result.tabs[0].blocks[0].spec.headline, "结构化总览");
  assert.equal(result.tabs[1].blocks[0].spec.headline, "HBM3E 持续迭代");
  assert.equal(result.tabs[1].blocks[1].type, "metric_grid");
});

test("HBM tab order stays fixed", () => {
  assert.deepEqual(
    data.tabs.map((tab) => tab.key),
    HBM_DRAFT_TAB_ORDER,
  );
});

test("getHBMDraftActiveTab resolves requested tab and falls back to first tab", () => {
  assert.equal(getHBMDraftActiveTab(data, "generation")?.title, "技术代际");
  assert.equal(getHBMDraftActiveTab(data, "unknown")?.title, "总览");
});

test("getHBMDraftTabSummary falls back to empty state text", () => {
  const emptyTab = { ...data.tabs[0], summary: [], empty_state: "资料不足" };
  assert.deepEqual(getHBMDraftTabSummary(emptyTab), ["资料不足"]);
});

test("shouldUseHBMDraftDashboard is HBM-only and requires matching schema", () => {
  assert.equal(shouldUseHBMDraftDashboard("HBM", { draft_theme_schema: data }), true);
  assert.equal(shouldUseHBMDraftDashboard("光互联", { draft_theme_schema: data }), false);
  assert.equal(shouldUseHBMDraftDashboard("HBM", { draft_theme_schema: null }), false);
});

test("getHBMDraftTabTheme returns stable tab-specific accent tokens", () => {
  assert.equal(getHBMDraftTabTheme("overview").eyebrow, "景气总览");
  assert.equal(getHBMDraftTabTheme("generation").eyebrow, "代际升级");
  assert.equal(getHBMDraftTabTheme("cycle_meter").eyebrow, "温度计");
});

test("getHBMDraftMetricRail builds ranked bars for metric cards", () => {
  const bars = getHBMDraftMetricRail([
    { label: "景气", value: "高关注" },
    { label: "供给", value: "偏紧" },
    { label: "主线", value: "AI 存储" },
  ]);
  assert.equal(bars.length, 3);
  assert.equal(bars[0].width, "100%");
  assert.equal(bars[1].width, "78%");
  assert.equal(bars[2].width, "56%");
});

test("getHBMGenerationLadder promotes matched generations into ordered visual steps", () => {
  const generationTab = {
    ...data.tabs[1],
    summary: ["HBM3E 迭代加速", "12hi/16hi 成为升级焦点"],
    panels: [{ title: "代际演进", items: ["HBM2E 向 HBM3 过渡", "HBM3E 成为主升级方向"] }],
    generation_steps: [
      { label: "HBM2E", caption: "成熟导入", active: false },
      { label: "HBM3", caption: "向高带宽过渡", active: true },
      { label: "HBM3E", caption: "当前主升级代际", active: true },
      { label: "Next", caption: "16hi / 更高带宽", active: true },
    ],
  };
  const ladder = getHBMGenerationLadder(generationTab);
  assert.deepEqual(ladder.map((item) => item.label), ["HBM2E", "HBM3", "HBM3E", "Next"]);
  assert.equal(ladder[1].active, true);
  assert.equal(ladder[2].active, true);
  assert.equal(ladder[3].caption, "16hi / 更高带宽");
});

test("getHBMCycleMeterModel maps hot wording into the hottest active stop", () => {
  const cycleTab = {
    ...data.tabs[4],
    headline: "景气高位运行，价格与扩产仍在拉扯",
    summary: ["温度高位", "价格 / 库存 / 扩产三线跟踪"],
    metrics: [{ label: "周期温度", value: "高位跟踪" }],
  };
  const meter = getHBMCycleMeterModel(cycleTab);
  assert.equal(meter.activeLabel, "Hot");
  assert.equal(meter.stops[meter.activeIndex].tone, "hot");
});

test("getHBMCostStackBars normalizes backend weights into bar widths", () => {
  const bars = getHBMCostStackBars([
    { label: "先进封装", weight: 34, note: "封装与堆叠能力" },
    { label: "设备", weight: 26, note: "扩产设备与交付节奏" },
    { label: "良率", weight: 22, note: "量产良率决定成本斜率" },
  ]);
  assert.equal(bars[0].width, "100%");
  assert.equal(bars[1].width, "76%");
  assert.equal(bars[2].width, "65%");
});

test("getHBMOverviewChain prefers structured chain nodes when provided", () => {
  const overviewTab = {
    ...data.tabs[0],
    chain_nodes: [
      { label: "AI GPU", tag: "需求源头", emphasis: "算力拉动" },
      { label: "先进封装", tag: "制造卡位", emphasis: "封装升级" },
      { label: "HBM", tag: "核心器件", emphasis: "带宽瓶颈" },
      { label: "服务器", tag: "终端承接", emphasis: "整机兑现" },
    ],
  };
  const chain = getHBMOverviewChain(overviewTab);
  assert.equal(chain[0].label, "AI GPU");
  assert.equal(chain[0].tag, "需求源头");
});

test("getHBMLeaderMatrix prefers structured leader cards when provided", () => {
  const leaderTab = {
    ...data.tabs[3],
    leader_cards: [
      { name: "海力士", role: "存储龙头", edge: "HBM3E 领先", segment: "原厂", mapping: "存储颗粒" },
      { name: "三星", role: "综合巨头", edge: "产能与客户覆盖", segment: "原厂", mapping: "高端客户验证" },
    ],
  };
  const matrix = getHBMLeaderMatrix(leaderTab);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0].name, "海力士");
  assert.equal(matrix[1].edge, "产能与客户覆盖");
  assert.equal(matrix[1].segment, "原厂");
});
