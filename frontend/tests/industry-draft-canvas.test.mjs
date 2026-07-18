import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptLegacyHBMDashboardToCanvas,
  getIndustryDraftActiveTab,
  shouldUseIndustryDraftCanvas,
} from "../src/components/research/industry-draft-canvas.ts";

const legacy = {
  kind: "hbm_draft_dashboard",
  tabs: [
    {
      key: "overview",
      title: "总览",
      headline: "HBM 放量",
      summary: ["需求偏强"],
      metrics: [{ label: "景气", value: "高关注" }],
      panels: [],
      sources: ["HBM 行业概览.md"],
      empty_state: "",
    },
  ],
  generated_at: "2026-07-18T00:00:00+08:00",
};

test("adaptLegacyHBMDashboardToCanvas maps summary into summary_hero card", () => {
  const canvas = adaptLegacyHBMDashboardToCanvas(legacy);

  assert.equal(canvas.kind, "industry_draft_canvas");
  assert.equal(canvas.tabs[0].cards[0].type, "summary_hero");
  assert.equal(canvas.tabs[0].cards[0].sources[0], "HBM 行业概览.md");
});

test("getIndustryDraftActiveTab resolves requested tab and falls back to first tab", () => {
  const canvas = adaptLegacyHBMDashboardToCanvas(legacy);
  assert.equal(getIndustryDraftActiveTab(canvas, canvas.tabs[0].id)?.title, "总览");
  assert.equal(getIndustryDraftActiveTab(canvas, "missing")?.title, "总览");
});

test("shouldUseIndustryDraftCanvas is HBM-only and requires matching schema", () => {
  const canvas = adaptLegacyHBMDashboardToCanvas(legacy);
  assert.equal(shouldUseIndustryDraftCanvas("HBM", { draft_theme_schema: canvas }), true);
  assert.equal(shouldUseIndustryDraftCanvas("光互联", { draft_theme_schema: canvas }), false);
  assert.equal(shouldUseIndustryDraftCanvas("HBM", { draft_theme_schema: null }), false);
});
