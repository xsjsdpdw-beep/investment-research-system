# HBM Draft Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a HBM-only draft dashboard in the sector overview area with five fixed tabs and safe fallback to the existing generic draft preview.

**Architecture:** Extend the existing sector overview builder to emit a HBM-specific draft schema plus render metadata, persist it through the existing overview workbench response, and render it with a dedicated HBM dashboard component only when the selected sector is HBM. Keep the generic overview builder, deep cards, and non-HBM sectors unchanged by isolating the new branch behind explicit `HBM` checks and renderer guards.

**Tech Stack:** Python/FastAPI backend, local knowledge/overview workbench helpers, React/TypeScript frontend, Vitest-style frontend tests, pytest backend tests.

## Global Constraints

- Only `HBM` sector draft overview gets the new dashboard behavior.
- Do not modify `HBM` deep content, deep rendering, or deep editing flows.
- Do not modify `光互联` or any non-`HBM` sector behavior.
- Do not replace the generic `StructuredOverviewRenderer` for the rest of the app.
- The five tabs must be fixed in this exact order: `总览`, `技术代际`, `成本与卡口`, `产业龙头`, `周期温度计`.
- If HBM-specific schema generation or rendering fails, fall back to the existing generic draft preview.
- Use TDD: every behavior change starts with a failing test.
- Keep changes focused to the HBM draft path and related tests only.

---

## File Structure

- `backend/research_hub.py`
  - Existing sector overview build logic.
  - Add HBM-specific draft schema extraction and serialization helpers.
- `backend/knowledge.py`
  - Existing overview workbench persistence helpers.
  - Only touch if a dedicated draft metadata field is needed for HBM render recipe persistence.
- `backend/app.py`
  - Existing overview build and workbench API surface.
  - Only touch if response validation or payload shaping needs HBM draft metadata passthrough.
- `backend/tests/test_hbm_draft_dashboard.py`
  - New backend tests for HBM schema generation and non-HBM isolation.
- `frontend/src/lib/api.ts`
  - Shared TypeScript API models.
  - Add HBM draft dashboard types and any optional workbench fields used by the renderer.
- `frontend/src/components/research/HBMDraftDashboard.tsx`
  - New dedicated HBM draft dashboard renderer with five fixed tabs and HBM-only visual layouts.
- `frontend/src/pages/Framework.tsx`
  - Existing sector overview draft rendering entrypoint.
  - Add guarded HBM renderer branch and keep existing fallback path intact.
- `frontend/tests/hbm-draft-dashboard.test.mjs`
  - New frontend tests for HBM tab rendering, fallback behavior, and non-HBM isolation.

## Task 1: Define And Test The Backend HBM Draft Schema

**Files:**
- Create: `backend/tests/test_hbm_draft_dashboard.py`
- Modify: `backend/research_hub.py`

**Interfaces:**
- Consumes: existing `build_sector_overview_modules(sector: str) -> dict`, `_sector_sources(sector: str) -> list[dict]`, `_ranked_research_points(...)`
- Produces:
  - `build_hbm_draft_dashboard(sector: str, sources: list[dict]) -> dict`
  - `is_hbm_sector(sector: str) -> bool`
  - HBM dashboard payload shape:
    - `{"kind": "hbm_draft_dashboard", "tabs": list[dict], "generated_at": str | None}`

- [ ] **Step 1: Write the failing backend tests**

