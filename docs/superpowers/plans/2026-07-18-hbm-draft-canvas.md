# HBM Draft Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `行业概览 -> HBM -> 初稿` from the current HBM-only tab dashboard into a reusable `tab + cards` draft canvas with editable tabs and editable cards, while keeping HBM-only scope and preserving all non-HBM behavior.

**Architecture:** Keep the existing `draft_theme_schema` storage slot but evolve its payload from `hbm_draft_dashboard` into a new `industry_draft_canvas` schema. Add a backend adapter that can generate, persist, and auto-upgrade HBM records into the new schema, then add a frontend canvas renderer/editor that reuses the current HBM entry branch in `Framework.tsx` without changing deep view or other industries.

**Tech Stack:** FastAPI, repo-local Python tests with `pytest`, React + TypeScript, existing overview workbench API/storage, current HBM dashboard helpers, current stock-data visual language.

## Global Constraints

- Only modify `行业概览 -> HBM -> 初稿`.
- Do not modify `深度`.
- Do not change any non-HBM industry default rendering.
- Do not redesign the stock-data page; only reuse its visual expression patterns.
- Do not implement free-drag canvas layout.
- Do not implement arbitrary absolute positioning.
- Use `draft_theme_schema` as the single persisted canvas slot; do not introduce a parallel workbench store.
- Keep old HBM schema readable by auto-mapping it to the new canvas schema.
- New non-HBM support is out of scope; non-HBM sectors must keep their current fallback path.

---

## File Map

**Backend**

- Modify: `backend/research_hub.py`
  - Add reusable `industry_draft_canvas` builders and HBM-specific canvas generation.
  - Add legacy HBM schema -> canvas mapping helpers.
- Modify: `backend/app.py`
  - Read path: auto-upgrade HBM workbench schema on load.
  - Write path: add save endpoint for edited draft theme schema.
- Modify: `backend/knowledge.py`
  - Normalize and round-trip new canvas schema through `draft_theme_schema`.
- Modify: `backend/tests/test_hbm_draft_dashboard.py`
  - Extend current HBM schema tests to cover new canvas generation and legacy mapping.
- Create: `backend/tests/test_industry_draft_canvas.py`
  - Focused tests for new schema persistence and save endpoint behavior.

**Frontend**

- Modify: `frontend/src/lib/api.ts`
  - Add reusable TypeScript types for `industry_draft_canvas`.
  - Add save API for `draft_theme_schema`.
- Create: `frontend/src/components/research/industry-draft-canvas.ts`
  - Schema helpers, factories, default tab/card helpers, legacy adapter helpers.
- Create: `frontend/src/components/research/IndustryDraftCardRenderer.tsx`
  - Render `summary_hero`, `metric_grid`, `range_band`, `comparison_cards`, `timeline`.
- Create: `frontend/src/components/research/IndustryDraftCanvasEditor.tsx`
  - Tab toolbar, card toolbar, inline editor panels.
- Create: `frontend/src/components/research/IndustryDraftCanvas.tsx`
  - Read mode + edit mode shell for tabs and cards.
- Modify: `frontend/src/components/research/HBMDraftDashboard.tsx`
  - Convert into a thin compatibility wrapper that maps legacy HBM data into `industry_draft_canvas`.
- Modify: `frontend/src/components/research/hbm-draft-dashboard.ts`
  - Replace HBM-only rendering helpers with legacy adapter helpers.
- Modify: `frontend/src/pages/Framework.tsx`
  - Route HBM draft rendering to the new canvas and wire save/edit entrypoints.
- Create: `frontend/tests/industry-draft-canvas.test.mjs`
  - Unit tests for adapters and helpers.
- Modify: `frontend/tests/hbm-draft-dashboard.test.mjs`
  - Keep legacy-compat coverage.

## Task 1: Define the New Canvas Schema and Backend Persistence

**Files:**
- Modify: `backend/knowledge.py`
- Modify: `backend/app.py`
- Modify: `frontend/src/lib/api.ts`
- Create: `backend/tests/test_industry_draft_canvas.py`

