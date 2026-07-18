import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rendererSource = readFileSync(
  new URL("../src/components/research/IndustryDraftCardRenderer.tsx", import.meta.url),
  "utf8",
);

const task2BlockTypes = [
  "summary_hero",
  "metric_grid",
  "range_band",
  "comparison_cards",
  "timeline",
  "flow_map",
  "industry_chain",
  "comparison_table",
  "chart_spec",
  "evidence_table",
];

test("Task 2 generated HBM block types have visible renderer routes", () => {
  for (const type of task2BlockTypes) {
    assert.match(rendererSource, new RegExp(`"${type}"`));
  }
  assert.match(rendererSource, /TASK_2_COMPATIBILITY_BLOCK_TYPES\.has\(card\.type\)/);
  assert.match(rendererSource, /return <CompatibilityBlockCard card=\{card\} \/>;/);
});
