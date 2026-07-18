# 投研资讯事件概率骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `投研资讯` 中新增与 `基本面`、`流动性` 并列的 `事件概率` 一级看板，并先接好前后端骨架、占位内容和测试，不接真实概率数据源。

**Architecture:** 继续复用现有 `research_hub -> api.ts -> Intel.tsx` 的页面数据链路，在后端新增 `event_probability` 节点，在前端新增 `event-probability` 一级 tab 与独立二级视图。页面内容采用本地静态占位结构，明确标识为“骨架入口”，保证后续接真实事件概率体系时不需要再改导航、key 和数据协议。

**Tech Stack:** FastAPI backend, React 19 + TypeScript frontend, existing `SectionTabs` drag-sort UI, pytest, repository string-based acceptance tests.

## Global Constraints

- 不接入真实的事件概率数据源。
- 不实现概率计算、赔率换算、情景打分或胜率模型。
- 不引入新的外部依赖或新的数据库。
- 不修改现有 `基本面` 和 `流动性` 的内容逻辑。
- 不把“事件概率”伪装成已经生产可用的数据模块。
- 前端一级 key 使用 `event-probability`，后端数据节点使用 `event_probability`。
- `事件概率` 二级视图固定为 `总览`、`重点事件`、`数据接口`。
- `事件概率` 的二级视图排序持久化 key 使用 `intel-event-probability-view-order`。

---

## File Structure

- Modify: `backend/research_hub.py`
  - 给 `get_research_hub()` 增加 `event_probability` 同级节点，返回静态骨架数据。
- Modify: `frontend/src/lib/api.ts`
  - 为 `ResearchHubData` 增加 `event_probability` 类型声明，避免 `any`。
- Modify: `frontend/src/lib/workspace.ts`
  - 给 `投研资讯` 子导航与 `INTEL_TABS` 增加 `事件概率`。
- Modify: `frontend/src/pages/Intel.tsx`
  - 增加 `事件概率` 一级页和其二级视图、独立状态、独立排序 key。
- Modify: `backend/tests/test_workspace_api.py`
  - 校验 `/api/research/hub` 已返回 `event_probability` 骨架。
- Modify: `tests/test_branding_acceptance.py`
  - 校验导航、tab 和新的排序 key 已出现。

### Task 1: Add the backend event-probability contract

**Files:**
- Modify: `backend/research_hub.py`
- Test: `backend/tests/test_workspace_api.py`

**Interfaces:**
- Consumes: existing `get_research_hub() -> dict`
- Produces:
  - `get_research_hub()["event_probability"] -> dict`
  - `event_probability["summary"] -> {"title": str, "description": str, "updated_at": str}`
  - `event_probability["planned_modules"] -> list[{"key": str, "label": str, "description": str, "status": str}]`
  - `event_probability["priority_events"] -> list[{"key": str, "title": str, "category": str, "status": str, "note": str}]`
  - `event_probability["source_interfaces"] -> list[{"key": str, "label": str, "provider": str, "status": str, "note": str}]`

- [ ] **Step 1: Write the failing test**

```python
def test_research_hub_exposes_event_probability_scaffold(workspace_client: TestClient):
    hub = workspace_client.get("/api/research/hub")
    assert hub.status_code == 200

    data = hub.json()["data"]
    assert "event_probability" in data
    assert data["event_probability"]["summary"]["title"] == "事件概率体系入口"
    assert data["event_probability"]["planned_modules"][0]["key"] == "macro-probability"
    assert data["event_probability"]["priority_events"][0]["category"] == "宏观窗口"
    assert data["event_probability"]["source_interfaces"][0]["status"] == "scaffold"
```

