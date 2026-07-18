import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");

test("getIndustryDraftBlockComponent routes first-phase block types", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/components/research/IndustryDraftCardRenderer.tsx", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);

  assert.equal(module.getIndustryDraftBlockComponent("range_band"), "RangeBandBlock");
  assert.equal(module.getIndustryDraftBlockComponent("flow_map"), "FlowMapBlock");
  assert.equal(module.getIndustryDraftBlockComponent("industry_chain"), "IndustryChainBlock");
  assert.equal(module.getIndustryDraftBlockComponent("comparison_table"), "ComparisonTableBlock");
  assert.equal(module.getIndustryDraftBlockComponent("chart_spec"), "ChartSpecBlock");
});