```python
from research_hub import build_hbm_draft_dashboard, is_hbm_sector


def test_is_hbm_sector_matches_hbm_only():
    assert is_hbm_sector("HBM") is True
    assert is_hbm_sector("hbm") is True
    assert is_hbm_sector("HBM存储") is True
    assert is_hbm_sector("光互联") is False


def test_build_hbm_draft_dashboard_returns_five_fixed_tabs():
    sources = [
        {"label": "研报/1", "text": "HBM3E 带宽提升，12hi/16hi 堆叠继续演进。"},
        {"label": "研报/2", "text": "良率、先进封装、扩产节奏仍是核心卡口。"},
        {"label": "研报/3", "text": "海力士、三星、美光主导，A股映射关注设备材料封测。"},
        {"label": "研报/4", "text": "价格、库存、扩产与验证节点共同决定景气温度。"},
    ]

    result = build_hbm_draft_dashboard("HBM", sources)

    assert result["kind"] == "hbm_draft_dashboard"
    assert [tab["key"] for tab in result["tabs"]] == [
        "overview",
        "generation",
        "cost_bottleneck",
        "leaders",
        "cycle_meter",
    ]
    assert [tab["title"] for tab in result["tabs"]] == [
        "总览",
        "技术代际",
        "成本与卡口",
        "产业龙头",
        "周期温度计",
    ]


def test_build_hbm_draft_dashboard_returns_safe_placeholders_when_sources_are_sparse():
    result = build_hbm_draft_dashboard("HBM", [])
    assert result["kind"] == "hbm_draft_dashboard"
    assert len(result["tabs"]) == 5
    assert all("empty_state" in tab for tab in result["tabs"])
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Expected: FAIL with missing `is_hbm_sector` and `build_hbm_draft_dashboard` symbols or missing expected payload shape.

- [ ] **Step 3: Write the minimal backend implementation**

```python
HBM_DRAFT_TABS = [
    ("overview", "总览"),
    ("generation", "技术代际"),
    ("cost_bottleneck", "成本与卡口"),
    ("leaders", "产业龙头"),
    ("cycle_meter", "周期温度计"),
]


def is_hbm_sector(sector: str) -> bool:
    normalized = (sector or "").strip().lower()
    return normalized in {"hbm", "hbm存储"}


def build_hbm_draft_dashboard(sector: str, sources: list[dict]) -> dict:
    ranked = _ranked_research_points(tuple(_sector_report_keywords(sector)), sources, limit=24)
    tabs = []
    for key, title in HBM_DRAFT_TABS:
        tabs.append({
            "key": key,
            "title": title,
            "headline": "",
            "summary": [],
            "metrics": [],
            "panels": [],
            "sources": [item["label"] for item in ranked[:3]],
            "empty_state": "资料不足，等待更多 HBM 资料进入当前栏目。",
        })
    return {
        "kind": "hbm_draft_dashboard",
        "tabs": tabs,
        "generated_at": _utc_now_iso(),
    }
```

- [ ] **Step 4: Run the backend tests to verify they pass**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/research_hub.py backend/tests/test_hbm_draft_dashboard.py
git commit -m "feat: add HBM draft dashboard schema"
```

## Task 2: Persist HBM Draft Dashboard Data Through The Overview Workbench

**Files:**
- Modify: `backend/research_hub.py`
- Modify: `backend/knowledge.py`
- Modify: `backend/app.py`
- Test: `backend/tests/test_hbm_draft_dashboard.py`

**Interfaces:**
- Consumes:
  - `build_sector_overview_modules(sector: str) -> dict`
  - overview workbench persistence helpers currently used for `draft_structured_blocks`
- Produces:
  - `result["draft_theme_schema"]` or `result["draft_render_recipe"]` in sector build result
  - overview workbench response field carrying the HBM dashboard payload for frontend consumption

- [ ] **Step 1: Extend the failing backend tests to cover HBM-only persistence**

```python
import knowledge
from research_hub import build_sector_overview_modules


def test_build_sector_overview_modules_includes_hbm_dashboard_only_for_hbm(monkeypatch):
    monkeypatch.setattr("research_hub.ingest_sector_reports", lambda sector, **kwargs: {"ingested": 0})
    monkeypatch.setattr("research_hub._sector_sources", lambda sector: [
        {"label": "研报/1", "text": "HBM3E、堆叠层数、扩产、龙头与景气信号。"}
    ])

    hbm = build_sector_overview_modules("HBM")
    cpo = build_sector_overview_modules("光互联")

    assert hbm.get("draft_theme_schema", {}).get("kind") == "hbm_draft_dashboard"
    assert cpo.get("draft_theme_schema") in (None, {})
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Expected: FAIL because the sector build result does not yet expose HBM dashboard metadata.

- [ ] **Step 3: Write the minimal persistence and response shaping implementation**

```python
def build_sector_overview_modules(sector: str) -> dict:
    ...
    draft_theme_schema = build_hbm_draft_dashboard(sector, sources) if is_hbm_sector(sector) else None
    result = {
        "scope": "sector",
        "target": sector,
        "sources_count": len(sources),
        "report_ingest": report_ingest,
        "modules": modules,
    }
    if draft_theme_schema:
        result["draft_theme_schema"] = draft_theme_schema
    return result
