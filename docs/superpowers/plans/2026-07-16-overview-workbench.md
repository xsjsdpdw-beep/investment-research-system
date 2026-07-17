# Overview Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new `初稿 / 深度 / 待吸收 / 生成报告` workbench for both sector and stock overviews, with candidate absorption, diff-before-apply behavior, and version history scaffolding.

**Architecture:** Keep the existing incremental Vibe-Research derivative intact and extend the current overview pipeline instead of introducing a new subsystem. Reuse the existing local-file knowledge store in `backend/knowledge.py`, add new overview-specific storage/index helpers there, expose minimal API routes in `backend/app.py`, and refactor the overview area inside `frontend/src/pages/Framework.tsx` into a four-tab workbench backed by the new APIs.

**Tech Stack:** FastAPI, Python local JSON/Markdown storage, React, TypeScript, Vite, existing localStorage helpers, existing knowledge entry model.

## Global Constraints

- Preserve the current app structure and implement this as an incremental change to the existing system.
- `初稿` can refresh continuously but must never overwrite `深度` automatically.
- `深度` must remain card-based, editable, and become the default source for report generation.
- `待吸收` must group candidates by source: `研报 / 附件 / 纪要 / 专家会`.
- When a candidate matches an existing deep card, the default flow must be `对比后再决定`.
- Absorbing a candidate must produce a version-history record containing before/after snapshots.
- `附件链接` remains the manual library; automatically extracted sources must stay in the overview source interface instead.
- Build both sector and stock overview workbenches on the same underlying model and API patterns.

---

## File Map

- Modify: `backend/knowledge.py`
  - Add overview draft/deep/candidate/version storage helpers under the existing local-file root.
  - Add CRUD-style read/update helpers for overview workbench state.
- Modify: `backend/app.py`
  - Add API routes for reading workbench state, adding candidates, diff previews, applying candidates, and reading version history.
- Modify: `frontend/src/lib/api.ts`
  - Add TypeScript interfaces for overview draft/deep cards/candidates/versions and new API client methods.
- Modify: `frontend/src/pages/Framework.tsx`
  - Replace the current single overview view for sector/stock with four top tabs.
  - Add deep-card editor scaffolding, candidate-by-source lists, compare modal/panel, and report-source selector UI.
- Test/Verify: `./scripts/check-frontend-build.sh`
- Test/Verify: targeted backend import check with `python -m py_compile backend/*.py`

### Task 1: Define the overview workbench data model in the backend

**Files:**
- Modify: `backend/knowledge.py`

**Interfaces:**
- Consumes: existing `DATA_ROOT`, `_read_json`, `_atomic_json`, `_now_iso`, `list_entries`
- Produces:
  - `get_overview_workbench(scope_type: str, scope_id: str) -> dict[str, Any]`
  - `save_overview_draft(scope_type: str, scope_id: str, payload: dict[str, Any]) -> dict[str, Any]`
  - `save_overview_deep_cards(scope_type: str, scope_id: str, cards: list[dict[str, Any]]) -> list[dict[str, Any]]`
  - `append_overview_candidates(scope_type: str, scope_id: str, source_type: str, candidates: list[dict[str, Any]]) -> dict[str, Any]`
  - `apply_overview_candidate(scope_type: str, scope_id: str, candidate_id: str, action: str, payload: dict[str, Any]) -> dict[str, Any]`
  - `list_overview_versions(scope_type: str, scope_id: str, card_id: str | None = None) -> list[dict[str, Any]]`

- [ ] **Step 1: Add failing backend smoke assertions in a temporary script snippet**

```bash
python - <<'PY'
import backend.knowledge as k

assert hasattr(k, "get_overview_workbench"), "missing get_overview_workbench"
assert hasattr(k, "save_overview_draft"), "missing save_overview_draft"
assert hasattr(k, "save_overview_deep_cards"), "missing save_overview_deep_cards"
assert hasattr(k, "append_overview_candidates"), "missing append_overview_candidates"
assert hasattr(k, "apply_overview_candidate"), "missing apply_overview_candidate"
assert hasattr(k, "list_overview_versions"), "missing list_overview_versions"
PY
```

- [ ] **Step 2: Run the smoke assertions to confirm they fail**