在 `backend/tests/test_workspace_api.py` 现有 `test_research_hub_and_macro_overview_seed_data` 后新增这个测试，保持使用同一个 `workspace_client` fixture。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/leo/Documents/投研体系/backend && python3 -m pytest tests/test_workspace_api.py::test_research_hub_exposes_event_probability_scaffold -v`

Expected: FAIL with an assertion like `"event_probability" not in data`.

- [ ] **Step 3: Write minimal implementation**

在 `backend/research_hub.py` 的 `get_research_hub()` 返回字典中新增 `event_probability`。直接内联最小静态骨架，先不要抽新 helper。

```python
        "event_probability": {
            "summary": {
                "title": "事件概率体系入口",
                "description": "当前先接结构化骨架，后续承接真实事件概率源、自建情景判断与重点催化跟踪。",
                "updated_at": datetime.now().isoformat(timespec="seconds"),
            },
            "planned_modules": [
                {
                    "key": "macro-probability",
                    "label": "宏观事件概率",
                    "description": "承接政策窗口、会议节点和跨市场宏观事件的跟踪框架。",
                    "status": "planned",
                },
                {
                    "key": "industry-catalyst",
                    "label": "行业催化事件",
                    "description": "承接关键行业催化、供需拐点和政策催化的观察模板。",
                    "status": "planned",
                },
                {
                    "key": "scenario-dashboard",
                    "label": "情景判断面板",
                    "description": "承接后续自建情景树、主观概率和跟踪结论的可视化入口。",
                    "status": "planned",
                },
            ],
            "priority_events": [
                {
                    "key": "fed-window",
                    "title": "美联储重要议息窗口",
                    "category": "宏观窗口",
                    "status": "watching",
                    "note": "当前仅保留观察位，后续再接真实事件节奏与概率判断。",
                },
                {
                    "key": "china-policy-window",
                    "title": "国内重要政策与发布窗口",
                    "category": "政策窗口",
                    "status": "watching",
                    "note": "用于承接政策会议、发布会和重点制度调整的后续事件库。",
                },
                {
                    "key": "sector-catalyst-template",
                    "title": "行业催化模板观察位",
                    "category": "行业催化",
                    "status": "planned",
                    "note": "用于后续接入重点行业催化、景气验证和供需转折跟踪。",
                },
            ],
            "source_interfaces": [
                {
                    "key": "research-hub-scaffold",
                    "label": "Research Hub 骨架接口",
                    "provider": "local_scaffold",
                    "status": "scaffold",
                    "note": "当前仅返回页面骨架和占位数据，未接真实概率源。",
                },
                {
                    "key": "public-event-calendar",
                    "label": "公开事件日历占位",
                    "provider": "public_calendar_placeholder",
                    "status": "planned",
                    "note": "后续可承接公开宏观日历、会议日历和政策窗口源。",
                },
                {
                    "key": "scenario-probability-model",
                    "label": "自建情景概率模块",
                    "provider": "internal_placeholder",
                    "status": "planned",
                    "note": "后续承接主观情景树、概率标注和复盘留痕。",
                },
            ],
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/leo/Documents/投研体系/backend && python3 -m pytest tests/test_workspace_api.py::test_research_hub_exposes_event_probability_scaffold -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/leo/Documents/投研体系
git add backend/research_hub.py backend/tests/test_workspace_api.py
git commit -m "feat: add event probability research hub scaffold"
```

### Task 2: Add the frontend event-probability shell and typed data path

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/workspace.ts`
- Modify: `frontend/src/pages/Intel.tsx`
- Test: `tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes:
  - `ResearchHubData["event_probability"]`
  - `INTEL_TABS`
  - `SectionTabs` with `draggableStorageKey`
- Produces:
  - `ResearchHubData["event_probability"]` typed frontend contract
  - `INTEL_TABS` entry `{ key: "event-probability", label: "事件概率", description: "..." }`
  - `Intel` page state `const [eventProbabilityView, setEventProbabilityView] = useState("overview")`
  - `EVENT_PROBABILITY_VIEW_TABS`
  - `SectionTabs ... draggableStorageKey="intel-event-probability-view-order"`

- [ ] **Step 1: Write the failing test**

在 `tests/test_branding_acceptance.py` 里现有 `test_vertical_left_nav_supports_drag_sort_and_is_used_by_core_pages` 之后新增一个更聚焦的字符串测试。

```python
def test_intel_event_probability_shell_is_registered():
    workspace = read("frontend/src/lib/workspace.ts")
    intel = read("frontend/src/pages/Intel.tsx")
    api_types = read("frontend/src/lib/api.ts")

    assert '{ key: "event-probability", label: "事件概率" }' in workspace
    assert 'draggableStorageKey="intel-event-probability-view-order"' in intel
    assert 'const EVENT_PROBABILITY_VIEW_TABS = [' in intel
    assert 'event_probability:' in api_types
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/leo/Documents/投研体系 && python3 -m pytest tests/test_branding_acceptance.py::test_intel_event_probability_shell_is_registered -v`

Expected: FAIL because the new workspace tab, API type, or drag-storage key does not exist yet.

- [ ] **Step 3: Write minimal implementation**

1. 在 `frontend/src/lib/workspace.ts` 扩展 `投研资讯` 子项和 `INTEL_TABS`：

```ts
    children: [
      { key: "fundamental", label: "基本面" },
      { key: "liquidity", label: "流动性" },
      { key: "event-probability", label: "事件概率" },
    ],
```

```ts
export const INTEL_TABS: SubtabConfig[] = [
  { key: "fundamental", label: "基本面", description: "宏观、行业、个股、地缘" },
  { key: "liquidity", label: "流动性", description: "复盘、利率、商品" },
  { key: "event-probability", label: "事件概率", description: "事件观察、催化清单、数据接口" },
];
```

2. 在 `frontend/src/lib/api.ts` 为 `ResearchHubData` 新增显式类型：

```ts
export interface EventProbabilitySummary {
  title: string;
  description: string;
  updated_at: string;
}

export interface EventProbabilityModule {
  key: string;
  label: string;
  description: string;
  status: string;
}

export interface EventProbabilityItem {
  key: string;
  title: string;
  category: string;
  status: string;
  note: string;
}

export interface EventProbabilitySource {
  key: string;
  label: string;
  provider: string;
  status: string;
  note: string;
}
```

并把这些字段接到 `ResearchHubData`：

```ts
  event_probability: {
    summary: EventProbabilitySummary;
    planned_modules: EventProbabilityModule[];
    priority_events: EventProbabilityItem[];
    source_interfaces: EventProbabilitySource[];
  };
```

3. 在 `frontend/src/pages/Intel.tsx` 新增视图 tabs、状态和渲染分支：

```ts
const EVENT_PROBABILITY_VIEW_TABS = [
  { key: "overview", label: "总览" },
  { key: "priority-events", label: "重点事件" },
  { key: "sources", label: "数据接口" },
];
```

```ts
  const [eventProbabilityView, setEventProbabilityView] = useState("overview");
  const eventProbability = hub?.event_probability ?? {
    summary: { title: "事件概率体系入口", description: "当前先接结构化骨架。", updated_at: "" },
    planned_modules: [],
    priority_events: [],
    source_interfaces: [],
  };
```

把顶栏 subtitle 从：

```tsx
subtitle="把基本面和流动性拆开管理，既能追踪最新信息，也能保留给 AI 做统一提炼。"
```

改成：

```tsx
subtitle="把基本面、流动性和事件概率拆开管理，既能追踪最新信息，也能给后续 AI 研判留出独立入口。"
```

再把主分支从双分支改成三分支。`event-probability` 分支先渲染一个 `SectionTabs` 和三个占位视图：

```tsx
        ) : active === "liquidity" ? (
          <div className="space-y-4">
            <SectionTabs tabs={LIQUIDITY_VIEW_TABS} active={liquidityView} onChange={setLiquidityView} draggableStorageKey="intel-liquidity-view-order" />
            ...
          </div>
        ) : (
          <div className="space-y-4">
            <SectionTabs
              tabs={EVENT_PROBABILITY_VIEW_TABS}
              active={eventProbabilityView}
              onChange={setEventProbabilityView}
              draggableStorageKey="intel-event-probability-view-order"
            />
            {eventProbabilityView === "overview" && (
              <GlassCard glow>
                <div className="mb-2 flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" /> {eventProbability.summary.title}</div>
                <p className="text-sm text-muted-foreground">{eventProbability.summary.description}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {eventProbability.planned_modules.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-primary">{item.status}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {eventProbabilityView === "priority-events" && (
              <GlassCard>
                <h3 className="mb-3 font-semibold">重点事件</h3>
                <div className="space-y-3">
                  {eventProbability.priority_events.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.title}</p>
                        <span className="text-xs text-primary">{item.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
            {eventProbabilityView === "sources" && (
              <GlassCard>
                <h3 className="mb-3 font-semibold">数据接口</h3>
                <div className="space-y-3">
                  {eventProbability.source_interfaces.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.label}</p>
                        <span className="text-xs text-primary">{item.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.provider}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/leo/Documents/投研体系 && python3 -m pytest tests/test_branding_acceptance.py::test_intel_event_probability_shell_is_registered -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/leo/Documents/投研体系
git add frontend/src/lib/workspace.ts frontend/src/lib/api.ts frontend/src/pages/Intel.tsx tests/test_branding_acceptance.py
git commit -m "feat: add intel event probability shell"
```

### Task 3: Lock the full regression coverage for the new third axis

**Files:**
- Modify: `backend/tests/test_workspace_api.py`
- Modify: `tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes:
  - `get_research_hub()["event_probability"]`
  - `INTEL_TABS`
  - `Intel` drag-sort registration
- Produces:
  - regression assertions that the third axis remains present in backend and frontend

- [ ] **Step 1: Write the failing tests**

1. 扩展 `backend/tests/test_workspace_api.py` 现有 `test_research_hub_and_macro_overview_seed_data`：

```python
    assert "event_probability" in data
    assert data["event_probability"]["summary"]["title"] == "事件概率体系入口"
    assert len(data["event_probability"]["priority_events"]) >= 1
    assert len(data["event_probability"]["source_interfaces"]) >= 1
```

2. 扩展 `tests/test_branding_acceptance.py` 现有 `test_vertical_left_nav_supports_drag_sort_and_is_used_by_core_pages`：

```python
    assert 'draggableStorageKey="intel-event-probability-view-order"' in intel
```

3. 新增一个导航文案回归测试：

```python
def test_workspace_intel_children_include_event_probability():
    workspace = read("frontend/src/lib/workspace.ts")

    assert '{ key: "event-probability", label: "事件概率" }' in workspace
    assert '{ key: "event-probability", label: "事件概率", description: "事件观察、催化清单、数据接口" }' in workspace
```

- [ ] **Step 2: Run tests to verify they fail where coverage is missing**

Run: `cd /Users/leo/Documents/投研体系 && python3 -m pytest backend/tests/test_workspace_api.py::test_research_hub_and_macro_overview_seed_data tests/test_branding_acceptance.py::test_vertical_left_nav_supports_drag_sort_and_is_used_by_core_pages tests/test_branding_acceptance.py::test_workspace_intel_children_include_event_probability -v`

Expected: at least one FAIL if any backend assertion or workspace string assertion is still missing.

- [ ] **Step 3: Write minimal implementation to satisfy the regression tests**

如果 Task 1 和 Task 2 已完成，这一步通常只需要把测试覆盖补齐，不再改生产代码；若前两任务实现时遗漏了任一字符串或字段，则补齐到以下状态：

```python
assert "event_probability" in data
assert data["event_probability"]["summary"]["title"] == "事件概率体系入口"
assert len(data["event_probability"]["priority_events"]) >= 1
assert len(data["event_probability"]["source_interfaces"]) >= 1
```

```python
assert 'draggableStorageKey="intel-event-probability-view-order"' in intel
```

```python
assert '{ key: "event-probability", label: "事件概率" }' in workspace
assert '{ key: "event-probability", label: "事件概率", description: "事件观察、催化清单、数据接口" }' in workspace
```

- [ ] **Step 4: Run the focused regression suite**

Run: `cd /Users/leo/Documents/投研体系 && python3 -m pytest backend/tests/test_workspace_api.py::test_research_hub_and_macro_overview_seed_data backend/tests/test_workspace_api.py::test_research_hub_exposes_event_probability_scaffold tests/test_branding_acceptance.py::test_vertical_left_nav_supports_drag_sort_and_is_used_by_core_pages tests/test_branding_acceptance.py::test_intel_event_probability_shell_is_registered tests/test_branding_acceptance.py::test_workspace_intel_children_include_event_probability -v`

Expected: PASS for all selected tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/leo/Documents/投研体系
git add backend/tests/test_workspace_api.py tests/test_branding_acceptance.py
git commit -m "test: cover intel event probability scaffold"
```