```

```python
def save_overview_draft_theme_schema(scope_type: str, scope_id: str, schema: dict | None) -> dict:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    record["draft_theme_schema"] = schema or None
    _save_overview_workbench(items)
    return record
```

```python
# After HBM sector build succeeds, persist the schema into the workbench draft record.
if result.get("draft_theme_schema"):
    knowledge.save_overview_draft_theme_schema("sector", payload.sector, result["draft_theme_schema"])
```

- [ ] **Step 4: Run the backend tests to verify they pass**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/research_hub.py backend/knowledge.py backend/app.py backend/tests/test_hbm_draft_dashboard.py
git commit -m "feat: persist HBM draft dashboard metadata"
```

## Task 3: Add Frontend Types And A Dedicated HBM Draft Dashboard Component

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/components/research/HBMDraftDashboard.tsx`
- Test: `frontend/tests/hbm-draft-dashboard.test.mjs`

**Interfaces:**
- Consumes:
  - `OverviewWorkbench`
  - optional `draft_theme_schema`
- Produces:
  - `HBMDraftDashboardData`
  - `HBMDraftTab`
  - `HBMDraftDashboard` React component:
    - `({ data }: { data: HBMDraftDashboardData }) => JSX.Element`

- [ ] **Step 1: Write the failing frontend tests**

```javascript
import { render, screen, fireEvent } from "@testing-library/react";
import { HBMDraftDashboard } from "../src/components/research/HBMDraftDashboard";

const data = {
  kind: "hbm_draft_dashboard",
  tabs: [
    { key: "overview", title: "总览", headline: "HBM 仍处高景气主线", summary: ["供给偏紧"], metrics: [], panels: [], empty_state: "" },
    { key: "generation", title: "技术代际", headline: "", summary: ["HBM3E 迭代"], metrics: [], panels: [], empty_state: "" },
    { key: "cost_bottleneck", title: "成本与卡口", headline: "", summary: ["先进封装卡口"], metrics: [], panels: [], empty_state: "" },
    { key: "leaders", title: "产业龙头", headline: "", summary: ["龙头集中"], metrics: [], panels: [], empty_state: "" },
    { key: "cycle_meter", title: "周期温度计", headline: "", summary: ["温度高位"], metrics: [], panels: [], empty_state: "" },
  ],
};

test("renders five fixed HBM tabs and switches content", () => {
  render(<HBMDraftDashboard data={data} />);
  expect(screen.getByRole("tab", { name: "总览" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "技术代际" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "技术代际" }));
  expect(screen.getByText("HBM3E 迭代")).toBeInTheDocument();
});

