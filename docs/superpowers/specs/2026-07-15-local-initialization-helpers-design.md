# Local Initialization Helpers Design

## Background

The repository already has local helper entry points for:

- startup
- verification

The remaining repeated manual knowledge is initialization.

Today, preparing this workspace still depends on remembering environment-specific setup details:

- system `python3` is too old for the backend requirement
- the workspace should use the bundled Python runtime path
- system `node` and `npm` are not on `PATH`
- the workspace should use the bundled `pnpm`
- `pnpm approve-builds --all` was needed once so `esbuild` could run

Those steps are already known and documented, but they are not yet encoded as repository-owned helper commands.

## Goal

Add repository-local initialization helpers so this workspace can prepare backend and frontend dependencies through stable, repeatable script entry points instead of relying on remembered setup sequences.

## Non-Goals

- Do not change application behavior.
- Do not add dependency pin changes.
- Do not add deployment or packaging logic.
- Do not automatically start services after installation.
- Do not delete existing environments or caches.
- Do not hide installation failures behind retry loops.

## Approaches Considered

### Approach 1: One monolithic setup script

Pros:

- single command to remember

Cons:

- hard to troubleshoot partial failures
- less reusable when only one side needs refreshing

### Approach 2: Separate backend and frontend setup scripts only

Pros:

- clear boundaries
- simpler failure isolation

Cons:

- no “prepare everything” shortcut

### Approach 3: Per-area setup scripts plus one aggregate runner

Pros:

- easy to troubleshoot
- easy to rerun only the needed side
- still provides a full initialization command

Cons:

- one extra small file

## Recommended Approach

Use Approach 3.

Create three initialization helpers:

- `scripts/init-backend.sh`
- `scripts/init-frontend.sh`
- `scripts/init-all.sh`

This matches the same pattern already used successfully for startup and verification helpers.

## Scope

### Backend Initialization Helper

Create `scripts/init-backend.sh`.

Responsibilities:

- resolve the repo root
- use the bundled Python runtime:
  - `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`
- create `backend/.venv` if missing
- upgrade `pip`
- install `backend/requirements.txt`
- install `backend/requirements-dev.txt`

The script should be safe to rerun. Re-running should refresh dependencies rather than rebuilding unrelated state.

### Frontend Initialization Helper

Create `scripts/init-frontend.sh`.

Responsibilities:

- resolve the repo root
- prepend the bundled Node runtime directory when present
- use the bundled `pnpm` launcher
- install frontend dependencies in `frontend/`
- run `pnpm approve-builds --all`

The script should be safe to rerun after `node_modules` already exists.

### Aggregate Initialization Helper

Create `scripts/init-all.sh`.

Responsibilities:

- resolve the repo root
- call backend initialization first
- call frontend initialization second
- stop on the first failure

This should remain a thin orchestration script.

### Documentation

Update `README.md` with a short local initialization note near `快速开始`.

The README should point to:

- `scripts/init-backend.sh`
- `scripts/init-frontend.sh`
- `scripts/init-all.sh`

This note should clarify that these helpers capture the validated runtime setup for this derivative workspace and are especially useful on this machine where the system runtimes do not match project needs.

### Local Adoption Notes

Update `docs/local-adoption-notes.md` with one short line noting that repository-local initialization helpers now exist.

## Data Flow

No data flow changes.

The scripts only provision local dependencies using the already-approved runtime paths.

## Error Handling

The scripts should fail early with clear prerequisite messages when:

- the bundled Python runtime is missing
- the bundled `pnpm` launcher is missing
- no usable `node` command is available for the frontend install path

Each script should use `set -eu` so shell failures stop immediately.

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts and docs exist
- the existing acceptance suite
- backend offline tests
- frontend production build
- the aggregate verification helper after the new scripts are added

This phase should not try to reinstall the whole workspace from scratch during verification, because the current repo already has initialized environments and the goal here is to codify the setup path, not to stress-test package mirrors.

## Acceptance Criteria

- `scripts/init-backend.sh`, `scripts/init-frontend.sh`, and `scripts/init-all.sh` exist.
- The backend helper uses the bundled Python runtime and installs both runtime and dev requirements.
- The frontend helper uses the bundled `pnpm` path and includes `pnpm approve-builds --all`.
- `README.md` documents the local initialization helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- Existing acceptance, build, and backend offline verification still pass.