Run:

```bash
python - <<'PY'
import backend.knowledge as k

assert hasattr(k, "get_overview_workbench"), "missing get_overview_workbench"
assert hasattr(k, "save_overview_draft"), "missing save_overview_draft"
assert hasattr(k, "save_overview_deep_cards"), "missing save_overview_deep_cards"
assert hasattr(k, "append_overview_candidates"), "missing append_overview_candidates"
assert hasattr(k, "apply_overview_candidate"), "missing apply_overview_candidate"
assert hasattr(k, "list_overview_versions"), "missing list_overview_versions"
PY
```

Expected: FAIL with one of the `missing ...` assertions.

- [ ] **Step 3: Implement minimal overview workbench storage helpers**

```python
OVERVIEW_WORKBENCH_FILE = DIRS["indexes"] / "overview_workbench.json"


def _default_overview_workbench() -> dict[str, Any]:
    return {"items": [], "updated_at": _now_iso()}


def _load_overview_workbench() -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(OVERVIEW_WORKBENCH_FILE, _default_overview_workbench())
    data.setdefault("items", [])
    data.setdefault("updated_at", _now_iso())
    return data


def _save_overview_workbench(items: list[dict[str, Any]]) -> None:
    _atomic_json(OVERVIEW_WORKBENCH_FILE, {"items": items, "updated_at": _now_iso()})
```

Then add a per-scope record shape containing:

```python
{
    "scope_type": "sector",
    "scope_id": "HBM存储",
    "draft": {"modules": [], "summary": "", "sources": [], "updated_at": "..."},
    "deep_cards": [],
    "candidates": [],
    "versions": [],
    "updated_at": "..."
}
```

Implement the six produced functions using that structure. Keep candidate status limited to `pending`, `accepted`, `ignored`, `later`. Keep source type limited to `report`, `attachment`, `note`, `expert_call`.

- [ ] **Step 4: Run a backend import and round-trip check**

Run:

```bash
python - <<'PY'
from backend.knowledge import (
    get_overview_workbench,
    save_overview_draft,
    save_overview_deep_cards,
    append_overview_candidates,
    list_overview_versions,
)

save_overview_draft("sector", "HBM存储", {"summary": "draft ok", "modules": [], "sources": []})
save_overview_deep_cards("sector", "HBM存储", [{"id": "market-size", "title": "市场规模", "body": "初始正文"}])
append_overview_candidates("sector", "HBM存储", "report", [{"id": "c1", "title": "新增研报观点", "matched_card_id": "market-size"}])
data = get_overview_workbench("sector", "HBM存储")
assert data["draft"]["summary"] == "draft ok"
assert len(data["deep_cards"]) == 1
assert len(data["candidates"]) == 1
assert list_overview_versions("sector", "HBM存储") == []
print("overview workbench roundtrip ok")
PY
```

Expected: PASS and print `overview workbench roundtrip ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/knowledge.py
git commit -m "feat: add overview workbench storage model"
```

### Task 2: Expose overview workbench APIs in FastAPI

**Files:**
- Modify: `backend/app.py`

**Interfaces:**
- Consumes:
  - `get_overview_workbench(scope_type, scope_id)`
  - `save_overview_draft(scope_type, scope_id, payload)`
  - `save_overview_deep_cards(scope_type, scope_id, cards)`
  - `append_overview_candidates(scope_type, scope_id, source_type, candidates)`
  - `apply_overview_candidate(scope_type, scope_id, candidate_id, action, payload)`
  - `list_overview_versions(scope_type, scope_id, card_id=None)`
- Produces:
  - `GET /api/research/overview-workbench`
  - `POST /api/research/overview-workbench/draft`
  - `POST /api/research/overview-workbench/deep-cards`
  - `POST /api/research/overview-workbench/candidates`
  - `POST /api/research/overview-workbench/candidates/apply`
  - `GET /api/research/overview-workbench/versions`

- [ ] **Step 1: Write a failing route smoke check**

```bash
python - <<'PY'
from backend.app import app

paths = {route.path for route in app.routes}
assert "/api/research/overview-workbench" in paths
assert "/api/research/overview-workbench/draft" in paths
assert "/api/research/overview-workbench/deep-cards" in paths
assert "/api/research/overview-workbench/candidates" in paths
assert "/api/research/overview-workbench/candidates/apply" in paths
assert "/api/research/overview-workbench/versions" in paths
PY
```

