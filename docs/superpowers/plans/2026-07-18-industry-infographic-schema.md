# Industry Infographic Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `行业概览 -> HBM -> 初稿` from the current `tab + fixed cards` canvas into a reusable `tab + generic infographic blocks` system that can render richer report-style structures while leaving `深度` and every non-HBM default path unchanged.

**Architecture:** Keep `draft_theme_schema` as the single persisted slot, but evolve `industry_draft_canvas` from `tabs[].cards[]` into `tabs[].blocks[]` plus a generic `block.type + block.spec` contract. Add a backend expression-selection layer that turns extracted HBM source material into reusable infographic blocks, then add a frontend block router with first-phase renderers for `range_band`, `flow_map`, `industry_chain`, `comparison_table`, and `chart_spec`, while auto-mapping both legacy `hbm_draft_dashboard` and current `industry_draft_canvas.cards[]` payloads.

**Tech Stack:** FastAPI, repo-local Python tests with `pytest`, React + TypeScript, existing overview workbench APIs, existing HBM draft canvas entrypoint in `Framework.tsx`, current dark stock-data visual language.

## Global Constraints

- Only modify `行业概览 -> HBM -> 初稿`.
- Do not modify `深度`.
- Do not change any non-HBM industry default rendering.
- Preserve the current tab interaction model; do not switch to one long card list.
- Do not implement free-drag canvas layout.
- Do not implement arbitrary WYSIWYG graphic editing.
- Keep `draft_theme_schema` as the only persisted initial-draft schema slot.
- Legacy `hbm_draft_dashboard` and current `industry_draft_canvas.cards[]` payloads must remain readable through runtime auto-mapping.
- First-phase block support is limited to `summary_hero`, `metric_grid`, `range_band`, `comparison_cards`, `timeline`, `flow_map`, `industry_chain`, `comparison_table`, `chart_spec`, and `evidence_table`.
- First-phase chart support is limited to `bar`, `stacked_bar`, `line`, and `area`.
- The extraction upgrade must stay rule-based for this phase; do not route initial-draft generation through `/api/chat`.

---

## File Map

**Backend**

- Modify: `backend/knowledge.py`
  - Normalize the new `tabs[].blocks[]` schema and preserve legacy payload readability.
- Modify: `backend/research_hub.py`
  - Add the HBM expression-extraction pipeline, block factories, and schema auto-upgrade helpers.
- Modify: `backend/app.py`
  - Auto-upgrade loaded HBM draft schemas and persist upgraded payloads through the existing workbench flow.
- Modify: `backend/tests/test_hbm_draft_dashboard.py`
  - Cover HBM generation of new infographic blocks and old-schema compatibility.
- Create: `backend/tests/test_industry_infographic_schema.py`
  - Cover schema normalization, cards-to-blocks migration, and load/save round trips.

**Frontend**

- Modify: `frontend/src/lib/api.ts`
  - Replace card-first canvas typings with block-first infographic typings.
- Modify: `frontend/src/components/research/industry-draft-canvas.ts`
  - Add schema adapters, block factories, block editor defaults, and compatibility mappers.
- Modify: `frontend/src/components/research/IndustryDraftCanvas.tsx`
  - Keep tab shell, but render generic blocks instead of fixed card layouts.
- Modify: `frontend/src/components/research/IndustryDraftCanvasEditor.tsx`
  - Edit tab metadata and block fields, including block type add/remove/reorder.
- Modify: `frontend/src/components/research/IndustryDraftCardRenderer.tsx`
  - Replace card-oriented rendering with a block router shell, or split it into a block router while preserving imports from `IndustryDraftCanvas.tsx`.
- Create: `frontend/src/components/research/industry-draft-blocks/RangeBandBlock.tsx`
  - Render valuation/temperature percentile bands.
- Create: `frontend/src/components/research/industry-draft-blocks/FlowMapBlock.tsx`
  - Render sequential process maps.
