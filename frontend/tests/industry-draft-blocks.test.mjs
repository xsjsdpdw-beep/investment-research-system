import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");

async function loadModule(path) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

async function loadComponent(path, exportName) {
  const module = await loadModule(path);
  return module[exportName];
}

test("getIndustryDraftBlockComponent routes first-phase block types", async () => {
  const module = await loadModule("../src/components/research/IndustryDraftCardRenderer.tsx");

  assert.equal(module.getIndustryDraftBlockComponent("range_band"), "RangeBandBlock");
  assert.equal(module.getIndustryDraftBlockComponent("flow_map"), "FlowMapBlock");
  assert.equal(module.getIndustryDraftBlockComponent("industry_chain"), "IndustryChainBlock");
  assert.equal(module.getIndustryDraftBlockComponent("comparison_table"), "ComparisonTableBlock");
  assert.equal(module.getIndustryDraftBlockComponent("chart_spec"), "ChartSpecBlock");
});

test("ChartSpecBlock renders supported chart labels and values", async () => {
  const ChartSpecBlock = await loadComponent("../src/components/research/industry-draft-blocks/ChartSpecBlock.tsx", "ChartSpecBlock");

  for (const chartType of ["bar", "stacked_bar", "line", "area"]) {
    const html = renderToStaticMarkup(ChartSpecBlock({
      block: {
        id: `chart-${chartType}`,
        type: "chart_spec",
        title: "层数演进",
        spec: {
          chart_type: chartType,
          series: [
            { name: "HBM3", value: 12 },
            { name: "HBM3E", value: 16 },
          ],
        },
      },
    }));

    assert.match(html, new RegExp(`data-chart-type="${chartType}"`));
    assert.match(html, /HBM3E/);
    assert.match(html, /16/);
  }
});

test("new first-phase blocks render their structured content", async () => {
  const [FlowMapBlock, IndustryChainBlock, ComparisonTableBlock] = await Promise.all([
    loadComponent("../src/components/research/industry-draft-blocks/FlowMapBlock.tsx", "FlowMapBlock"),
    loadComponent("../src/components/research/industry-draft-blocks/IndustryChainBlock.tsx", "IndustryChainBlock"),
    loadComponent("../src/components/research/industry-draft-blocks/ComparisonTableBlock.tsx", "ComparisonTableBlock"),
  ]);

  assert.match(renderToStaticMarkup(FlowMapBlock({ block: {
    id: "flow-1", type: "flow_map", title: "工艺流程", spec: { steps: [{ label: "堆叠" }, { label: "封装" }] },
  } })), /封装/);
  assert.match(renderToStaticMarkup(IndustryChainBlock({ block: {
    id: "chain-1", type: "industry_chain", title: "产业链", spec: { nodes: [{ label: "DRAM" }, { label: "封装" }] },
  } })), /DRAM/);
  assert.match(renderToStaticMarkup(ComparisonTableBlock({ block: {
    id: "table-1", type: "comparison_table", title: "规格对照", spec: { rows: [{ name: "HBM3E", value: "16层" }] },
  } })), /16层/);
});

test("ChartSpecBlock flattens generated point series", async () => {
  const ChartSpecBlock = await loadComponent("../src/components/research/industry-draft-blocks/ChartSpecBlock.tsx", "ChartSpecBlock");
  const html = renderToStaticMarkup(ChartSpecBlock({ block: {
    id: "chart-points", type: "chart_spec", title: "指标趋势", spec: {
      chart_type: "line", series: [{ name: "关键指标", points: [{ label: "HBM3", value: 12 }, { label: "HBM3E", value: 16 }] }],
    },
  } }));

  assert.match(html, /HBM3E/);
  assert.match(html, /16/);
});

test("ComparisonTableBlock renders generated cell rows as a table", async () => {
  const ComparisonTableBlock = await loadComponent("../src/components/research/industry-draft-blocks/ComparisonTableBlock.tsx", "ComparisonTableBlock");
  const html = renderToStaticMarkup(ComparisonTableBlock({ block: {
    id: "table-cells", type: "comparison_table", title: "规格对照", spec: {
      rows: [{ cells: ["代际", "层数"], kind: "header" }, { cells: ["HBM3E", "16"], kind: "row" }],
    },
  } }));

  assert.match(html, /<th[^>]*>代际<\/th>/);
  assert.match(html, /<td[^>]*>16<\/td>/);
});

test("non-HBM blocks keep the compatibility renderer", async () => {
  const { renderIndustryDraftBlock } = await loadModule("../src/components/research/IndustryDraftCardRenderer.tsx");
  const html = renderToStaticMarkup(renderIndustryDraftBlock({
    id: "non-hbm-chart", type: "chart_spec", title: "通用行业图表", spec: { chart_type: "bar", series: [{ name: "指标", value: 12 }] },
  }, { isHbmInitialDraft: false }));

  assert.doesNotMatch(html, /data-chart-type/);
  assert.match(html, /指标/);
});

test("ChartSpecBlock keeps multi-series line groups separate", async () => {
  const ChartSpecBlock = await loadComponent("../src/components/research/industry-draft-blocks/ChartSpecBlock.tsx", "ChartSpecBlock");
  const html = renderToStaticMarkup(ChartSpecBlock({ block: {
    id: "chart-multi-series", type: "chart_spec", title: "多指标趋势", spec: {
      chart_type: "line",
      series: [
        { name: "带宽", points: [{ label: "HBM3", value: 12 }, { label: "HBM3E", value: 16 }] },
        { name: "容量", points: [{ label: "HBM3", value: 8 }, { label: "HBM3E", value: 12 }] },
      ],
    },
  } }));

  assert.match(html, /带宽/);
  assert.match(html, /容量/);
  assert.equal((html.match(/<polyline/g) || []).length, 2);
});

test("ComparisonTableBlock preserves zero and false cell values", async () => {
  const ComparisonTableBlock = await loadComponent("../src/components/research/industry-draft-blocks/ComparisonTableBlock.tsx", "ComparisonTableBlock");
  const html = renderToStaticMarkup(ComparisonTableBlock({ block: {
    id: "table-falsy", type: "comparison_table", title: "布尔值", spec: { rows: [{ count: 0, enabled: false }] },
  } }));

  assert.match(html, /<td[^>]*>0<\/td>/);
  assert.match(html, /<td[^>]*>false<\/td>/);
});
