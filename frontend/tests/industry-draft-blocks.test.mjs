import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rendererSource = readFileSync(
  new URL("../src/components/research/IndustryDraftCardRenderer.tsx", import.meta.url),
  "utf8",
);

test("getIndustryDraftBlockComponent routes first-phase block types", () => {
  assert.match(rendererSource, /range_band: "RangeBandBlock"/);
  assert.match(rendererSource, /flow_map: "FlowMapBlock"/);
  assert.match(rendererSource, /industry_chain: "IndustryChainBlock"/);
  assert.match(rendererSource, /comparison_table: "ComparisonTableBlock"/);
  assert.match(rendererSource, /chart_spec: "ChartSpecBlock"/);
  assert.match(rendererSource, /export function getIndustryDraftBlockComponent/);
});