**Interfaces:**
- Consumes:
  - `knowledge.get_overview_workbench(scope_type: str, scope_id: str) -> dict`
  - `knowledge.save_overview_draft_theme_schema(scope_type: str, scope_id: str, schema: dict | None) -> dict`
- Produces:
  - `POST /api/research/overview-workbench/draft-theme-schema`
  - TypeScript type `IndustryDraftCanvasSchema`
  - Backend helper contract: `normalize_industry_draft_canvas(schema: dict | None) -> dict`

- [ ] **Step 1: Write the failing backend persistence test**

```python
from fastapi.testclient import TestClient
from app import app
import knowledge

client = TestClient(app)


def test_save_draft_theme_schema_round_trips_industry_canvas():
    payload = {
        "scope_type": "sector",
        "scope_id": "HBM-canvas-save",
        "schema": {
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
                            "layout": "hero",
                            "content": {"headline": "HBM 需求偏强", "bullets": [], "tags": []},
                        }
                    ],
                }
            ],
            "meta": {"generated_at": "2026-07-18T00:00:00+08:00", "source_mode": "auto"},
        },
    }

    response = client.post("/api/research/overview-workbench/draft-theme-schema", json=payload)

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["draft_theme_schema"]["kind"] == "industry_draft_canvas"
    stored = knowledge.get_overview_workbench("sector", "HBM-canvas-save")
    assert stored["draft_theme_schema"]["tabs"][0]["title"] == "总览"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_industry_draft_canvas.py::test_save_draft_theme_schema_round_trips_industry_canvas -v`

Expected: FAIL with `404` for missing endpoint or missing schema persistence assertions.

- [ ] **Step 3: Write minimal backend normalization and save endpoint**

```python
# backend/knowledge.py
def normalize_industry_draft_canvas(schema: dict[str, Any] | None) -> dict[str, Any]:
    raw = deepcopy(schema or {})
    if raw.get("kind") != "industry_draft_canvas":
        return raw
    raw["version"] = str(raw.get("version") or "v1")
    raw["scope"] = str(raw.get("scope") or "")
    raw["tabs"] = [
        {
            "id": str(tab.get("id") or f"tab-{index}"),
            "title": str(tab.get("title") or "未命名栏目"),
            "cards": list(tab.get("cards") or []),
        }
        for index, tab in enumerate(raw.get("tabs") or [])
    ]
    raw["meta"] = dict(raw.get("meta") or {})
    return raw


def save_overview_draft_theme_schema(scope_type: str, scope_id: str, schema: dict[str, Any] | None) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    record["draft_theme_schema"] = normalize_industry_draft_canvas(schema)
    record["updated_at"] = _now_iso()
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)
```

```python
# backend/app.py
class OverviewDraftThemeSchemaIn(BaseModel):
    scope_type: Literal["sector", "stock"]
    scope_id: str
    schema: dict = {}


@app.post("/api/research/overview-workbench/draft-theme-schema")
def research_overview_workbench_save_draft_theme_schema(payload: OverviewDraftThemeSchemaIn):
    try:
        return {"data": knowledge.save_overview_draft_theme_schema(payload.scope_type, payload.scope_id, payload.schema)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
```

```ts
// frontend/src/lib/api.ts
export interface IndustryDraftCanvasCard {
  id: string;
  type: "summary_hero" | "metric_grid" | "range_band" | "comparison_cards" | "timeline";
  title?: string;
  layout?: string;
  content: Record<string, unknown>;
  sources?: string[];
  footnote?: string;
  style_variant?: string;
}

export interface IndustryDraftCanvasTab {
  id: string;
  title: string;
  cards: IndustryDraftCanvasCard[];
}

export interface IndustryDraftCanvasSchema {
  kind: "industry_draft_canvas";
  version: string;
  scope: string;
  tabs: IndustryDraftCanvasTab[];
  meta?: Record<string, unknown>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/.venv/bin/pytest backend/tests/test_industry_draft_canvas.py -q`

Expected: PASS with the new round-trip test green.

- [ ] **Step 5: Commit**

```bash
git add backend/knowledge.py backend/app.py backend/tests/test_industry_draft_canvas.py frontend/src/lib/api.ts
git commit -m "feat: add industry draft canvas schema persistence"
```

