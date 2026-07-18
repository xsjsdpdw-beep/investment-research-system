import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  adaptLegacyHBMDashboardToCanvas,
  createCanvasCard,
  createEmptyCanvasTab,
  getIndustryDraftActiveTab,
  migrateCanvasCardsToBlocks,
  normalizeIndustryDraftCanvasInput,
  moveItem,
  shouldUseIndustryDraftCanvas,
} from "../src/components/research/industry-draft-canvas.ts";

test("migrateCanvasCardsToBlocks upgrades card payloads into block payloads", () => {
  const result = migrateCanvasCardsToBlocks({
    kind: "industry_draft_canvas",
    version: "v1",
    scope: "HBM",
    tabs: [
      {
        id: "tab-overview",
        title: "总览",
        cards: [
          {
            id: "card-1",
            type: "summary_hero",
            title: "景气总览",
            content: { headline: "HBM 需求偏强" },
          },
        ],
      },
    ],
  });

  assert.equal(result.tabs[0].blocks[0].type, "summary_hero");
  assert.equal(result.tabs[0].blocks[0].spec.headline, "HBM 需求偏强");
});

test("normalizeIndustryDraftCanvasInput dispatches legacy HBM dashboards for the runtime", () => {
  const result = normalizeIndustryDraftCanvasInput(legacy);

  assert.equal(result.kind, "industry_draft_canvas");
  assert.equal(result.tabs[0].blocks[0].type, "summary_hero");
  assert.equal(result.tabs[0].blocks[0].spec.headline, "HBM 放量");
});

test("IndustryDraftCanvas normalizes persisted schemas before reading HBM tabs", () => {
  const source = readFileSync(new URL("../src/components/research/IndustryDraftCanvas.tsx", import.meta.url), "utf8");

  assert.match(source, /normalizeIndustryDraftCanvasInput\(data\)/);
});

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

test("adaptLegacyHBMDashboardToCanvas maps summary into summary_hero block", () => {
  const canvas = adaptLegacyHBMDashboardToCanvas(legacy);

  assert.equal(canvas.kind, "industry_draft_canvas");
  assert.equal(canvas.tabs[0].blocks[0].type, "summary_hero");
  assert.equal(canvas.tabs[0].blocks[0].sources[0], "HBM 行业概览.md");
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

test("createEmptyCanvasTab returns editable tab shell", () => {
  const tab = createEmptyCanvasTab();
  assert.equal(tab.title, "未命名栏目");
  assert.deepEqual(tab.blocks, []);
});

test("createCanvasCard creates metric grid with editable spec items array", () => {
  const card = createCanvasCard("metric_grid");
  assert.equal(card.type, "metric_grid");
  assert.ok(Array.isArray(card.spec.items));
});

test("moveItem reorders arrays by button-style deltas", () => {
  const moved = moveItem(["a", "b", "c"], 1, 1);
  assert.deepEqual(moved, ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b"], 0, -1), ["a", "b"]);
});