- [ ] **Step 2: Run the smoke check to confirm it fails**

Run the same command as Step 1.

Expected: FAIL because the routes are missing.

- [ ] **Step 3: Add request/response models and route handlers**

Use explicit pydantic inputs such as:

```python
class OverviewWorkbenchQuery(BaseModel):
    scope_type: Literal["sector", "stock"]
    scope_id: str


class OverviewDraftIn(OverviewWorkbenchQuery):
    draft: dict[str, Any]


class OverviewDeepCardsIn(OverviewWorkbenchQuery):
    cards: list[dict[str, Any]]


class OverviewCandidatesIn(OverviewWorkbenchQuery):
    source_type: Literal["report", "attachment", "note", "expert_call"]
    candidates: list[dict[str, Any]]


class OverviewCandidateApplyIn(OverviewWorkbenchQuery):
    candidate_id: str
    action: Literal["replace", "append", "partial", "ignore"]
    payload: dict[str, Any] = {}
```

Each route should wrap the returned data in `{"data": ...}` to match existing API conventions.

- [ ] **Step 4: Verify the routes load**

Run:

```bash
python - <<'PY'
from backend.app import app

paths = {route.path for route in app.routes}
for path in [
    "/api/research/overview-workbench",
    "/api/research/overview-workbench/draft",
    "/api/research/overview-workbench/deep-cards",
    "/api/research/overview-workbench/candidates",
    "/api/research/overview-workbench/candidates/apply",
    "/api/research/overview-workbench/versions",
]:
    assert path in paths, path
print("overview workbench routes ok")
PY
```

Expected: PASS and print `overview workbench routes ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app.py
git commit -m "feat: add overview workbench api routes"
```

### Task 3: Add frontend API types and client methods

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: the six new `/api/research/overview-workbench*` routes
- Produces:
  - `type OverviewWorkbench`
  - `type OverviewDeepCard`
  - `type OverviewCandidate`
  - `type OverviewVersion`
  - `api.overviewWorkbench(scopeType: "sector" | "stock", scopeId: string)`
  - `api.saveOverviewDraft(...)`
  - `api.saveOverviewDeepCards(...)`
  - `api.appendOverviewCandidates(...)`
  - `api.applyOverviewCandidate(...)`
  - `api.overviewVersions(...)`

- [ ] **Step 1: Write a failing TypeScript compile probe**

Add temporary usage inside `Framework.tsx`:

```ts
void api.overviewWorkbench("sector", "HBM存储");
```

This should fail until the method exists.

- [ ] **Step 2: Run the frontend build to confirm it fails**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: FAIL with a TypeScript error that `overviewWorkbench` does not exist on `api`.

- [ ] **Step 3: Implement the types and API methods**

Add types shaped like:

```ts
export interface OverviewDeepCard {
  id: string;
  title: string;
  body: string;
  chart_blocks?: { type: string; title?: string; spec?: Record<string, unknown> }[];
  updated_at?: string;
}

export interface OverviewCandidate {
  id: string;
  source_type: "report" | "attachment" | "note" | "expert_call";
  title: string;
  summary?: string;
  matched_card_id?: string;
  status?: "pending" | "accepted" | "ignored" | "later";
  created_at?: string;
}

export interface OverviewVersion {
  version_id: string;
  card_id: string;
  action_type: string;
  source_type: string;
  source_title: string;
  change_summary?: string;
  created_at: string;
}

export interface OverviewWorkbench {
  scope_type: "sector" | "stock";
  scope_id: string;
  draft: { summary?: string; modules: KnowledgeEntry[]; sources: OverviewSourceInterface[]; updated_at?: string };
  deep_cards: OverviewDeepCard[];
  candidates: OverviewCandidate[];
  versions: OverviewVersion[];
  updated_at?: string;
}
```

