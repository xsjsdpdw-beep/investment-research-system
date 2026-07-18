import test from "node:test";
import assert from "node:assert/strict";

import {
  getHBMDraftActiveTab,
  getHBMDraftTabSummary,
  HBM_DRAFT_TAB_ORDER,
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
