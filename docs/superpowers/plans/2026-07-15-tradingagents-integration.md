# TradingAgents Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `TradingAgents 深度分析` flow to the A-share stock detail page with separate settings, backend task execution, streamed progress, and structured results.

**Architecture:** Keep the existing `/api/chat` path unchanged and add a parallel TradingAgents path. The frontend reuses the current slide-over AI shell with a dedicated deep-analysis mode, while the backend manages TradingAgents runs as in-memory tasks exposed through a small streaming API.

**Tech Stack:** React 19, TypeScript, Zustand/localStorage patterns already used in the frontend, FastAPI, Python background threads, pytest

## Global Constraints

- Do not replace the current `/api/chat` flow.
- Only support 6-digit A-share symbols in the first TradingAgents integration.
- Do not reuse local CLI subscription mode for TradingAgents.
- Keep TradingAgents configuration separate from the existing lightweight AI chat configuration.
- Stream progress updates from the backend and present a structured final result instead of a raw text dump.
- Fail clearly for missing config, missing dependencies, unsupported symbols, and runtime errors.

---

## File Structure

- Modify: `frontend/src/pages/Settings.tsx` to add TradingAgents settings UI
- Create: `frontend/src/lib/tradingagents.ts` for local config storage, request helpers, and stream parsing
- Modify: `frontend/src/pages/StockData.tsx` to add the TradingAgents trigger for A-share results
- Modify: `frontend/src/components/ui/AskAiButton.tsx` to support a deep-analysis mode in the existing shell
- Create: `backend/tradingagents_runtime.py` for task registry, validation, runtime execution, and event normalization
- Modify: `backend/app.py` to expose TradingAgents task endpoints
- Create: `backend/tests/test_tradingagents_runtime.py` for backend task and validation coverage
- Modify: `backend/requirements-dev.txt` only if an added backend test helper is required

### Task 1: Add Frontend TradingAgents Config Support

**Files:**
- Create: `frontend/src/lib/tradingagents.ts`
- Modify: `frontend/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: existing local-storage pattern from `frontend/src/lib/llm.ts`
- Produces: `loadTradingAgentsConfig(): TradingAgentsConfig | null`, `saveTradingAgentsConfig(cfg: TradingAgentsConfig): void`, `clearTradingAgentsConfig(): void`, `hasTradingAgentsConfig(): boolean`

- [ ] **Step 1: Write the failing frontend config test target by defining the expected module contract in the plan**

```ts
export interface TradingAgentsConfig {
  enabled: boolean;
  provider: string;
  baseURL: string;
  apiKey: string;
  deepModel: string;
  quickModel: string;
}

export function loadTradingAgentsConfig(): TradingAgentsConfig | null;
export function saveTradingAgentsConfig(cfg: TradingAgentsConfig): void;
export function clearTradingAgentsConfig(): void;
export function hasTradingAgentsConfig(): boolean;
```

- [ ] **Step 2: Run a quick file check before implementation**

Run: `sed -n '1,240p' frontend/src/lib/llm.ts && sed -n '1,260p' frontend/src/pages/Settings.tsx`
Expected: existing local-storage helper patterns and settings layout are visible

- [ ] **Step 3: Write the minimal config storage implementation**

```ts
// frontend/src/lib/tradingagents.ts
export interface TradingAgentsConfig {
  enabled: boolean;
  provider: string;
  baseURL: string;
  apiKey: string;
  deepModel: string;
  quickModel: string;
}

const KEY = "vr-tradingagents";

export function loadTradingAgentsConfig(): TradingAgentsConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as TradingAgentsConfig;
    if (!cfg.enabled) return null;
    if (!cfg.provider || !cfg.baseURL || !cfg.apiKey || !cfg.deepModel || !cfg.quickModel) return null;
    return cfg;
  } catch {
    return null;
  }
}