- [ ] **Step 4: Run the frontend build again**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: PASS for the new API surface, or fail only on the next unfinished UI task.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add overview workbench frontend api"
```

### Task 4: Replace the current sector overview page with four top tabs

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes:
  - `api.overviewWorkbench("sector", selectedSector)`
  - `api.saveOverviewDraft(...)`
  - existing `api.buildSectorOverview(selectedSector)`
  - existing sector attachment and overview source state
- Produces:
  - sector overview tabs `draft | deep | candidates | report`
  - sector-specific workbench state loader
  - sector report source selector

- [ ] **Step 1: Write a failing UI assertion by rendering the new tab labels**

Add the tab buttons first, but wire them to placeholder panels:

```tsx
{["初稿", "深度", "待吸收", "生成报告"].map((label) => (
  <button key={label}>{label}</button>
))}
```

- [ ] **Step 2: Run the frontend build to verify the file still compiles with placeholders**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: PASS. This confirms the tab labels can be introduced before full logic.

- [ ] **Step 3: Implement the sector workbench view**

Within the current sector overview branch:

```tsx
const [sectorOverviewTab, setSectorOverviewTab] = useState<"draft" | "deep" | "candidates" | "report">("draft");
const [sectorWorkbench, setSectorWorkbench] = useState<OverviewWorkbench | null>(null);
```

Use a loader:

```tsx
const loadSectorWorkbench = async (sector: string) => {
  const data = await api.overviewWorkbench("sector", sector);
  setSectorWorkbench(data);
};
```

Map existing `buildSectorOverview()` success into:
- saving `draft.summary`
- saving draft modules/sources
- not mutating deep cards

Use four render branches:
- `draft`: existing overview summary/module content migrated here
- `deep`: card list placeholder and edit buttons
- `candidates`: grouped empty states for `研报 / 附件 / 纪要 / 专家会`
- `report`: existing report generation block plus new source selector

- [ ] **Step 4: Verify the sector page compiles**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: PASS and the sector overview screen now shows the four top tabs.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Framework.tsx
git commit -m "feat: add sector overview workbench tabs"
```

### Task 5: Replace the current stock overview page with the same four-tab workbench

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes:
  - `api.overviewWorkbench("stock", selectedTicker)`
  - `api.saveOverviewDraft(...)`
  - existing `api.buildStockOverview(selectedTicker)`
  - existing stock attachment and overview source state
- Produces:
  - stock overview tabs `draft | deep | candidates | report`
  - stock-specific workbench state loader
  - stock report source selector

- [ ] **Step 1: Write the failing stock-side UI expectation by mirroring the new tab state**

Add:

```tsx
const [stockOverviewTab, setStockOverviewTab] = useState<"draft" | "deep" | "candidates" | "report">("draft");
```

Use it in the stock overview branch before wiring real content.

- [ ] **Step 2: Run the frontend build to catch missing references**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: FAIL if any stock overview branch still assumes the old single-view structure.

- [ ] **Step 3: Implement the stock-side workbench rendering**

Mirror the sector implementation, but map:
- `buildStockOverview()` into stock draft state
- stock-specific manual attachments into candidate source generators later
- stock report tab into the existing `生成个股报告` action area

Keep the same top tabs and source selector choices:
- `仅深度`
- `深度 + 待吸收`
- `初稿 + 深度`

- [ ] **Step 4: Re-run the frontend build**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: PASS with both sector and stock overview pages compiling under the shared workbench structure.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Framework.tsx
git commit -m "feat: add stock overview workbench tabs"
```

### Task 6: Add deep-card editing scaffolding and candidate grouping UI

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`

**Interfaces:**
- Consumes:
  - `OverviewDeepCard[]`
  - `OverviewCandidate[]`
  - `api.saveOverviewDeepCards(...)`
- Produces:
  - editable deep-card list for sector/stock
  - candidate groups by source
  - candidate action buttons `对比后决定 / 忽略 / 稍后处理`

- [ ] **Step 1: Write a minimal failing interaction path**

Insert an event handler call that does not exist yet:

```tsx
<button onClick={() => openCandidateCompare("c1")}>对比后决定</button>
```

- [ ] **Step 2: Run the frontend build to confirm the missing handler failure**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: FAIL with `openCandidateCompare` not defined.

- [ ] **Step 3: Implement the minimal handlers and grouped rendering**

Add:

```tsx
const groupCandidatesBySource = (items: OverviewCandidate[]) => ({
  report: items.filter((item) => item.source_type === "report"),
  attachment: items.filter((item) => item.source_type === "attachment"),
  note: items.filter((item) => item.source_type === "note"),
  expert_call: items.filter((item) => item.source_type === "expert_call"),
});
```

Add editable deep-card state:

```tsx
const [editingDeepCardId, setEditingDeepCardId] = useState("");
const [deepCardDrafts, setDeepCardDrafts] = useState<Record<string, { title: string; body: string }>>({});
```

Persist deep-card edits with `api.saveOverviewDeepCards(...)`.

- [ ] **Step 4: Re-run the frontend build**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: PASS with grouped candidate sections and editable deep cards compiling.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Framework.tsx
git commit -m "feat: add deep cards and candidate groups"
```

### Task 7: Add compare-before-apply and version history scaffolding

**Files:**
- Modify: `backend/knowledge.py`
- Modify: `frontend/src/pages/Framework.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes:
  - `apply_overview_candidate(...)`
  - `list_overview_versions(...)`
  - `api.applyOverviewCandidate(...)`
  - `api.overviewVersions(...)`
- Produces:
  - compare panel/modal with original vs candidate content
  - apply actions `replace | append | partial | ignore`
  - version history drawer/list

- [ ] **Step 1: Add a failing backend behavior probe for version creation**

```bash
python - <<'PY'
from backend.knowledge import save_overview_deep_cards, append_overview_candidates, apply_overview_candidate, list_overview_versions

save_overview_deep_cards("sector", "HBM存储", [{"id": "market-size", "title": "市场规模", "body": "旧版本"}])
append_overview_candidates("sector", "HBM存储", "report", [{"id": "c-apply", "title": "新候选", "matched_card_id": "market-size", "proposed_patch": "新版本"}])
apply_overview_candidate("sector", "HBM存储", "c-apply", "replace", {"card_id": "market-size"})
versions = list_overview_versions("sector", "HBM存储", "market-size")
assert versions, "missing version history"
print("versions ok")
PY
```

- [ ] **Step 2: Run the behavior probe to confirm it fails before implementation**

Run the same command as Step 1.

Expected: FAIL because apply/version logic is not complete yet.

- [ ] **Step 3: Implement minimal apply/version behavior**

Backend behavior:
- `replace`: overwrite `body`, record `before_snapshot` and `after_snapshot`
- `append`: append candidate text below existing body, record both snapshots
- `partial`: store a placeholder merged result from `payload["merged_body"]`
- `ignore`: set candidate status to `ignored` without version creation

Frontend behavior:
- add compare state:

```tsx
const [compareCandidate, setCompareCandidate] = useState<OverviewCandidate | null>(null);
```

- render a compare drawer/modal with:
  - left: current deep card body
  - right: candidate summary or patch
  - bottom actions for `替换原文 / 追加补充 / 仅更新局部 / 忽略`

- [ ] **Step 4: Verify backend and frontend**

Run:

```bash
python - <<'PY'
from backend.knowledge import list_overview_versions
assert list_overview_versions("sector", "HBM存储", "market-size")
print("version history exists")
PY
./scripts/check-frontend-build.sh
```

Expected: backend probe prints `version history exists`; frontend build passes.

- [ ] **Step 5: Commit**

```bash
git add backend/knowledge.py frontend/src/lib/api.ts frontend/src/pages/Framework.tsx
git commit -m "feat: add overview compare and version history"
```

### Task 8: Connect attachments and notes into the candidate intake path

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`
- Modify: `backend/knowledge.py`
- Modify: `backend/app.py`

**Interfaces:**
- Consumes:
  - sector/stock attachment create/update flows
  - sector/stock note/comment create flows already present in `Framework.tsx`
  - `append_overview_candidates(...)`
- Produces:
  - attachment uploads/links can enqueue candidate items
  - note/comment saves can enqueue candidate items
  - pending candidates appear under the correct source group

- [ ] **Step 1: Write a failing backend intake probe**

```bash
python - <<'PY'
from backend.knowledge import append_overview_candidates, get_overview_workbench

