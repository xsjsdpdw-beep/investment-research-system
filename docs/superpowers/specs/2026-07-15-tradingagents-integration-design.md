# TradingAgents Deep Analysis Integration Design

## Overview

Integrate `simonlin1212/TradingAgents-astock` into Vibe-Research as a new deep-analysis engine for the stock detail page. The new capability must appear inside the existing `问 AI` interaction surface as a dedicated `TradingAgents 深度分析` entry, while preserving the current lightweight chat flow.

This integration is intentionally treated as a separate execution path rather than "just another model" because TradingAgents is a long-running multi-agent workflow with multiple analysis stages, many LLM calls, and a structured final output.

## Goals

- Add a `TradingAgents 深度分析` action on the stock detail page for A-share stocks.
- Reuse the existing right-side AI panel so the feature feels native to the current product.
- Run TradingAgents as a backend-managed long task with streamed progress updates.
- Keep TradingAgents configuration separate from the existing lightweight AI chat configuration.
- Present a readable structured result instead of dumping a raw monolithic report.

## Non-Goals

- Do not replace the current `/api/chat` flow.
- Do not support US/HK/KR stocks in the first TradingAgents integration.
- Do not reuse local CLI subscription mode for TradingAgents.
- Do not require full real-provider execution in automated tests.
- Do not refactor unrelated AI settings or existing chat architecture beyond what this feature needs.

## User Experience

### Entry Point

On the stock detail page, when the current symbol is a 6-digit A-share code and stock data has loaded, show a second action next to the existing `让 AI 读这些数据` button:

- `TradingAgents 深度分析`

This button opens the same right-side panel component, but in a dedicated deep-analysis mode rather than standard chat mode.

### Panel Behavior

The deep-analysis mode behaves like a single structured task, not a conversation thread:

- Before start: show a short explanation of what the analysis does and remind the user it uses their own API-based model configuration.
- While running: show streamed phase/status updates.
- On success: show a structured report.
- On failure: show the completed phases plus a clear error message and a retry action.

### Progress Model

The panel should expose progress as human-readable stages, mapped from the TradingAgents pipeline:

- `市场分析`
- `舆情分析`
- `新闻分析`
- `基本面分析`
- `政策分析`
- `游资追踪`
- `解禁监控`
- `多空辩论`
- `交易方案`
- `风险讨论`
- `最终决策`

Progress events are append-only and should remain visible after failure so the user can see how far the task got.

### Final Result Structure

The rendered result should be normalized into stable sections:

- `结论摘要`
- `七个分析师要点`
- `多空辩论结论`
- `交易与风险结论`
- `完整原始报告`

This preserves depth while making the result scannable.

## Configuration Design

TradingAgents configuration is independent from the current generic AI configuration stored in `frontend/src/lib/llm.ts`.

### New Frontend Config Block

Add a separate local-storage-backed config for TradingAgents:

- `enabled`
- `provider`
- `baseURL`
- `apiKey`
- `deepModel`
- `quickModel`

The settings UI should gain a new card or section under `接入 AI`, clearly labeled for `TradingAgents 深度分析`.

### Why Separate Config

The current chat config is optimized for either:

- lightweight API chat, or
- local CLI subscription execution

TradingAgents has different constraints:

- API-only, no CLI subscription mode
- dual-model configuration
- long-running workflow semantics

Separating the config avoids hidden coupling and keeps current chat behavior unchanged.

## Backend Architecture

### New Backend Module

Introduce a dedicated backend module, for example:

- `backend/tradingagents_runtime.py`

Responsibilities:

- validate TradingAgents request/config
- load the TradingAgents package/runtime
- translate Vibe-Research request data into TradingAgents config
- execute the analysis in a background task
- emit normalized progress events
- normalize final output into a Vibe-Research response shape

### Execution Strategy

Do not call the TradingAgents CLI as the main integration path.

Instead, import and run `TradingAgentsGraph` directly from Python. This gives:

- structured access to results
- more reliable error handling
- more control over progress mapping
- less parsing fragility than shelling out to a terminal UI-oriented CLI

### Task Lifecycle

Use a backend-managed in-memory task registry for the first version.

Each task stores:

- `task_id`
- `status`
- `symbol`
- `created_at`
- `events`
- `result`
- `error`
- `cancel_requested`