## Task 2: Build HBM Canvas Generation and Legacy Auto-Upgrade

**Files:**
- Modify: `backend/research_hub.py`
- Modify: `backend/app.py`
- Modify: `backend/tests/test_hbm_draft_dashboard.py`

**Interfaces:**
- Consumes:
  - `build_sector_overview_modules(sector: str) -> dict`
  - `_validated_overview_workbench(scope_type: Literal["sector", "stock"], scope_id: str) -> dict`
- Produces:
  - `build_hbm_draft_canvas(sector: str, sources: list[dict]) -> dict`
  - `map_legacy_hbm_dashboard_to_canvas(schema: dict) -> dict`
  - HBM load behavior that always returns `industry_draft_canvas` when schema exists or can be inferred

- [ ] **Step 1: Write the failing HBM generation test**

```python
from research_hub import build_hbm_draft_canvas


def test_build_hbm_draft_canvas_returns_editable_tabs_and_cards():
    schema = build_hbm_draft_canvas(
        "HBM",
        [{"label": "研报/1", "text": "HBM3E 放量、先进封装、海力士、库存周期。"}],
    )

    assert schema["kind"] == "industry_draft_canvas"
    assert schema["tabs"][0]["title"] == "总览"
    assert schema["tabs"][0]["cards"][0]["type"] == "summary_hero"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py::test_build_hbm_draft_canvas_returns_editable_tabs_and_cards -v`

Expected: FAIL because `build_hbm_draft_canvas` does not exist yet.

- [ ] **Step 3: Implement the new canvas builder and legacy mapper**

```python
# backend/research_hub.py
def build_hbm_draft_canvas(sector: str, sources: list[dict]) -> dict:
    dashboard = build_hbm_draft_dashboard(sector, sources)
    return map_legacy_hbm_dashboard_to_canvas(dashboard)


def map_legacy_hbm_dashboard_to_canvas(schema: dict[str, Any]) -> dict[str, Any]:
    tabs = []
    for tab in schema.get("tabs") or []:
        cards = [
            {
                "id": f"{tab['key']}-hero",
                "type": "summary_hero",
                "title": tab.get("title") or "",
                "layout": "hero",
                "content": {
                    "headline": tab.get("headline") or "",
                    "bullets": list(tab.get("summary") or []),
                    "tags": [metric.get("value") for metric in tab.get("metrics") or [] if metric.get("value")],
                },
                "sources": list(tab.get("sources") or []),
            }
        ]
        if tab.get("metrics"):
            cards.append({
                "id": f"{tab['key']}-metrics",
                "type": "metric_grid",
                "title": "关键指标",
                "layout": "grid",
                "content": {"items": list(tab.get("metrics") or [])},
            })
        tabs.append({
            "id": str(tab.get("key") or f"tab-{len(tabs)}"),
            "title": str(tab.get("title") or "未命名栏目"),
            "cards": cards,
        })
    return {
        "kind": "industry_draft_canvas",
        "version": "v1",
        "scope": sector if (sector := schema.get("scope")) else "HBM",
        "tabs": tabs,
        "meta": {"generated_at": schema.get("generated_at") or "", "source_mode": "auto"},
    }
```

```python
# backend/app.py inside _validated_overview_workbench
if scope_type == "sector" and research_hub.is_hbm_sector(scope_id):
    schema = data.get("draft_theme_schema") or {}
    if schema.get("kind") == "hbm_draft_dashboard":
        upgraded = research_hub.map_legacy_hbm_dashboard_to_canvas(schema)
        saved = knowledge.save_overview_draft_theme_schema(scope_type, scope_id, upgraded)
        data["draft_theme_schema"] = saved.get("draft_theme_schema") or upgraded
    elif schema.get("kind") != "industry_draft_canvas":
        generated = research_hub.build_hbm_draft_canvas(scope_id, data.get("sources") or [])
        saved = knowledge.save_overview_draft_theme_schema(scope_type, scope_id, generated)
        data["draft_theme_schema"] = saved.get("draft_theme_schema") or generated
```