test("renders empty state when a tab lacks content", () => {
  render(<HBMDraftDashboard data={{ ...data, tabs: [{ ...data.tabs[0], summary: [], empty_state: "资料不足" }, ...data.tabs.slice(1)] }} />);
  expect(screen.getByText("资料不足")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs`

Expected: FAIL because the component and types do not exist yet.

- [ ] **Step 3: Write the minimal frontend types and component**

```ts
export interface HBMDraftTab {
  key: "overview" | "generation" | "cost_bottleneck" | "leaders" | "cycle_meter";
  title: string;
  headline?: string;
  summary: string[];
  metrics: Array<{ label: string; value: string; tone?: string }>;
  panels: Array<{ title: string; items: string[]; tone?: string }>;
  empty_state?: string;
}

export interface HBMDraftDashboardData {
  kind: "hbm_draft_dashboard";
  tabs: HBMDraftTab[];
  generated_at?: string;
}
```

```tsx
export function HBMDraftDashboard({ data }: { data: HBMDraftDashboardData }) {
  const [activeKey, setActiveKey] = useState(data.tabs[0]?.key ?? "overview");
  const activeTab = data.tabs.find((tab) => tab.key === activeKey) ?? data.tabs[0];
  return (
    <section className="rounded-2xl border border-border/40 bg-slate-950 p-4 text-slate-100">
      <div role="tablist" className="flex flex-wrap gap-2">
        {data.tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={tab.key === activeTab.key}
            onClick={() => setActiveKey(tab.key)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {activeTab.headline ? <h3>{activeTab.headline}</h3> : null}
        {activeTab.summary.length ? activeTab.summary.map((item) => <p key={item}>{item}</p>) : <p>{activeTab.empty_state || "资料不足"}</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the frontend tests to verify they pass**

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/research/HBMDraftDashboard.tsx frontend/tests/hbm-draft-dashboard.test.mjs
git commit -m "feat: add HBM draft dashboard component"
```

## Task 4: Wire The HBM Dashboard Into Framework Draft Rendering With Safe Fallback

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`
- Modify: `frontend/tests/hbm-draft-dashboard.test.mjs`

**Interfaces:**
- Consumes:
  - `selectedSector`
  - `sectorWorkbench?.draft_theme_schema`
  - `HBMDraftDashboard`
- Produces:
  - guarded HBM-only render branch in the sector draft area

- [ ] **Step 1: Extend the failing frontend tests to cover the Framework branch**

```javascript
test("Framework uses HBM dashboard only for HBM sector draft", () => {
  const workbench = {
    draft: { summary: "HBM 初稿" },
    draft_theme_schema: data,
    draft_structured_blocks: [],
  };
  const view = renderFrameworkDraft({ selectedSector: "HBM", sectorWorkbench: workbench });
  expect(view.getByRole("tab", { name: "总览" })).toBeInTheDocument();
});

test("Framework falls back to generic draft shell for non-HBM sector", () => {
  const workbench = {
    draft: { summary: "光互联 初稿" },
    draft_theme_schema: data,
    draft_structured_blocks: [],
  };
  const view = renderFrameworkDraft({ selectedSector: "光互联", sectorWorkbench: workbench });
  expect(view.queryByRole("tab", { name: "总览" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs`

Expected: FAIL because the Framework draft area does not yet branch to the HBM dashboard.

- [ ] **Step 3: Write the minimal Framework integration**

```tsx
const sectorDraftThemeSchema =
  selectedSector === "HBM" && sectorWorkbench?.draft_theme_schema?.kind === "hbm_draft_dashboard"
    ? sectorWorkbench.draft_theme_schema
    : null;
```

```tsx
{sectorOverviewTab === "draft" && (
  <>
    {renderOverviewHintBar(...)}
    {sectorDraftThemeSchema ? (
      <HBMDraftDashboard data={sectorDraftThemeSchema} />
    ) : (sectorWorkbench?.draft_structured_blocks || []).length > 0 ? (
      renderStructuredOverviewShell(...)
    ) : (
      renderOverviewPreviewShell(...)
    )}
    {renderOverviewSourcePanel("sector")}
  </>
)}
```

- [ ] **Step 4: Run the frontend tests to verify they pass**

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Framework.tsx frontend/tests/hbm-draft-dashboard.test.mjs
git commit -m "feat: wire HBM dashboard into draft overview"
```

## Task 5: Enrich The HBM Dashboard Layout Without Expanding Scope

**Files:**
- Modify: `backend/research_hub.py`
- Modify: `frontend/src/components/research/HBMDraftDashboard.tsx`
- Modify: `frontend/tests/hbm-draft-dashboard.test.mjs`
- Test: `backend/tests/test_hbm_draft_dashboard.py`

**Interfaces:**
- Consumes:
  - `HBMDraftDashboardData`
  - per-tab arrays: `metrics`, `panels`
- Produces:
  - richer tab payloads for overview cards, generation comparisons, bottleneck cards, leader panels, and cycle signals

- [ ] **Step 1: Extend failing tests for richer per-tab structures**

```python
def test_build_hbm_draft_dashboard_populates_tab_specific_panels():
    sources = [{"label": "研报/1", "text": "HBM3E、12hi、先进封装、海力士、价格、库存、扩产。"}]
    result = build_hbm_draft_dashboard("HBM", sources)
    tabs = {tab["key"]: tab for tab in result["tabs"]}
    assert isinstance(tabs["overview"]["metrics"], list)
    assert isinstance(tabs["generation"]["panels"], list)
    assert isinstance(tabs["cycle_meter"]["panels"], list)
```

```javascript
test("HBM dashboard renders panel groups and metrics", () => {
  render(<HBMDraftDashboard data={richData} />);
  expect(screen.getByText("供给偏紧")).toBeInTheDocument();
  expect(screen.getByText("12hi")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs`

Expected: FAIL because the current payload/component does not yet express richer tab-specific structures.

- [ ] **Step 3: Implement minimal tab-specific visual structures**

```python
tab["metrics"] = [{"label": "景气", "value": "高位"}, {"label": "供给", "value": "偏紧"}]
tab["panels"] = [{"title": "关键信号", "items": ["HBM3E 迭代", "12hi/16hi 演进"]}]
```

```tsx
{activeTab.metrics.length ? (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {activeTab.metrics.map((metric) => (
      <article key={`${metric.label}-${metric.value}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-xs text-slate-400">{metric.label}</p>
        <p className="mt-1 text-lg font-semibold">{metric.value}</p>
      </article>
    ))}
  </div>
) : null}
```

```tsx
{activeTab.panels.map((panel) => (
  <section key={panel.title} className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
    <h4 className="text-sm font-medium">{panel.title}</h4>
    <ul className="mt-2 space-y-2">
      {panel.items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  </section>
))}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py -q`

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/research_hub.py backend/tests/test_hbm_draft_dashboard.py frontend/src/components/research/HBMDraftDashboard.tsx frontend/tests/hbm-draft-dashboard.test.mjs
git commit -m "feat: enrich HBM dashboard panels"
```

## Task 6: Run Focused Regression Verification

**Files:**
- Modify: none unless regressions are found
- Test: `backend/tests/test_hbm_draft_dashboard.py`
- Test: `frontend/tests/hbm-draft-dashboard.test.mjs`

**Interfaces:**
- Consumes: all prior tasks
- Produces: verified HBM-only draft dashboard behavior and confirmed fallback path

- [ ] **Step 1: Run focused backend tests**

Run: `backend/.venv/bin/pytest backend/tests/test_hbm_draft_dashboard.py backend/tests/test_overview_report_import.py -q`

Expected: PASS

- [ ] **Step 2: Run focused frontend tests**

Run: `cd frontend && npm test -- hbm-draft-dashboard.test.mjs intel-refresh.test.mjs`

Expected: PASS

- [ ] **Step 3: Run repo checks that cover changed surfaces**

Run: `./scripts/check-backend.sh`

Expected: PASS

Run: `./scripts/check-frontend-build.sh`

Expected: PASS

- [ ] **Step 4: Manual verification in the app**

Run:

```bash
./scripts/dev.sh
```

Expected:

- `HBM -> 行业概览 -> 初稿` shows the five-tab dashboard
- `HBM -> 行业概览 -> 深度` is unchanged
- `光互联 -> 行业概览 -> 初稿` still uses the old generic path
- If HBM theme schema is missing, the old draft preview still renders

- [ ] **Step 5: Commit any regression fix if needed**

```bash
git add backend frontend
git commit -m "fix: address HBM dashboard regressions"
```

## Self-Review

- Spec coverage:
  - HBM-only scope is handled in Tasks 1, 2, and 4.
  - Five fixed tabs are defined and tested in Tasks 1 and 3.
  - Dedicated renderer is implemented in Tasks 3 and 4.
  - Safe fallback and non-HBM isolation are covered in Tasks 2, 4, and 6.
  - Deep content non-interference is verified in Task 6.
- Placeholder scan:
  - No `TODO`, `TBD`, or undefined “appropriate handling” placeholders remain.
- Type consistency:
  - `HBMDraftDashboardData` and `HBMDraftTab` names are used consistently across backend metadata, frontend types, and renderer integration.

