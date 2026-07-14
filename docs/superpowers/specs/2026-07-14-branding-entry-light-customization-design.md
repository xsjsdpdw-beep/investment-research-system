# Branding and Entry Light Customization Design

## Background

Stage 1 has imported the upstream `Vibe-Research` project and verified that the backend and frontend run locally. The next useful step is to make the first visible surfaces feel like the user's own `投研体系` while keeping the upstream architecture and data behavior stable.

The current visible upstream branding appears mainly in:

- `frontend/index.html`
- `frontend/src/components/layout/Layout.tsx`
- `frontend/src/components/ui/Disclaimer.tsx`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/pages/StockData.tsx`
- `backend/app.py`
- `backend/chat.py`
- selected backend comments and docs

This stage should be intentionally small. It should rename the user-facing shell and API identity, but it should not rename storage paths, package names, or upstream attribution areas that are useful for provenance.

## Goal

Make the running app present itself as `投研体系` in the browser title, sidebar, key user-facing copy, disclaimer, AI settings copy, and backend API metadata.

## Non-Goals

- Do not change default local data directories such as `~/.vibe-research/`.
- Do not rename package names, lockfile package names, or repository provenance.
- Do not change data-source adapters.
- Do not reorder navigation in this stage.
- Do not redesign the visual system.
- Do not remove upstream attribution from README or source comments where it explains origin.

## Recommended Approach

Use a lightweight branding replacement focused on user-facing runtime surfaces.

This approach keeps Stage 2 low risk:

- The app becomes recognizable as `投研体系` immediately.
- Existing local data and migration behavior remain unchanged.
- The upstream-derived code remains easy to compare with the original project.
- The change can be verified with frontend build, backend tests, and simple runtime checks.

## Scope

### Frontend Browser Metadata

Update `frontend/index.html`:

- Change the document title to `投研体系 · 个人 AI 投研系统（A股/美股/港股）`.
- Change the meta description to describe `投研体系` as the user's personal AI research system.

### Sidebar Brand

Update `frontend/src/components/layout/Layout.tsx`:

- Replace the visible brand text `Vibe-Research` with `投研体系`.
- Keep the current subtitle `个人 AI 投研系统 · A股/美股/港股`.
- Keep the existing navigation items unchanged.
- Keep the GitHub link pointing to upstream for now, because this local project is still a derivative of the upstream repository.
- Change the author footer link text from `联系作者 · simonlin.net` to a neutral upstream reference such as `上游项目 · Vibe-Research`.

### User-Facing Copy

Update user-facing `Vibe-Research` mentions in:

- `frontend/src/components/ui/Disclaimer.tsx`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/pages/StockData.tsx`

Replacement rule:

- Use `投研体系` when the copy describes the local running product.
- Keep `Vibe-Research` only where the copy explicitly refers to the upstream project or provenance.

### Backend Identity

Update `backend/app.py`:

- Change FastAPI title from `Vibe-Research API` to `投研体系 API`.
- Change `/api/health` service value from `vibe-research-api` to `investment-research-api`.
- Keep version unchanged at `0.1.3`.

Update `backend/chat.py`:

- Change the system prompt identity from `Vibe-Research 里的投研助理` to `投研体系里的投研助理`.

### Documentation

Update `docs/local-adoption-notes.md`:

- Mark Stage 2 branding as implemented.
- Keep local runtime notes unchanged.

## Data Flow

This change does not alter data flow.

The frontend still calls backend APIs through `/api`. The backend still reads and writes the same local data paths and uses the same adapters for A-share, US/HK stock data, news, reports, portfolio, and AI calls.

## Error Handling

No error-handling behavior changes are expected.

The risk is accidental replacement of strings that are part of storage paths, environment variables, package names, or upstream command examples. The implementation should use targeted edits instead of broad global replacement.

## Testing

Verification should include:

- `backend/.venv/bin/pytest -m "not live"` from `backend/`
- `pnpm run build` from `frontend/` using the Codex bundled Node runtime
- A direct backend health check confirming `service` is `investment-research-api`
- A direct frontend HTML check confirming the page title contains `投研体系`

## Acceptance Criteria

- The browser title says `投研体系 · 个人 AI 投研系统（A股/美股/港股）`.
- The sidebar brand says `投研体系`.
- Key runtime user-facing copy no longer presents the local product as `Vibe-Research`.
- Backend OpenAPI title is `投研体系 API`.
- `/api/health` returns service `investment-research-api`.
- Backend offline tests pass.
- Frontend production build passes.
