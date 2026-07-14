# Frontend Config Consolidation Design

## Background

Stage 1 imported and verified the upstream project. Stage 2 updated the runtime brand from upstream `Vibe-Research` to the local product name `投研体系`.

The frontend still has several small configuration values scattered across files:

- Product-facing identity in layout and metadata
- Upstream repository link in layout
- localStorage keys such as `vr-sidebar` and `vr-theme`
- Backend startup hints that mention port `8900`
- Vite API target default `http://127.0.0.1:8900`

This stage should consolidate only frontend constants that are likely to be reused or changed later. It should not change runtime behavior.

## Goal

Add a small frontend configuration module and migrate low-risk frontend constants into it, so future customization can happen from one clear place.

## Non-Goals

- Do not change backend code.
- Do not change backend environment variables.
- Do not change `~/.vibe-research` local data directories.
- Do not rename package names or lockfile package names.
- Do not reorder navigation.
- Do not redesign UI.
- Do not migrate existing browser localStorage keys in this stage.

## Recommended Approach

Create `frontend/src/lib/app-config.ts` and use it from existing frontend files.

The first version should expose:

- `APP_CONFIG.productName = "投研体系"`
- `APP_CONFIG.productTitle = "投研体系 · 个人 AI 投研系统（A股/美股/港股）"`
- `APP_CONFIG.productSubtitle = "个人 AI 投研系统 · A股/美股/港股"`
- `APP_CONFIG.upstreamRepoUrl = "https://github.com/simonlin1212/Vibe-Research"`
- `APP_CONFIG.upstreamLabel = "上游项目 · Vibe-Research"`
- `APP_CONFIG.backendPort = 8900`
- `APP_STORAGE_KEYS.sidebar = "vr-sidebar"`
- `APP_STORAGE_KEYS.theme = "vr-theme"`

The storage key values intentionally remain unchanged. This avoids resetting the user's sidebar and theme preferences and avoids hidden migration work.

## Scope

### Config Module

Create `frontend/src/lib/app-config.ts`.

The module should contain stable named constants rather than a broad dynamic settings system. This keeps the change small and prevents over-engineering.

### Layout

Update `frontend/src/components/layout/Layout.tsx`:

- Read upstream URL and footer label from `APP_CONFIG`.
- Read product name and subtitle from `APP_CONFIG`.
- Read sidebar localStorage key from `APP_STORAGE_KEYS.sidebar`.
- Keep the current visible split brand styling: `投研` plus highlighted `体系`.

### Theme Hook

Update `frontend/src/hooks/useDarkMode.ts`:

- Read theme localStorage key from `APP_STORAGE_KEYS.theme`.
- Keep the key value as `vr-theme`.

### API and LLM Startup Hints

Update `frontend/src/lib/api.ts` and `frontend/src/lib/llm.ts`:

- Build the backend startup hint from `APP_CONFIG.backendPort`.
- Keep the message text equivalent to the current message.

### Browser Metadata

`frontend/index.html` is static HTML, so it should remain unchanged in this stage. The title and description already reflect `投研体系`.

### Vite Config

`frontend/vite.config.ts` can keep the literal `http://127.0.0.1:8900` in this stage because it runs outside the frontend source import graph and has a separate environment-variable mechanism via `VITE_API_URL`.

## Data Flow

No data flow changes.

The frontend still calls `/api`, Vite still proxies to the backend, and existing browser storage keys remain the same.

## Error Handling

No error-handling behavior changes are expected.

The main risk is accidentally changing localStorage key values and resetting user preferences. Tests should assert the key values remain `vr-sidebar` and `vr-theme`.

## Testing

Verification should include:

- A frontend config acceptance test that reads source files and confirms `app-config.ts` owns the key constants.
- Existing branding acceptance tests.
- Frontend production build.

Backend offline tests are optional for this frontend-only change, but running them is acceptable as a final confidence check.

## Acceptance Criteria

- `frontend/src/lib/app-config.ts` exists.
- `Layout.tsx` imports and uses `APP_CONFIG` and `APP_STORAGE_KEYS`.
- `useDarkMode.ts` imports and uses `APP_STORAGE_KEYS.theme`.
- `api.ts` and `llm.ts` import and use `APP_CONFIG.backendPort` for backend startup hints.
- `APP_STORAGE_KEYS.sidebar` remains `vr-sidebar`.
- `APP_STORAGE_KEYS.theme` remains `vr-theme`.
- Existing branding acceptance tests pass.
- Frontend production build passes.