- [ ] **Step 4: Run the HBM backend tests**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py backend/tests/test_industry_draft_canvas.py -q`

Expected: PASS with legacy upgrade and new builder tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/research_hub.py backend/app.py backend/tests/test_hbm_draft_dashboard.py backend/tests/test_industry_draft_canvas.py
git commit -m "feat: upgrade HBM draft schema to canvas"
```

## Task 3: Add a Read-Only Industry Draft Canvas Renderer

**Files:**
- Create: `frontend/src/components/research/industry-draft-canvas.ts`
- Create: `frontend/src/components/research/IndustryDraftCardRenderer.tsx`
- Create: `frontend/src/components/research/IndustryDraftCanvas.tsx`
- Modify: `frontend/src/components/research/HBMDraftDashboard.tsx`
- Modify: `frontend/src/components/research/hbm-draft-dashboard.ts`
- Modify: `frontend/src/pages/Framework.tsx`
- Create: `frontend/tests/industry-draft-canvas.test.mjs`
- Modify: `frontend/tests/hbm-draft-dashboard.test.mjs`

**Interfaces:**
- Consumes:
  - `IndustryDraftCanvasSchema`
  - `OverviewWorkbench["draft_theme_schema"]`
  - Existing `Framework.tsx` HBM branch
- Produces:
  - `<IndustryDraftCanvas data={...} />`
  - `adaptLegacyHBMDashboardToCanvas(data): IndustryDraftCanvasSchema`
  - New HBM rendering path that remains HBM-only

- [ ] **Step 1: Write the failing frontend adapter test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { adaptLegacyHBMDashboardToCanvas } from "../src/components/research/industry-draft-canvas";