export function saveTradingAgentsConfig(cfg: TradingAgentsConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearTradingAgentsConfig() {
  localStorage.removeItem(KEY);
}

export function hasTradingAgentsConfig(): boolean {
  return loadTradingAgentsConfig() !== null;
}
```

- [ ] **Step 4: Add the settings form in the existing settings page**

```tsx
// inside frontend/src/pages/Settings.tsx
const existingTa = loadTradingAgentsConfig();
const [taEnabled, setTaEnabled] = useState(existingTa?.enabled ?? false);
const [taProvider, setTaProvider] = useState(existingTa?.provider ?? "openai-compatible");
const [taBaseURL, setTaBaseURL] = useState(existingTa?.baseURL ?? "");
const [taApiKey, setTaApiKey] = useState(existingTa?.apiKey ?? "");
const [taDeepModel, setTaDeepModel] = useState(existingTa?.deepModel ?? "");
const [taQuickModel, setTaQuickModel] = useState(existingTa?.quickModel ?? "");

const saveTradingAgents = () => {
  if (!taEnabled) {
    clearTradingAgentsConfig();
    toast.success("已关闭 TradingAgents 深度分析配置");
    return;
  }
  if (!taProvider.trim() || !taBaseURL.trim() || !taApiKey.trim() || !taDeepModel.trim() || !taQuickModel.trim()) {
    toast.error("请填完 TradingAgents 所需配置");
    return;
  }
  saveTradingAgentsConfig({
    enabled: true,
    provider: taProvider.trim(),
    baseURL: taBaseURL.trim(),
    apiKey: taApiKey.trim(),
    deepModel: taDeepModel.trim(),
    quickModel: taQuickModel.trim(),
  });
  toast.success("已保存 TradingAgents 深度分析配置");
};
```

- [ ] **Step 5: Run a frontend type/build verification for the touched settings files**

Run: `cd frontend && npm run build`
Expected: build succeeds without TypeScript errors from `Settings.tsx` or `tradingagents.ts`

- [ ] **Step 6: Commit the frontend config slice**

```bash
git add frontend/src/lib/tradingagents.ts frontend/src/pages/Settings.tsx
git commit -m "feat: add tradingagents settings storage"
```

### Task 2: Add Backend TradingAgents Task Runtime and API

**Files:**
- Create: `backend/tradingagents_runtime.py`
- Modify: `backend/app.py`
- Test: `backend/tests/test_tradingagents_runtime.py`

**Interfaces:**
- Consumes: `FastAPI` request handling from `backend/app.py`
- Produces: `start_task(code: str, name: str, context: str, cfg: dict) -> str`, `stream_events(task_id: str) -> Iterator[dict]`, `cancel_task(task_id: str) -> dict`

- [ ] **Step 1: Write the failing backend tests for config validation and task lifecycle**

```python
def test_start_task_rejects_non_astock():
    with pytest.raises(ValueError, match="仅支持 A 股 6 位代码"):
        runtime.start_task("AAPL", "", "", valid_cfg())

def test_start_task_rejects_missing_provider_fields():
    with pytest.raises(ValueError, match="TradingAgents 配置不完整"):
        runtime.start_task("600519", "", "", {"provider": "", "baseURL": "", "apiKey": "", "deepModel": "", "quickModel": ""})

def test_cancel_task_marks_running_task():
    task_id = runtime._create_task_for_test("600519")
    assert runtime.cancel_task(task_id)["ok"] is True
```

- [ ] **Step 2: Run the backend tests first to confirm they fail**

Run: `cd backend && pytest tests/test_tradingagents_runtime.py -q`
Expected: FAIL because `tradingagents_runtime.py` and its interfaces do not exist yet

- [ ] **Step 3: Implement the minimal runtime registry and validation layer**

```python
# backend/tradingagents_runtime.py
from __future__ import annotations

import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator


@dataclass
class TaskState:
    task_id: str
    code: str
    name: str
    context: str
    cfg: dict[str, Any]
    status: str = "pending"
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    done: bool = False
    event_queue: "queue.Queue[dict[str, Any]]" = field(default_factory=queue.Queue)


_TASKS: dict[str, TaskState] = {}
_LOCK = threading.Lock()


def _validate_code(code: str) -> str:
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
      raise ValueError("仅支持 A 股 6 位代码")
    return code


def _validate_cfg(cfg: dict[str, Any]) -> dict[str, str]:
    required = ["provider", "baseURL", "apiKey", "deepModel", "quickModel"]
    cleaned = {k: str(cfg.get(k, "")).strip() for k in required}
    if any(not cleaned[k] for k in required):
        raise ValueError("TradingAgents 配置不完整，请先在接入 AI页填写")
    return cleaned
```

- [ ] **Step 4: Implement task execution, event streaming, and FastAPI endpoints**

```python
def _push(task: TaskState, event: dict[str, Any]) -> None:
    task.events.append(event)
    task.event_queue.put(event)


def start_task(code: str, name: str, context: str, cfg: dict[str, Any]) -> str:
    code = _validate_code(code)
    cleaned = _validate_cfg(cfg)
    task = TaskState(task_id=uuid.uuid4().hex, code=code, name=name.strip(), context=context or "", cfg=cleaned)
    with _LOCK:
        _TASKS[task.task_id] = task
    threading.Thread(target=_run_task, args=(task,), daemon=True).start()
    return task.task_id


def stream_events(task_id: str) -> Iterator[dict[str, Any]]:
    task = get_task(task_id)
    for event in task.events:
        yield event
    while not task.done or not task.event_queue.empty():
        try:
            yield task.event_queue.get(timeout=0.5)
        except queue.Empty:
            if task.done:
                break


def cancel_task(task_id: str) -> dict[str, Any]:
    task = get_task(task_id)
    task.cancel_requested = True
    return {"ok": True}
```

- [ ] **Step 5: Add a deterministic fake runner first, then leave a narrow hook for the real TradingAgents import**

```python
def _run_task(task: TaskState) -> None:
    task.status = "running"
    _push(task, {"type": "task_started", "taskId": task.task_id, "code": task.code})
    stages = ["市场分析", "舆情分析", "新闻分析", "基本面分析", "政策分析", "游资追踪", "解禁监控", "多空辩论", "交易方案", "风险讨论", "最终决策"]
    try:
        for stage in stages:
            if task.cancel_requested:
                task.status = "cancelled"
                _push(task, {"type": "cancelled", "taskId": task.task_id, "stage": stage})
                task.done = True
                return
            _push(task, {"type": "stage_started", "taskId": task.task_id, "stage": stage})
            time.sleep(0.01)
            _push(task, {"type": "stage_completed", "taskId": task.task_id, "stage": stage})
        result = {
            "summary": f"{task.code} 深度分析已完成",
            "analyst_sections": [],
            "debate_summary": "",
            "risk_summary": "",
            "full_report": "",
            "raw_decision": "",
        }
        task.result = result
        task.status = "completed"
        _push(task, {"type": "result", "taskId": task.task_id, "result": result})
    except Exception as exc:
        task.status = "error"
        task.error = str(exc)
        _push(task, {"type": "error", "taskId": task.task_id, "message": str(exc)})
    finally:
        task.done = True
```

- [ ] **Step 6: Wire the endpoints in `backend/app.py`**

```python
class TradingAgentsConfigIn(BaseModel):
    provider: str
    baseURL: str
    apiKey: str
    deepModel: str
    quickModel: str


class TradingAgentsRunReq(BaseModel):
    code: str
    name: str = ""
    context: str = ""
    config: TradingAgentsConfigIn


@app.post("/api/tradingagents/run")
def tradingagents_run(req: TradingAgentsRunReq):
    try:
        task_id = tradingagents_runtime.start_task(req.code, req.name, req.context, req.config.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"taskId": task_id}
```

- [ ] **Step 7: Run the focused backend tests**

Run: `cd backend && pytest tests/test_tradingagents_runtime.py -q`
Expected: PASS

- [ ] **Step 8: Commit the backend runtime slice**

```bash
git add backend/tradingagents_runtime.py backend/app.py backend/tests/test_tradingagents_runtime.py
git commit -m "feat: add tradingagents task runtime"
```

### Task 3: Add Frontend TradingAgents Run Flow in the Existing Panel

**Files:**
- Modify: `frontend/src/components/ui/AskAiButton.tsx`
- Modify: `frontend/src/pages/StockData.tsx`
- Create: `frontend/src/lib/tradingagents.ts` (extend with run helpers if not already done in Task 1)

**Interfaces:**
- Consumes: `hasTradingAgentsConfig()` and backend endpoints from Task 2
- Produces: `startTradingAgentsRun(input): Promise<{ taskId: string }>` and `streamTradingAgentsRun(taskId, handlers, signal): Promise<void>`

- [ ] **Step 1: Define the new frontend request/stream helpers**

```ts
export interface TradingAgentsRunInput {
  code: string;
  name: string;
  context: string;
}

export interface TradingAgentsStreamHandlers {
  onEvent?: (event: TradingAgentsEvent) => void;
}

export async function startTradingAgentsRun(input: TradingAgentsRunInput): Promise<{ taskId: string }>;
export async function streamTradingAgentsRun(taskId: string, handlers: TradingAgentsStreamHandlers, signal?: AbortSignal): Promise<void>;
```

- [ ] **Step 2: Add the API helpers in `frontend/src/lib/tradingagents.ts`**

```ts
export async function startTradingAgentsRun(input: TradingAgentsRunInput): Promise<{ taskId: string }> {
  const cfg = loadTradingAgentsConfig();
  if (!cfg) throw new ApiError("尚未配置 TradingAgents 深度分析，请先去接入 AI 页面填写", 400);
  const resp = await fetch("/api/tradingagents/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ...input, config: cfg }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new ApiError(body?.detail || `HTTP ${resp.status}`, resp.status);
  return body;
}
```

- [ ] **Step 3: Extend the panel component to support a deep-analysis mode**

```tsx
interface Props {
  context: string;
  suggestions?: string[];
  label?: string;
  mode?: "chat" | "tradingagents";
  stockCode?: string;
  stockName?: string;
}

const isTradingAgents = mode === "tradingagents";
```

- [ ] **Step 4: Implement the deep-analysis state machine in the panel**

```tsx
const [taConfigured, setTaConfigured] = useState(false);
const [taEvents, setTaEvents] = useState<TradingAgentsEvent[]>([]);
const [taResult, setTaResult] = useState<TradingAgentsResult | null>(null);

const runTradingAgents = async () => {
  if (!stockCode) return;
  setTaEvents([]);
  setTaResult(null);
  setErr(null);
  setLoading(true);
  const { taskId } = await startTradingAgentsRun({ code: stockCode, name: stockName || "", context });
  await streamTradingAgentsRun(taskId, {
    onEvent: (event) => {
      setTaEvents((events) => [...events, event]);
      if (event.type === "result") setTaResult(event.result);
    },
  }, ac.signal);
  setLoading(false);
};
```

- [ ] **Step 5: Add the new stock-page trigger beside the existing AI button**

```tsx
actions={(val || gstock) && (
  <div className="flex items-center gap-2">
    <AskAiButton context={gstock ? gAiContext : aiContext} label="让 AI 读这些数据" suggestions={...} />
    {val && (
      <AskAiButton
        mode="tradingagents"
        context={aiContext}
        stockCode={val.code}
        stockName={val.name}
        label="TradingAgents 深度分析"
      />
    )}
  </div>
)}
```

- [ ] **Step 6: Run the frontend build after wiring the panel**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 7: Commit the frontend integration slice**

```bash
git add frontend/src/components/ui/AskAiButton.tsx frontend/src/pages/StockData.tsx frontend/src/lib/tradingagents.ts
git commit -m "feat: add tradingagents stock panel flow"
```

### Task 4: Replace the Fake Runner With a Real TradingAgents Integration Hook and Add Verification

**Files:**
- Modify: `backend/tradingagents_runtime.py`
- Test: `backend/tests/test_tradingagents_runtime.py`

**Interfaces:**
- Consumes: task runtime from Task 2
- Produces: runtime path that prefers real TradingAgents import when available and falls back to a clear dependency error

- [ ] **Step 1: Write the failing test for missing dependency and real-runner hook selection**

```python
def test_run_task_emits_error_when_runtime_missing(monkeypatch):
    monkeypatch.setattr(runtime, "_load_tradingagents_runner", lambda: (_ for _ in ()).throw(ImportError("missing")))
    task_id = runtime.start_task("600519", "贵州茅台", "ctx", valid_cfg())
    events = list(runtime.stream_events(task_id))
    assert any(event["type"] == "error" and "未安装" in event["message"] for event in events)
```

- [ ] **Step 2: Run the focused backend test to see the missing hook failure**

Run: `cd backend && pytest tests/test_tradingagents_runtime.py -q`
Expected: FAIL on missing `_load_tradingagents_runner` behavior

- [ ] **Step 3: Add a narrow runtime loader and result normalizer**

```python
def _load_tradingagents_runner():
    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("TradingAgents 运行时未安装或不可用") from exc

    def run(task: TaskState) -> dict[str, Any]:
        config = {
            "llm_provider": task.cfg["provider"],
            "backend_url": task.cfg["baseURL"],
            "deep_think_llm": task.cfg["deepModel"],
            "quick_think_llm": task.cfg["quickModel"],
            "output_language": "Chinese",
        }
        graph = TradingAgentsGraph(debug=False, config=config)
        final_state, decision = graph.propagate(task.code, time.strftime("%Y-%m-%d"))
        return _normalize_result(task, final_state, decision)

    return run
```

- [ ] **Step 4: Update `_run_task` to use the real runner and emit a clear dependency error**

```python
runner = _load_tradingagents_runner()
result = runner(task)
task.result = result
task.status = "completed"
_push(task, {"type": "result", "taskId": task.task_id, "result": result})
```

- [ ] **Step 5: Re-run backend tests and broad backend verification**

Run: `cd backend && pytest tests/test_tradingagents_runtime.py -q && pytest -m "not live" -q`
Expected: TradingAgents runtime tests PASS and existing offline suite stays green

- [ ] **Step 6: Run final frontend verification**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 7: Commit the real runtime integration**

```bash
git add backend/tradingagents_runtime.py backend/tests/test_tradingagents_runtime.py
git commit -m "feat: connect tradingagents runtime"
```

## Self-Review

### Spec coverage

- Separate TradingAgents settings: Task 1
- Backend task API and streaming: Task 2
- Stock detail entry and panel mode: Task 3
- Dependency handling and structured results: Task 4
- Validation and failure handling: Tasks 2 and 4

No uncovered spec requirements remain.

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation notes remain in task steps.
- Each code-bearing step includes explicit code or interface content.

### Type consistency

- Frontend config names stay aligned: `provider`, `baseURL`, `apiKey`, `deepModel`, `quickModel`
- Backend runtime uses the same config keys.
- Task interfaces define `taskId`, event `type`, and result fields consistently across backend and frontend tasks.
