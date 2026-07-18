import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  adaptLegacyHBMDashboardToCanvas,
  appendIndustryDraftBlock,
  createCanvasCard,
  createEmptyCanvasTab,
  getIndustryDraftActiveTab,
  migrateCanvasCardsToBlocks,
  buildComparisonTableRows,
  getComparisonTableHeaders,
  normalizeComparisonTableRows,
  normalizeIndustryDraftCanvasInput,
  removeIndustryDraftBlock,
  moveItem,
  shouldUseIndustryDraftCanvas,
  updateIndustryDraftBlock,
} from "../src/components/research/industry-draft-canvas.ts";

test("appendIndustryDraftBlock adds a new editable block to the selected tab", () => {
  const canvas = {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "HBM",
    tabs: [{ id: "tab-overview", title: "总览", blocks: [] }],
  };

  const next = appendIndustryDraftBlock(canvas, "tab-overview", "comparison_table");

  assert.equal(next.tabs[0].blocks.length, 1);
  assert.equal(next.tabs[0].blocks[0].type, "comparison_table");
});

test("appendIndustryDraftBlock does not reuse a removed block ID", () => {
  const canvas = {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "HBM",
    tabs: [{
      id: "tab-overview",
      title: "总览",
      blocks: [
        { id: "block-1", type: "summary_hero", spec: {} },
        { id: "block-2", type: "summary_hero", spec: {} },
        { id: "block-3", type: "summary_hero", spec: {} },
      ],
    }],
  };

  const afterDelete = removeIndustryDraftBlock(canvas, "tab-overview", "block-2");
  const afterAppend = appendIndustryDraftBlock(afterDelete, "tab-overview", "comparison_table");

  assert.equal(afterAppend.tabs[0].blocks.at(-1)?.id, "block-4");
  assert.equal(new Set(afterAppend.tabs[0].blocks.map((block) => block.id)).size, 3);
});

test("block helpers update and remove only the selected block", () => {
  const canvas = {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "HBM",
    tabs: [{ id: "tab-overview", title: "总览", blocks: [{ id: "block-1", type: "summary_hero", spec: {} }] }],
  };
  const updated = updateIndustryDraftBlock(canvas, "tab-overview", "block-1", { title: "行业总览" });
  const removed = removeIndustryDraftBlock(updated, "tab-overview", "block-1");

  assert.equal(updated.tabs[0].blocks[0].title, "行业总览");
  assert.equal(removed.tabs[0].blocks.length, 0);
});

test("normalizeComparisonTableRows preserves legacy columns with array rows", () => {
  const rows = normalizeComparisonTableRows([["层数", "16Hi"]], ["项目", "HBM3E"]);

  assert.deepEqual(rows, [{ cells: ["层数", "16Hi"], kind: "row" }]);
});

test("comparison table helpers preserve an in-row header separately from editable body rows", () => {
  const sourceRows = [
    { kind: "header", cells: ["项目", "HBM3E"] },
    { kind: "row", cells: ["层数", "16Hi"] },
  ];
  const headers = getComparisonTableHeaders({ rows: sourceRows });
  const bodyRows = normalizeComparisonTableRows(sourceRows, headers);
  const savedRows = buildComparisonTableRows(["项目", "HBM4"], bodyRows);

  assert.deepEqual(headers, ["项目", "HBM3E"]);
  assert.deepEqual(bodyRows, [{ cells: ["层数", "16Hi"], kind: "row" }]);
  assert.deepEqual(savedRows, [
    { cells: ["项目", "HBM4"], kind: "header" },
    { cells: ["层数", "16Hi"], kind: "row" },
  ]);
});

test("getComparisonTableHeaders keeps the rendered in-row header over conflicting legacy columns", () => {
  const headers = getComparisonTableHeaders({
    columns: ["旧项目", "旧代际"],
    rows: [{ kind: "header", cells: ["项目", "HBM3E"] }],
  });

  assert.deepEqual(headers, ["项目", "HBM3E"]);
});

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

test("migrateCanvasCardsToBlocks coerces unsupported block and chart types", () => {
  const result = migrateCanvasCardsToBlocks({
    kind: "industry_draft_canvas",
    scope: "HBM",
    tabs: [
      {
        id: "tab-overview",
        title: "总览",
        blocks: [
          { id: "block-unknown", type: "unknown_block", spec: {} },
          { id: "block-chart", type: "chart_spec", spec: { chart_type: "pie" } },
        ],
      },
    ],
  });

  assert.equal(result.tabs[0].blocks[0].type, "summary_hero");
  assert.equal(result.tabs[0].blocks[1].spec.chart_type, "bar");
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

test("IndustryDraftCanvas requires explicit initial-draft context for HBM polish", () => {
  const source = readFileSync(new URL("../src/components/research/IndustryDraftCanvas.tsx", import.meta.url), "utf8");
  const frameworkSource = readFileSync(new URL("../src/pages/Framework.tsx", import.meta.url), "utf8");

  assert.match(source, /isInitialDraftCanvas = false/);
  assert.match(source, /const isHbmInitialDraft = isInitialDraftCanvas && scopeType === "sector" && scopeId === "HBM"/);
  assert.match(source, /<Fragment key=\{block\.id\}>\{renderIndustryDraftBlock\(block, \{ isHbmInitialDraft \}\)\}<\/Fragment>/);
  assert.doesNotMatch(source, /<div key=\{block\.id\}>\{renderIndustryDraftBlock\(block, \{ isHbmInitialDraft \}\)\}<\/div>/);
  assert.match(frameworkSource, /<IndustryDraftCanvas data=\{sectorDraftSchema\} scopeType="sector" scopeId=\{selectedSector \|\| "HBM"\} isInitialDraftCanvas \/>/);
});

test("IndustryDraftCanvas limits editing to the HBM initial-draft context", () => {
  const source = readFileSync(new URL("../src/components/research/IndustryDraftCanvas.tsx", import.meta.url), "utf8");

  assert.match(source, /const canEdit = isHbmInitialDraft/);
  assert.match(source, /\{canEdit \? \(/);
});

test("IndustryDraftCanvasEditor routes comparison tables and charts to field editors", () => {
  const source = readFileSync(new URL("../src/components/research/IndustryDraftCanvasEditor.tsx", import.meta.url), "utf8");

  assert.match(source, /function ComparisonTableEditor/);
  assert.match(source, /function ChartSpecEditor/);
  assert.match(source, /card\.type === "comparison_table"/);
  assert.match(source, /card\.type === "chart_spec"/);
  assert.match(source, /normalizeComparisonTableRows\(card\.spec\.rows, headers\)/);
  assert.match(source, /\["bar", "stacked_bar", "line", "area"\]/);
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