This is sufficient for local/self-hosted usage and avoids adding persistence complexity in phase one.

### API Surface

Add a dedicated set of endpoints:

- `POST /api/tradingagents/run`
- `GET /api/tradingagents/stream/{task_id}`
- `POST /api/tradingagents/cancel/{task_id}`

`POST /run` creates the task and starts background execution.

`GET /stream/{task_id}` returns NDJSON or SSE-style streamed task events.

`POST /cancel/{task_id}` marks the task for cancellation. First version cancellation is cooperative: if the current step cannot be interrupted immediately, the system stops before the next major stage when possible.

## Request and Response Shapes

### Run Request

The request should include:

- A-share stock code
- display name if already known
- optional page context snapshot
- TradingAgents config payload from local settings

The backend should reject non-6-digit A-share symbols for the first version.

### Stream Events

Use simple event objects such as:

- `task_started`
- `stage_started`
- `stage_completed`
- `log`
- `result`
- `error`
- `cancelled`

Each event should include enough metadata for the frontend to render state without reverse inference.

### Final Result Shape

Normalize TradingAgents output into:

- `summary`
- `analyst_sections`
- `debate_summary`
- `risk_summary`
- `full_report`
- `raw_decision`

The normalization layer should tolerate missing sections and fill with empty strings rather than failing the entire request after a mostly successful run.

## Frontend Integration

### Stock Page

Update `frontend/src/pages/StockData.tsx`:

- add the new action beside the existing AI button
- only show it for A-share results
- pass stock code, stock name, and current data snapshot into the deep-analysis panel

### AI Panel Component

Extend or split `frontend/src/components/ui/AskAiButton.tsx` so the shared slide-over shell can render two modes:

- standard chat mode
- TradingAgents deep-analysis mode

The shell should remain visually consistent, but the internal behavior differs:

- chat mode keeps message input
- deep-analysis mode uses start/retry/cancel controls and a progress/result view

If splitting the component is cleaner, create a thin shared shell plus two focused inner components.

### Settings Page

Update `frontend/src/pages/Settings.tsx`:

- add a dedicated TradingAgents settings section
- validate required fields before save
- explain that TradingAgents requires API mode and may consume many model calls

## Dependency and Environment Handling

The integration must fail clearly when TradingAgents runtime dependencies are unavailable.

At runtime, validate:

- Python package importability
- required provider config presence
- supported stock code format

Return explicit user-facing errors such as:

- TradingAgents not installed
- provider config incomplete
- unsupported symbol type
- analysis timed out

Do not silently fall back to the generic chat flow.

## Error Handling

Three user-facing failure classes:

### Not Configured

Frontend blocks launch and links to settings when TradingAgents config is missing.

### Environment or Dependency Failure

Backend rejects task start with a clear explanation.

### Runtime Failure

If execution fails mid-run:

- preserve completed stages in the stream
- show the error in-panel
- allow retry

## Testing Strategy

### Frontend Tests

Cover:

- button visibility only on A-share stock detail state
- missing-config guidance
- deep-analysis mode render path
- progress event rendering
- success and failure state rendering

### Backend Tests

Cover:

- request validation
- task creation
- event streaming format
- cancel behavior
- config validation
- normalized result shape

### Integration Tests

Use a mocked TradingAgents runner to simulate:

- full successful run
- stage failure
- cancellation

Do not make real third-party model execution a required automated test path.

## Rollout Notes

Phase one can keep the task registry in memory and the TradingAgents runtime as an optional integration. If later usage requires persistence or resumability, the runtime module can be upgraded to a durable job backend without changing the stock page contract.

## Open Decisions Resolved

- Entry point: stock detail page `问 AI` surface
- Interaction model: dedicated deep-analysis task, not normal chat
- Backend strategy: direct Python integration, not CLI parsing
- Config strategy: separate TradingAgents settings
- Scope: A-share only in first version

## Implementation Outline

Expected implementation slices:

1. Add TradingAgents config storage and settings UI
2. Add backend task runtime and API endpoints
3. Add frontend deep-analysis panel mode and stock-page trigger
4. Add mocks/tests for backend and frontend

This scope is intentionally narrow and should be implemented with minimal disturbance to the current `/api/chat` flow.
