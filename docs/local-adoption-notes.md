# Local Adoption Notes

## Stage 1 Status

- Upstream Vibe-Research source imported into `/Users/leo/Documents/投研体系`.
- Local git repository initialized on branch `main`.
- Backend dependency environment created at `backend/.venv` with Codex bundled Python `3.12.13`.
- Backend validated on `http://127.0.0.1:8900/docs`.
- Frontend dependencies installed with Codex bundled `pnpm 11.7.0`.
- Frontend production build validated with `pnpm run build`.
- Frontend dev server validated on `http://127.0.0.1:5899`.

## Local Runtime Notes

- System `python3` is `3.9.6`, below the upstream README's Python 3.10+ requirement.
- Use `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` for backend setup in this workspace.
- System `node` and `npm` are not on `PATH`.
- Use `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node` and `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm` for frontend setup in this workspace.
- `pnpm approve-builds --all` was required once so `esbuild` could run its install script.
- Running `pnpm run dev -- --host 127.0.0.1 --port 5899` passed arguments through as `vite -- --host ...`, causing Vite to listen on IPv6 `::1`; direct Vite invocation with `./node_modules/.bin/vite --host 127.0.0.1 --port 5899` validated IPv4 access.

## Stage 2 Status

- Runtime branding updated from upstream `Vibe-Research` to local product name `投研体系`.
- Backend API metadata now reports `投研体系 API`.
- `/api/health` now reports service `investment-research-api`.
- Local data directories remain unchanged for compatibility.
- Frontend app constants centralized in `frontend/src/lib/app-config.ts`; browser storage key values remain unchanged.
- A data storage map is now documented in `docs/data-storage-map.md`.
- AI provider/model initialization logic is centralized in `frontend/src/lib/ai-config.ts`; saved `vr-llm` shape remains unchanged.
- Sidebar navigation now prioritizes 每日复盘、自选股、我的持仓、个股数据、研究记录、资讯雷达.
- `每日复盘` now includes quick links to the core adjacent workflows.
- Repository-local initialization helpers now exist at `scripts/init-backend.sh`, `scripts/init-frontend.sh`, and `scripts/init-all.sh`.
- Repository-local startup helpers now exist at `scripts/dev-backend.sh` and `scripts/dev-frontend.sh`.
- Repository-local service lifecycle helpers now exist for stopping or fully restarting the local backend/frontend stack.
- Repository-local service status helpers now exist for checking backend/frontend runtime state.
- Repository-local log helpers now exist for reading backend/frontend runtime logs.
- Repository-local doctor helpers now exist for summarizing backend/frontend environment readiness.
- TradingAgents local helpers now exist at `scripts/init-tradingagents.sh` and `scripts/doctor-tradingagents.sh`.
- Repository-local cleanup helpers now exist for stopping services and clearing temporary runtime logs.
- Repository-local verification helpers now exist for acceptance, frontend build, backend offline tests, and full local verification.

## Stage 2 Priority

- Current Stage 2 priorities are complete. Keep subsequent local refinements incremental and compatibility-preserving.

## Keep Unchanged For Now

- Upstream data-source adapters.
- Major frontend architecture.
- Major backend architecture.
- Large-scale module deletion.