append_overview_candidates("stock", "600031.SH", "attachment", [{"id": "attach-1", "title": "附件候选"}])
data = get_overview_workbench("stock", "600031.SH")
assert any(item["id"] == "attach-1" and item["source_type"] == "attachment" for item in data["candidates"])
print("attachment candidate ok")
PY
```

- [ ] **Step 2: Run the probe and confirm any missing glue**

Run the same command as Step 1.

Expected: FAIL if candidate storage still rejects or drops attachment intake.

- [ ] **Step 3: Wire attachment/note creation into candidate intake**

Frontend rule:
- after saving a manual attachment in sector center, offer or auto-enqueue a candidate into source `attachment`
- after saving a research note or tracking comment, enqueue into source `note`

Backend rule:
- accept candidate items with lightweight payload:

```python
{
    "id": "<entry-id>-candidate",
    "title": entry["title"],
    "summary": entry["content"][:240],
    "matched_card_id": "",
    "source_entry_id": entry["id"],
}
```

- [ ] **Step 4: Verify the intake path**

Run:

```bash
python - <<'PY'
from backend.knowledge import get_overview_workbench
data = get_overview_workbench("stock", "600031.SH")
assert any(item["source_type"] == "attachment" for item in data["candidates"])
print("candidate intake wired")
PY
./scripts/check-frontend-build.sh
```

Expected: backend probe prints `candidate intake wired`; frontend build passes.

- [ ] **Step 5: Commit**

```bash
git add backend/knowledge.py backend/app.py frontend/src/pages/Framework.tsx
git commit -m "feat: route attachments and notes into overview candidates"
```

### Task 9: Final verification and cleanup

**Files:**
- Modify: `frontend/src/pages/Framework.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `backend/app.py`
- Modify: `backend/knowledge.py`

**Interfaces:**
- Consumes: all previous task outputs
- Produces: cleaned implementation with no dead placeholders and verified build

- [ ] **Step 1: Search for placeholder or stale overview UI fragments**

Run:

```bash
rg -n "openCandidateCompare\\(|TODO|TBD|placeholder|初稿卡片列表|版本记录抽屉" frontend/src/pages/Framework.tsx backend/knowledge.py backend/app.py frontend/src/lib/api.ts
```

Expected: no accidental TODO/TBD placeholders remain.

- [ ] **Step 2: Run backend syntax verification**

Run:

```bash
python -m py_compile backend/app.py backend/knowledge.py backend/data_adapters.py
```

Expected: PASS with no output.

- [ ] **Step 3: Run frontend build verification**

Run:

```bash
./scripts/check-frontend-build.sh
```

Expected: PASS.

- [ ] **Step 4: Manually spot-check the two workbench pages**

Run:

```bash
./scripts/status-frontend.sh
```

Expected: frontend dev server is up. Then open:
- `http://127.0.0.1:5899/framework?sub=sectors`
- `http://127.0.0.1:5899/framework?sub=stocks`

Manually verify:
- both overviews show 4 top tabs
- draft does not overwrite deep
- candidates are grouped by source
- compare UI opens before apply
- versions are visible after apply

- [ ] **Step 5: Commit**

```bash
git add backend/app.py backend/knowledge.py frontend/src/lib/api.ts frontend/src/pages/Framework.tsx
git commit -m "feat: complete overview workbench flow"
```

## Self-Review

### Spec coverage

- `初稿 / 深度 / 待吸收 / 生成报告` four-tab structure: covered in Tasks 4 and 5.
- Shared sector/stock model: covered in Tasks 1, 2, 3, 4, and 5.
- Candidate grouping by `研报 / 附件 / 纪要 / 专家会`: covered in Tasks 1 and 6.
- Compare-before-apply: covered in Task 7.
- Version history: covered in Tasks 1 and 7.
- Attachment/note intake into `待吸收`: covered in Task 8.
- Default report source behavior: covered in Tasks 4 and 5.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” text remains in task instructions.
- Every code-changing task includes explicit names, commands, and expected outputs.

### Type consistency

- Scope types remain `sector | stock` throughout.
- Candidate source types remain `report | attachment | note | expert_call` throughout.
- Candidate actions remain `replace | append | partial | ignore` throughout.
- The frontend and backend both use the same `OverviewWorkbench / deep_cards / candidates / versions` naming family.