- Create: `frontend/src/components/research/industry-draft-blocks/IndustryChainBlock.tsx`
  - Render upstream/midstream/downstream industry maps.
- Create: `frontend/src/components/research/industry-draft-blocks/ComparisonTableBlock.tsx`
  - Render structured comparison tables.
- Create: `frontend/src/components/research/industry-draft-blocks/ChartSpecBlock.tsx`
  - Render generic first-phase charts.
- Modify: `frontend/src/components/research/HBMDraftDashboard.tsx`
  - Reduce to a compatibility wrapper or adapter-only fallback for old records.
- Modify: `frontend/src/components/research/hbm-draft-dashboard.ts`
  - Export legacy HBM helpers that map old dashboard payloads into infographic blocks.
- Modify: `frontend/src/pages/Framework.tsx`
  - Keep the HBM-only entry branch, but point it at the upgraded block-first canvas.
- Modify: `frontend/tests/industry-draft-canvas.test.mjs`
  - Cover new adapters and block editing helpers.
- Modify: `frontend/tests/hbm-draft-dashboard.test.mjs`
  - Cover legacy HBM dashboard migration.
- Create: `frontend/tests/industry-draft-blocks.test.mjs`
  - Cover block router selection and chart/block fallback rendering.

## Task 1: Upgrade the Persisted Schema to `blocks[]`

**Files:**
- Modify: `backend/knowledge.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/research/industry-draft-canvas.ts`
- Create: `backend/tests/test_industry_infographic_schema.py`
- Modify: `frontend/tests/industry-draft-canvas.test.mjs`

**Interfaces:**
- Consumes:
  - `knowledge.save_overview_draft_theme_schema(scope_type: str, scope_id: str, schema: dict | None) -> dict`
  - `knowledge.get_overview_workbench(scope_type: str, scope_id: str) -> dict`
- Produces:
  - `normalize_industry_draft_canvas(schema: dict[str, Any] | None) -> dict[str, Any]`
  - `migrateCanvasCardsToBlocks(schema: IndustryDraftCanvasSchema | null | undefined): IndustryDraftCanvasSchema | null`
  - TypeScript type `IndustryDraftBlock`

- [ ] **Step 1: Write the failing backend normalization test**

```python
from knowledge import normalize_industry_draft_canvas


def test_normalize_industry_draft_canvas_migrates_cards_to_blocks():
    raw = {
        "kind": "industry_draft_canvas",
        "version": "v1",
        "scope": "HBM",
        "tabs": [
            {
                "id": "tab-overview",
                "title": "总览",
                "cards": [
                    {
                        "id": "card-1",
                        "type": "summary_hero",
                        "title": "景气总览",
                        "content": {"headline": "HBM 需求偏强"},
                    }
                ],
            }
        ],
    }

    normalized = normalize_industry_draft_canvas(raw)

    assert "cards" not in normalized["tabs"][0]
    assert normalized["tabs"][0]["blocks"][0]["type"] == "summary_hero"
    assert normalized["tabs"][0]["blocks"][0]["spec"]["headline"] == "HBM 需求偏强"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_industry_infographic_schema.py::test_normalize_industry_draft_canvas_migrates_cards_to_blocks -v`

Expected: FAIL because the current normalization still preserves `cards`.

- [ ] **Step 3: Write the frontend adapter test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { migrateCanvasCardsToBlocks } from "../src/components/research/industry-draft-canvas";

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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test frontend/tests/industry-draft-canvas.test.mjs`

Expected: FAIL because `migrateCanvasCardsToBlocks` does not yet exist and the TypeScript contract is still card-first.

- [ ] **Step 5: Write minimal schema migration and typings**

```python
# backend/knowledge.py
def _normalize_industry_draft_block(raw: dict[str, Any], index: int) -> dict[str, Any]:
    content = dict(raw.get("content") or {})
    spec = dict(raw.get("spec") or content)
    return {
        "id": str(raw.get("id") or f"block-{index + 1}"),
        "type": str(raw.get("type") or "summary_hero"),
        "title": str(raw.get("title") or ""),
        "subtitle": str(raw.get("subtitle") or ""),
        "spec": spec,
        "sources": [str(item) for item in (raw.get("sources") or []) if str(item).strip()],
        "footnote": str(raw.get("footnote") or ""),
        "style_variant": str(raw.get("style_variant") or "dark-report"),
    }


