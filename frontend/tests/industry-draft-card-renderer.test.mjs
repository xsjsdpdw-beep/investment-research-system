import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");

async function loadRendererModule() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/components/research/IndustryDraftCardRenderer.tsx", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

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

test("Task 2 generated HBM block types have visible renderer routes", async () => {
  const { getIndustryDraftBlockComponent, renderIndustryDraftBlock } = await loadRendererModule();

  for (const type of task2BlockTypes) {
    assert.notEqual(getIndustryDraftBlockComponent(type), "GenericDraftBlock");
  }

  const chartBlock = {
    id: "chart-route",
    type: "chart_spec",
    title: "路由检查",
    spec: { chart_type: "bar", series: [{ name: "HBM3E", value: 16 }] },
  };
  const compatibilityHtml = renderToStaticMarkup(renderIndustryDraftBlock(chartBlock));
  const polishedHtml = renderToStaticMarkup(renderIndustryDraftBlock(chartBlock, { isHbmInitialDraft: true }));

  assert.doesNotMatch(compatibilityHtml, /data-chart-type/);
  assert.match(compatibilityHtml, /HBM3E/);
  assert.match(polishedHtml, /data-chart-type="bar"/);
  assert.match(polishedHtml, /HBM3E/);
});
