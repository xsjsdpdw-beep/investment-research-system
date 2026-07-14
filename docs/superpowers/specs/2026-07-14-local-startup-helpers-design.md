# Local Startup Helpers Design

## Background

The repository now runs correctly in this workspace, but the actual local startup path still depends on environment-specific knowledge captured in notes:

- system `python3` is too old for the backend requirement
- system `node` and `npm` are not on `PATH`
- `pnpm run dev -- --host 127.0.0.1 --port 5899` is unreliable in this workspace because of how the arguments are forwarded

That means the repo is functional, but not yet self-describing for repeated local use. The most practical next step is to move the known-good startup commands into repository-owned helper entry points.

## Goal

Add simple repository-local startup helpers for backend and frontend development so the workspace can be started with stable, repeatable commands instead of manually reconstructing environment-specific runtime paths.

## Non-Goals

- Do not change backend or frontend application behavior.
- Do not replace the upstream quick start.
- Do not add a process manager.
- Do not add deployment scripts.
- Do not add background daemon logic or PID management.
- Do not restructure package scripts or backend module layout.

## Recommended Approach

Add a small `scripts/` directory with two shell entry points:

1. `scripts/dev-backend.sh`
2. `scripts/dev-frontend.sh`

These scripts should encode the workspace-specific launch behavior that has already been validated:

- backend uses the existing `backend/.venv`
- frontend uses the bundled Node runtime path when needed
- frontend launches Vite directly instead of relying on `pnpm run dev -- --host ...`

Also add a short repository doc section that explains when to use these helpers and what they expect.

## Scope

### Backend Helper

Create `scripts/dev-backend.sh`.

Responsibilities:

- resolve repo root from the script location
- require `backend/.venv/bin/python`
- run `uvicorn app:app --host 127.0.0.1 --port 8900` from `backend/`

The script should fail fast with a clear message if the backend virtual environment is missing.

### Frontend Helper

Create `scripts/dev-frontend.sh`.

Responsibilities:

- resolve repo root from the script location
- prepend the bundled Node runtime directory when present
- require `frontend/node_modules`
- run `frontend/node_modules/.bin/vite --host 127.0.0.1 --port 5899`

The script should fail fast with a clear message if frontend dependencies are missing.

The script should avoid `pnpm run dev -- --host ...` because that path was already shown to be unreliable in this workspace.

### Documentation

Update `README.md` with a compact local-helper section near quick start.

The README should preserve the upstream-style general quick start, but also add a local workspace note that points to:

- `scripts/dev-backend.sh`
- `scripts/dev-frontend.sh`

This keeps the upstream instructions intact while making the local derivative easier to operate.

### Local Adoption Notes

Update `docs/local-adoption-notes.md` with a short status line noting that repository-local startup helpers now exist for this workspace.

## Data Flow

No data flow changes.

The scripts only launch existing services using already-approved local runtime paths and commands.

## Error Handling

The scripts should fail early when prerequisites are missing:

- backend helper: missing `backend/.venv/bin/python`
- frontend helper: missing `frontend/node_modules`
- frontend helper: missing a usable `node` runtime

The messages should tell the user which prerequisite is missing instead of failing later with opaque shell errors.

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts exist and point at the intended commands
- the existing frontend acceptance suite
- backend offline tests
- a frontend production build
- one live launch check for each helper:
  - backend helper serves `/api/health`
  - frontend helper serves the app root on `127.0.0.1:5899`

## Acceptance Criteria

- `scripts/dev-backend.sh` exists and starts the backend from `backend/.venv`.
- `scripts/dev-frontend.sh` exists and starts the frontend with direct Vite invocation on `127.0.0.1:5899`.
- `README.md` mentions the local startup helpers without removing the upstream quick start.
- `docs/local-adoption-notes.md` records the new helper entry points.
- No backend or frontend product behavior changes.