def normalize_industry_draft_canvas(schema: dict[str, Any] | None) -> dict[str, Any]:
    raw = deepcopy(schema or {})
    if raw.get("kind") != "industry_draft_canvas":
        return raw
    tabs = []
    for tab_index, tab in enumerate(raw.get("tabs") or []):
        block_inputs = tab.get("blocks") or tab.get("cards") or []
        tabs.append(
            {
                "id": str(tab.get("id") or f"tab-{tab_index + 1}"),
                "title": str(tab.get("title") or "未命名栏目"),
                "blocks": [
                    _normalize_industry_draft_block(block, block_index)
                    for block_index, block in enumerate(block_inputs)
                ],
            }
        )
    return {
        "kind": "industry_draft_canvas",
        "version": str(raw.get("version") or "v2"),
        "scope": str(raw.get("scope") or ""),
        "tabs": tabs,
        "meta": dict(raw.get("meta") or {}),
    }
```

```ts
// frontend/src/lib/api.ts
export interface IndustryDraftBlock {
  id: string;
  type:
    | "summary_hero"
    | "metric_grid"
    | "range_band"
    | "comparison_cards"
    | "timeline"
    | "flow_map"
    | "industry_chain"
    | "comparison_table"
    | "chart_spec"
    | "evidence_table";
  title?: string;
  subtitle?: string;
  spec: Record<string, unknown>;
  sources?: string[];
  footnote?: string;
  style_variant?: string;
}

