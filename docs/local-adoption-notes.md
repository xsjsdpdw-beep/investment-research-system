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

## Stage 2 Priority

- Rename product copy from `Vibe-Research` to `投研体系`.
- Centralize AI provider and model settings.
- Review local data storage paths.
- Move high-frequency entry points closer to 自选 / 持仓 / 个股研究 / 复盘 / 研究沉淀.

## Keep Unchanged For Now

- Upstream data-source adapters.
- Major frontend architecture.
- Major backend architecture.
- Large-scale module deletion.