test("adaptLegacyHBMDashboardToCanvas maps summary into summary_hero card", () => {
  const canvas = adaptLegacyHBMDashboardToCanvas({
    kind: "hbm_draft_dashboard",
    tabs: [{ key: "overview", title: "总览", headline: "HBM 放量", summary: ["需求偏强"], metrics: [], panels: [] }],
  });

  assert.equal(canvas.kind, "industry_draft_canvas");
  assert.equal(canvas.tabs[0].cards[0].type, "summary_hero");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/tests/industry-draft-canvas.test.mjs`

Expected: FAIL because the adapter/helper file does not exist yet.

- [ ] **Step 3: Implement the read-only canvas renderer**

```ts
// frontend/src/components/research/industry-draft-canvas.ts
export function adaptLegacyHBMDashboardToCanvas(data) {
  return {
    kind: "industry_draft_canvas",
    version: "v1",
    scope: "HBM",
    tabs: (data.tabs || []).map((tab, index) => ({
      id: tab.key || `tab-${index}`,
      title: tab.title || "未命名栏目",
      cards: [
        {
          id: `${tab.key}-hero`,
          type: "summary_hero",
          title: tab.title || "",
          layout: "hero",
          content: {
            headline: tab.headline || "",
            bullets: tab.summary || [],
            tags: (tab.metrics || []).map((metric) => metric.value).filter(Boolean),
          },
          sources: tab.sources || [],
        },
      ],
    })),
    meta: {},
  };
}
```

```tsx
// frontend/src/components/research/IndustryDraftCardRenderer.tsx
export function IndustryDraftCardRenderer({ card }) {
  if (card.type === "summary_hero") {
    return <section>{card.title}{card.content.headline}</section>;
  }
  if (card.type === "metric_grid") {
    return <section>{(card.content.items || []).map((item) => <div key={item.label}>{item.label}:{item.value}</div>)}</section>;
  }
  return <section>{card.title}</section>;
}
```

```tsx
// frontend/src/components/research/IndustryDraftCanvas.tsx
export function IndustryDraftCanvas({ data }) {
  const [activeTabId, setActiveTabId] = useState(data.tabs[0]?.id || "");
  const activeTab = data.tabs.find((tab) => tab.id === activeTabId) || data.tabs[0];
  if (!activeTab) return null;
  return (
    <section>
      <div>{data.tabs.map((tab) => <button key={tab.id} onClick={() => setActiveTabId(tab.id)}>{tab.title}</button>)}</div>
      <div>{activeTab.cards.map((card) => <IndustryDraftCardRenderer key={card.id} card={card} />)}</div>
    </section>
  );
}
```

```tsx
// frontend/src/pages/Framework.tsx
{selectedSector === "HBM" && sectorWorkbench?.draft_theme_schema?.kind === "industry_draft_canvas"
  ? <IndustryDraftCanvas data={sectorWorkbench.draft_theme_schema} />
  : shouldUseHBMDraftDashboard(selectedSector || "", sectorWorkbench)
    ? <HBMDraftDashboard data={sectorWorkbench.draft_theme_schema} />
    : ...}
```

- [ ] **Step 4: Run frontend tests**

Run: `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/tests/industry-draft-canvas.test.mjs frontend/tests/hbm-draft-dashboard.test.mjs`

Expected: PASS with adapter and HBM-compat tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/industry-draft-canvas.ts frontend/src/components/research/IndustryDraftCardRenderer.tsx frontend/src/components/research/IndustryDraftCanvas.tsx frontend/src/components/research/HBMDraftDashboard.tsx frontend/src/components/research/hbm-draft-dashboard.ts frontend/src/pages/Framework.tsx frontend/tests/industry-draft-canvas.test.mjs frontend/tests/hbm-draft-dashboard.test.mjs
git commit -m "feat: render HBM draft as industry canvas"
```

## Task 4: Add HBM-Only Canvas Editing and Save Flow

**Files:**
- Create: `frontend/src/components/research/IndustryDraftCanvasEditor.tsx`
- Modify: `frontend/src/components/research/IndustryDraftCanvas.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/Framework.tsx`
- Create: `backend/tests/test_industry_draft_canvas.py`
- Create: `frontend/tests/industry-draft-canvas.test.mjs`

**Interfaces:**
- Consumes:
  - `api.saveOverviewDraftThemeSchema(payload)`
  - `IndustryDraftCanvasSchema`
  - HBM-only rendering branch in `Framework.tsx`
- Produces:
  - HBM draft edit mode
  - Tab add/remove/rename/reorder controls
  - Card add/remove/template-switch/reorder/content-edit controls
  - Persisted schema save + refresh behavior

- [ ] **Step 1: Write the failing save-flow test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyCanvasTab, createCanvasCard } from "../src/components/research/industry-draft-canvas";

test("createEmptyCanvasTab returns editable tab shell", () => {
  const tab = createEmptyCanvasTab();
  assert.equal(tab.title, "未命名栏目");
  assert.deepEqual(tab.cards, []);
});

test("createCanvasCard creates metric_grid card with editable items array", () => {
  const card = createCanvasCard("metric_grid");
  assert.equal(card.type, "metric_grid");
  assert.ok(Array.isArray(card.content.items));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/tests/industry-draft-canvas.test.mjs`

Expected: FAIL because card/tab factories and edit helpers are not complete yet.

- [ ] **Step 3: Implement edit-mode helpers and save API usage**

```ts
// frontend/src/lib/api.ts
saveOverviewDraftThemeSchema: (payload: {
  scope_type: "sector" | "stock";
  scope_id: string;
  schema: IndustryDraftCanvasSchema;
}) => request<OverviewWorkbench>("/research/overview-workbench/draft-theme-schema", "POST", payload),
```

```ts
// frontend/src/components/research/industry-draft-canvas.ts
export function createEmptyCanvasTab() {
  return { id: `tab-${Date.now()}`, title: "未命名栏目", cards: [] };
}

export function createCanvasCard(type) {
  if (type === "metric_grid") {
    return { id: `card-${Date.now()}`, type, title: "关键指标", layout: "grid", content: { items: [] } };
  }
  return { id: `card-${Date.now()}`, type, title: "新卡片", layout: "hero", content: {} };
}
```

```tsx
// frontend/src/components/research/IndustryDraftCanvas.tsx
const [editing, setEditing] = useState(false);
const [draft, setDraft] = useState(data);

async function saveCanvas() {
  const saved = await api.saveOverviewDraftThemeSchema({
    scope_type: "sector",
    scope_id: "HBM",
    schema: draft,
  });
  setDraft(saved.draft_theme_schema);
  setEditing(false);
}
```

```tsx
// frontend/src/components/research/IndustryDraftCanvasEditor.tsx
export function IndustryDraftCanvasEditor({ tab, onRenameTab, onAddCard, onMoveCard, onDeleteCard, onUpdateCard }) {
  return (
    <div>
      <input value={tab.title} onChange={(e) => onRenameTab(e.target.value)} />
      <button onClick={() => onAddCard("summary_hero")}>新增速览卡</button>
      <button onClick={() => onAddCard("metric_grid")}>新增指标卡</button>
    </div>
  );
}
```

- [ ] **Step 4: Run the relevant tests and one manual save check**

Run:
- `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/tests/industry-draft-canvas.test.mjs`
- `backend/.venv/bin/pytest backend/tests/test_industry_draft_canvas.py -q`

Expected:
- Unit tests PASS
- Manual browser check: HBM initial draft enters edit mode, tab title edit persists after refresh, added card persists after refresh

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/research/IndustryDraftCanvasEditor.tsx frontend/src/components/research/IndustryDraftCanvas.tsx frontend/src/components/research/industry-draft-canvas.ts frontend/src/lib/api.ts frontend/src/pages/Framework.tsx backend/tests/test_industry_draft_canvas.py frontend/tests/industry-draft-canvas.test.mjs
git commit -m "feat: add HBM draft canvas editing"
```

## Task 5: Regression Verification and HBM Acceptance

**Files:**
- Modify: `backend/tests/test_hbm_draft_dashboard.py`
- Modify: `frontend/tests/hbm-draft-dashboard.test.mjs`
- Modify: `frontend/tests/industry-draft-canvas.test.mjs`
- Optional notes: `docs/superpowers/specs/2026-07-18-hbm-draft-canvas-design.md` only if acceptance wording needs clarification

**Interfaces:**
- Consumes:
  - All prior task outputs
- Produces:
  - Regression safety around HBM read path, legacy upgrade, and editor persistence
  - Final manual acceptance checklist for this HBM-only trial

- [ ] **Step 1: Add failing regression tests for non-HBM fallback**

```python
def test_non_hbm_sector_keeps_existing_render_path(monkeypatch):
    monkeypatch.setattr("research_hub.is_hbm_sector", lambda sector: False)
    data = app_module._validated_overview_workbench("sector", "光互联")
    assert (data.get("draft_theme_schema") or {}).get("kind") != "industry_draft_canvas"
```

```js
test("non-HBM helper guard stays false for non-HBM sectors", () => {
  assert.equal(shouldUseHBMDraftDashboard("光互联", { draft_theme_schema: { kind: "industry_draft_canvas" } }), false);
});
```

- [ ] **Step 2: Run tests to verify they fail or expose missing guard logic**

Run:
- `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py::test_non_hbm_sector_keeps_existing_render_path -v`
- `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/tests/hbm-draft-dashboard.test.mjs`

Expected: FAIL or reveal changed assumptions that need explicit guards.

- [ ] **Step 3: Tighten guards and finalize acceptance notes**

```tsx
// frontend/src/pages/Framework.tsx
const canUseIndustryDraftCanvas =
  selectedSector === "HBM" && sectorWorkbench?.draft_theme_schema?.kind === "industry_draft_canvas";
```

```python
# backend/app.py
if scope_type == "sector" and research_hub.is_hbm_sector(scope_id):
    ...
else:
    return data
```

- [ ] **Step 4: Run the full targeted verification suite**

Run:
- `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py backend/tests/test_industry_draft_canvas.py -q`
- `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test frontend/tests/hbm-draft-dashboard.test.mjs frontend/tests/industry-draft-canvas.test.mjs`

Expected: PASS

Manual acceptance:
- HBM initial draft still uses tabs
- HBM tab titles are editable and persist
- HBM tab add/delete/reorder works
- HBM card add/delete/template-switch/edit works
- HBM refresh keeps saved state
- HBM deep section unchanged
- Non-HBM sectors unchanged

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_hbm_draft_dashboard.py backend/tests/test_industry_draft_canvas.py frontend/tests/hbm-draft-dashboard.test.mjs frontend/tests/industry-draft-canvas.test.mjs frontend/src/pages/Framework.tsx backend/app.py
git commit -m "test: verify HBM draft canvas regression coverage"
```