export interface IndustryDraftCanvasTab {
  id: string;
  title: string;
  blocks: IndustryDraftBlock[];
  cards?: never;
}
```

```ts
// frontend/src/components/research/industry-draft-canvas.ts
export function migrateCanvasCardsToBlocks(schema) {
  if (!schema || schema.kind !== "industry_draft_canvas") return schema;
  return {
    ...schema,
    version: schema.version || "v2",
    tabs: (schema.tabs || []).map((tab, tabIndex) => ({
      id: tab.id || `tab-${tabIndex + 1}`,
      title: tab.title || "未命名栏目",
      blocks: (tab.blocks || tab.cards || []).map((item, blockIndex) => ({
        id: item.id || `block-${blockIndex + 1}`,
        type: item.type || "summary_hero",
        title: item.title || "",
        subtitle: item.subtitle || "",
        spec: item.spec || item.content || {},
        sources: item.sources || [],
        footnote: item.footnote || "",
        style_variant: item.style_variant || "dark-report",
      })),
    })),
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `backend/.venv/bin/pytest backend/tests/test_industry_infographic_schema.py -q`

Expected: PASS.

Run: `node --test frontend/tests/industry-draft-canvas.test.mjs`

Expected: PASS with the new migration assertions green.

- [ ] **Step 7: Commit**

```bash
git add backend/knowledge.py backend/tests/test_industry_infographic_schema.py frontend/src/lib/api.ts frontend/src/components/research/industry-draft-canvas.ts frontend/tests/industry-draft-canvas.test.mjs
git commit -m "feat: migrate industry draft canvas to block schema"
```

## Task 2: Build the HBM Expression-Extraction and Block-Selection Pipeline

**Files:**
- Modify: `backend/research_hub.py`
- Modify: `backend/tests/test_hbm_draft_dashboard.py`

**Interfaces:**
- Consumes:
  - `build_sector_overview_modules(sector: str) -> dict`
  - HBM source entries from `result["sources"]`
- Produces:
  - `extract_hbm_expression_units(sources: list[dict[str, Any]]) -> dict[str, Any]`
  - `build_hbm_infographic_tabs(sector: str, extracted: dict[str, Any]) -> list[dict[str, Any]]`
  - `build_hbm_draft_canvas(sector: str, sources: list[dict[str, Any]]) -> dict[str, Any]`

- [ ] **Step 1: Write the failing HBM extraction test**

```python
from research_hub import extract_hbm_expression_units


def test_extract_hbm_expression_units_collects_steps_nodes_metrics_and_series():
    extracted = extract_hbm_expression_units(
        [
            {
                "label": "HBM 行业概览.md",
                "text": (
                    "工艺流程：Base Die -> TSV -> Hybrid Bonding -> 堆叠封装。"
                    "产业链：上游材料、GPU、封测、HBM 原厂、服务器。"
                    "关键指标：单颗容量 24GB，层数 12/16/24Hi，ASP 持续上行。"
                ),
            }
        ]
    )

    assert extracted["steps"][0]["label"] == "Base Die"
    assert extracted["nodes"][0]["label"] == "上游材料"
    assert extracted["metrics"][0]["label"] == "单颗容量"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py::test_extract_hbm_expression_units_collects_steps_nodes_metrics_and_series -v`

Expected: FAIL because the extraction helper does not exist yet.

- [ ] **Step 3: Write the failing block-selection test**

```python
from research_hub import build_hbm_infographic_tabs


def test_build_hbm_infographic_tabs_outputs_flow_chain_range_and_chart_blocks():
    tabs = build_hbm_infographic_tabs(
        "HBM",
        {
            "claims": [{"text": "HBM 供需维持紧平衡"}],
            "metrics": [{"label": "层数", "value": "12-24Hi"}],
            "comparisons": [{"name": "HBM2E", "value": "上一代"}, {"name": "HBM3E", "value": "当前主流"}],
            "steps": [{"label": "TSV"}, {"label": "Hybrid Bonding"}],
            "nodes": [{"label": "GPU"}, {"label": "HBM 原厂"}, {"label": "服务器"}],
            "series": [{"name": "位宽", "points": [{"label": "HBM2E", "value": 1}, {"label": "HBM3E", "value": 2}]}],
            "rows": [{"cells": ["环节", "代表"], "kind": "header"}, {"cells": ["封测", "日月光"]}],
            "drivers": [],
            "risks": [],
            "milestones": [],
        },
    )

    overview = tabs[0]["blocks"]
    assert any(block["type"] == "flow_map" for block in overview)
    assert any(block["type"] == "industry_chain" for block in overview)
    assert any(block["type"] == "chart_spec" for block in overview)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py::test_build_hbm_infographic_tabs_outputs_flow_chain_range_and_chart_blocks -v`

Expected: FAIL because the builder still emits fixed cards instead of generic blocks.

- [ ] **Step 5: Write minimal extraction and block factories**

```python
# backend/research_hub.py
def extract_hbm_expression_units(sources: list[dict[str, Any]]) -> dict[str, Any]:
    text = "\n".join(str(item.get("text") or "") for item in sources)
    return {
        "claims": _extract_claims(text),
        "metrics": _extract_metrics(text),
        "comparisons": _extract_comparisons(text),
        "steps": _extract_flow_steps(text),
        "nodes": _extract_chain_nodes(text),
        "series": _extract_series(text),
        "rows": _extract_rows(text),
        "drivers": _extract_drivers(text),
        "risks": _extract_risks(text),
        "milestones": _extract_milestones(text),
    }


def build_hbm_infographic_tabs(sector: str, extracted: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": "tab-overview",
            "title": "总览",
            "blocks": [
                make_summary_hero_block(extracted["claims"], extracted["metrics"]),
                make_range_band_block(extracted["metrics"]),
                make_flow_map_block(extracted["steps"]),
                make_industry_chain_block(extracted["nodes"]),
                make_chart_spec_block(extracted["series"]),
            ],
        },
        {
            "id": "tab-tech",
            "title": "技术代际",
            "blocks": [
                make_timeline_block(extracted["milestones"]),
                make_comparison_table_block(extracted["rows"]),
            ],
        },
    ]


def build_hbm_draft_canvas(sector: str, sources: list[dict[str, Any]]) -> dict[str, Any]:
    extracted = extract_hbm_expression_units(sources)
    return {
        "kind": "industry_draft_canvas",
        "version": "v2",
        "scope": sector,
        "tabs": build_hbm_infographic_tabs(sector, extracted),
        "meta": {"generated_at": now_iso(), "source_mode": "auto"},
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Expected: PASS with new extraction, block-selection, and existing HBM compatibility tests green.

- [ ] **Step 7: Commit**

```bash
git add backend/research_hub.py backend/tests/test_hbm_draft_dashboard.py
git commit -m "feat: generate HBM draft infographic blocks"
```

## Task 3: Replace Card Rendering with a Generic Block Router

**Files:**
- Modify: `frontend/src/components/research/IndustryDraftCanvas.tsx`
- Modify: `frontend/src/components/research/IndustryDraftCardRenderer.tsx`
- Modify: `frontend/src/components/research/HBMDraftDashboard.tsx`
- Modify: `frontend/src/components/research/hbm-draft-dashboard.ts`
- Modify: `frontend/src/pages/Framework.tsx`
- Create: `frontend/tests/industry-draft-blocks.test.mjs`

**Interfaces:**
- Consumes:
  - `IndustryDraftCanvasSchema`
  - `migrateCanvasCardsToBlocks(schema)`
  - legacy HBM dashboard payloads
- Produces:
  - `renderIndustryDraftBlock(block: IndustryDraftBlock): ReactNode`
  - `mapLegacyHbmDashboardToCanvas(data: HBMDraftDashboardData): IndustryDraftCanvasSchema`
  - HBM-only `Framework.tsx` branch that always hands a block-first canvas to the renderer

- [ ] **Step 1: Write the failing block-router test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { getIndustryDraftBlockComponent } from "../src/components/research/IndustryDraftCardRenderer";

test("getIndustryDraftBlockComponent routes first-phase block types", () => {
  assert.equal(getIndustryDraftBlockComponent("range_band"), "RangeBandBlock");
  assert.equal(getIndustryDraftBlockComponent("flow_map"), "FlowMapBlock");
  assert.equal(getIndustryDraftBlockComponent("industry_chain"), "IndustryChainBlock");
  assert.equal(getIndustryDraftBlockComponent("comparison_table"), "ComparisonTableBlock");
  assert.equal(getIndustryDraftBlockComponent("chart_spec"), "ChartSpecBlock");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/tests/industry-draft-blocks.test.mjs`

Expected: FAIL because there is no generic block router yet.

- [ ] **Step 3: Write the failing legacy-adapter test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { mapLegacyHbmDashboardToCanvas } from "../src/components/research/hbm-draft-dashboard";

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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test frontend/tests/hbm-draft-dashboard.test.mjs`

Expected: FAIL because the legacy adapter still targets fixed card renderers.

- [ ] **Step 5: Write minimal block-router and HBM compatibility shell**

```ts
// frontend/src/components/research/IndustryDraftCardRenderer.tsx
export function getIndustryDraftBlockComponent(type: string) {
  switch (type) {
    case "range_band":
      return "RangeBandBlock";
    case "flow_map":
      return "FlowMapBlock";
    case "industry_chain":
      return "IndustryChainBlock";
    case "comparison_table":
      return "ComparisonTableBlock";
    case "chart_spec":
      return "ChartSpecBlock";
    default:
      return "GenericDraftBlock";
  }
}
```

```ts
// frontend/src/components/research/hbm-draft-dashboard.ts
export function mapLegacyHbmDashboardToCanvas(data) {
  return {
    kind: "industry_draft_canvas",
    version: "v2",
    scope: "HBM",
    tabs: (data.tabs || []).map((tab, tabIndex) => ({
      id: `tab-${tab.key || tabIndex + 1}`,
      title: tab.label || "未命名栏目",
      blocks: (tab.sections || []).map((section, blockIndex) =>
        mapLegacySectionToBlock(section, blockIndex),
      ),
    })),
  };
}
```

```tsx
// frontend/src/pages/Framework.tsx
const draftSchema = shouldUseIndustryDraftCanvas(selectedSector || "", sectorWorkbench)
  ? migrateCanvasCardsToBlocks(sectorWorkbench.draft_theme_schema)
  : shouldUseHBMDraftDashboard(selectedSector || "", sectorWorkbench)
    ? mapLegacyHbmDashboardToCanvas(sectorWorkbench.draft_theme_schema)
    : null;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test frontend/tests/hbm-draft-dashboard.test.mjs frontend/tests/industry-draft-blocks.test.mjs frontend/tests/industry-draft-canvas.test.mjs`

Expected: PASS with block routing and legacy HBM upgrade coverage green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/research/IndustryDraftCanvas.tsx frontend/src/components/research/IndustryDraftCardRenderer.tsx frontend/src/components/research/HBMDraftDashboard.tsx frontend/src/components/research/hbm-draft-dashboard.ts frontend/src/pages/Framework.tsx frontend/tests/hbm-draft-dashboard.test.mjs frontend/tests/industry-draft-blocks.test.mjs frontend/tests/industry-draft-canvas.test.mjs
git commit -m "feat: route HBM draft through infographic block renderer"
```

## Task 4: Implement First-Phase Report Blocks and Generic Chart Rendering

**Files:**
- Create: `frontend/src/components/research/industry-draft-blocks/RangeBandBlock.tsx`
- Create: `frontend/src/components/research/industry-draft-blocks/FlowMapBlock.tsx`
- Create: `frontend/src/components/research/industry-draft-blocks/IndustryChainBlock.tsx`
- Create: `frontend/src/components/research/industry-draft-blocks/ComparisonTableBlock.tsx`
- Create: `frontend/src/components/research/industry-draft-blocks/ChartSpecBlock.tsx`
- Modify: `frontend/src/components/research/IndustryDraftCardRenderer.tsx`
- Modify: `frontend/tests/industry-draft-blocks.test.mjs`

**Interfaces:**
- Consumes:
  - `IndustryDraftBlock["spec"]`
  - `getIndustryDraftBlockComponent(type: string)`
- Produces:
  - `RangeBandBlock({ block }): JSX.Element`
  - `FlowMapBlock({ block }): JSX.Element`
  - `IndustryChainBlock({ block }): JSX.Element`
  - `ComparisonTableBlock({ block }): JSX.Element`
  - `ChartSpecBlock({ block }): JSX.Element`

- [ ] **Step 1: Write the failing renderer smoke test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { ChartSpecBlock } from "../src/components/research/industry-draft-blocks/ChartSpecBlock";

test("ChartSpecBlock renders stacked bar labels and values", () => {
  const html = renderToStaticMarkup(
    ChartSpecBlock({
      block: {
        id: "chart-1",
        type: "chart_spec",
        title: "层数演进",
        spec: {
          chart_type: "stacked_bar",
          series: [
            { name: "HBM3", value: 12 },
            { name: "HBM3E", value: 16 },
          ],
        },
      },
    }),
  );

  assert.match(html, /HBM3E/);
  assert.match(html, /16/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/tests/industry-draft-blocks.test.mjs`

Expected: FAIL because the block components do not exist yet.

- [ ] **Step 3: Write minimal first-phase renderers**

```tsx
// frontend/src/components/research/industry-draft-blocks/ChartSpecBlock.tsx
export function ChartSpecBlock({ block }) {
  const chartType = block.spec?.chart_type || "bar";
  const series = Array.isArray(block.spec?.series) ? block.spec.series : [];
  return (
    <section className="industry-draft-block industry-draft-chart-block">
      <header>
        <h3>{block.title}</h3>
        {block.subtitle ? <p>{block.subtitle}</p> : null}
      </header>
      <div data-chart-type={chartType}>
        {series.map((item) => (
          <div key={item.name} className="industry-draft-chart-row">
            <span>{item.name}</span>
            <span>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// frontend/src/components/research/industry-draft-blocks/FlowMapBlock.tsx
export function FlowMapBlock({ block }) {
  const steps = Array.isArray(block.spec?.steps) ? block.spec.steps : [];
  return (
    <section className="industry-draft-block industry-draft-flow-block">
      <h3>{block.title}</h3>
      <div className="industry-draft-flow-track">
        {steps.map((step) => <div key={step.label}>{step.label}</div>)}
      </div>
    </section>
  );
}
```

```tsx
// frontend/src/components/research/industry-draft-blocks/IndustryChainBlock.tsx
export function IndustryChainBlock({ block }) {
  const columns = Array.isArray(block.spec?.columns) ? block.spec.columns : [];
  return (
    <section className="industry-draft-block industry-draft-chain-block">
      <h3>{block.title}</h3>
      <div className="industry-draft-chain-grid">
        {columns.map((column) => (
          <div key={column.title}>
            <h4>{column.title}</h4>
            {(column.nodes || []).map((node) => <div key={node}>{node}</div>)}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test frontend/tests/industry-draft-blocks.test.mjs`

Expected: PASS with renderer smoke coverage green for first-phase blocks.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/industry-draft-blocks/RangeBandBlock.tsx frontend/src/components/research/industry-draft-blocks/FlowMapBlock.tsx frontend/src/components/research/industry-draft-blocks/IndustryChainBlock.tsx frontend/src/components/research/industry-draft-blocks/ComparisonTableBlock.tsx frontend/src/components/research/industry-draft-blocks/ChartSpecBlock.tsx frontend/src/components/research/IndustryDraftCardRenderer.tsx frontend/tests/industry-draft-blocks.test.mjs
git commit -m "feat: add first-phase industry infographic blocks"
```

## Task 5: Make Tabs and Blocks Editable Without Breaking HBM-Only Scope

**Files:**
- Modify: `frontend/src/components/research/IndustryDraftCanvasEditor.tsx`
- Modify: `frontend/src/components/research/IndustryDraftCanvas.tsx`
- Modify: `frontend/src/components/research/industry-draft-canvas.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `backend/app.py`
- Modify: `backend/tests/test_industry_infographic_schema.py`
- Modify: `frontend/tests/industry-draft-canvas.test.mjs`

**Interfaces:**
- Consumes:
  - `POST /api/research/overview-workbench/draft-theme-schema`
  - `IndustryDraftCanvasSchema`
  - `IndustryDraftBlock`
- Produces:
  - `appendIndustryDraftBlock(tabId: string, type: IndustryDraftBlock["type"])`
  - `updateIndustryDraftBlock(tabId: string, blockId: string, patch: Partial<IndustryDraftBlock>)`
  - `removeIndustryDraftBlock(tabId: string, blockId: string)`

- [ ] **Step 1: Write the failing editor-helper test**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { appendIndustryDraftBlock } from "../src/components/research/industry-draft-canvas";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/tests/industry-draft-canvas.test.mjs`

Expected: FAIL because block-level editing helpers do not yet exist.

- [ ] **Step 3: Write the failing backend round-trip test for block edits**

```python
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def test_save_draft_theme_schema_round_trips_block_edits():
    payload = {
        "scope_type": "sector",
        "scope_id": "HBM-editable-blocks",
        "schema": {
            "kind": "industry_draft_canvas",
            "version": "v2",
            "scope": "HBM",
            "tabs": [
                {
                    "id": "tab-overview",
                    "title": "总览",
                    "blocks": [
                        {
                            "id": "block-1",
                            "type": "comparison_table",
                            "title": "代际对比",
                            "spec": {"columns": ["项目", "HBM3E"], "rows": [["层数", "16Hi"]]},
                        }
                    ],
                }
            ],
        },
    }

    response = client.post("/api/research/overview-workbench/draft-theme-schema", json=payload)

    assert response.status_code == 200
    assert response.json()["data"]["draft_theme_schema"]["tabs"][0]["blocks"][0]["type"] == "comparison_table"
```

- [ ] **Step 4: Run test to verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_industry_infographic_schema.py::test_save_draft_theme_schema_round_trips_block_edits -v`

Expected: FAIL until the backend normalization fully accepts edited `blocks[]` payloads.

- [ ] **Step 5: Write minimal block-edit helpers and save wiring**

```ts
// frontend/src/components/research/industry-draft-canvas.ts
export function appendIndustryDraftBlock(canvas, tabId, type) {
  return {
    ...canvas,
    tabs: canvas.tabs.map((tab) =>
      tab.id !== tabId
        ? tab
        : {
            ...tab,
            blocks: [
              ...tab.blocks,
              {
                id: `block-${tab.blocks.length + 1}`,
                type,
                title: "",
                subtitle: "",
                spec: {},
                sources: [],
                footnote: "",
                style_variant: "dark-report",
              },
            ],
          },
    ),
  };
}
```

```tsx
// frontend/src/components/research/IndustryDraftCanvasEditor.tsx
<button onClick={() => onAddBlock(activeTabId, "comparison_table")}>新增对比表</button>
<button onClick={() => onAddBlock(activeTabId, "chart_spec")}>新增图表</button>
```

```ts
// frontend/src/lib/api.ts
export async function saveOverviewDraftThemeSchema(input: {
  scope_type: "sector" | "stock";
  scope_id: string;
  schema: IndustryDraftCanvasSchema;
}) {
  return apiPost("/api/research/overview-workbench/draft-theme-schema", input);
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `backend/.venv/bin/pytest backend/tests/test_industry_infographic_schema.py backend/tests/test_hbm_draft_dashboard.py -q`

Expected: PASS.

Run: `node --test frontend/tests/industry-draft-canvas.test.mjs frontend/tests/industry-draft-blocks.test.mjs frontend/tests/hbm-draft-dashboard.test.mjs`

Expected: PASS.

Run: `cd frontend && node ./node_modules/typescript/bin/tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app.py backend/tests/test_industry_infographic_schema.py frontend/src/components/research/IndustryDraftCanvasEditor.tsx frontend/src/components/research/IndustryDraftCanvas.tsx frontend/src/components/research/industry-draft-canvas.ts frontend/src/lib/api.ts frontend/tests/industry-draft-canvas.test.mjs
git commit -m "feat: support editable infographic blocks in HBM draft"
```

## Self-Review

- Spec coverage:
  - `cards[] -> blocks[]` migration is covered in Task 1.
  - Extraction-layer upgrade into `claims / metrics / comparisons / steps / nodes / series / rows / drivers / risks / milestones` is covered in Task 2.
  - Generic `block.type + block.spec` frontend rendering is covered in Task 3.
  - First-phase renderer rollout for `range_band / flow_map / industry_chain / comparison_table / chart_spec` is covered in Task 4.
  - Editable tabs/blocks with HBM-only scope and unchanged non-HBM behavior is covered in Task 5.
- Placeholder scan:
  - Searched for `TODO`, `TBD`, `implement later`, and `appropriate error handling`; none are present.
- Type consistency:
  - The plan consistently uses `IndustryDraftBlock`, `tabs[].blocks[]`, `migrateCanvasCardsToBlocks`, `extract_hbm_expression_units`, and `build_hbm_infographic_tabs` across backend and frontend tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-industry-infographic-schema.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
