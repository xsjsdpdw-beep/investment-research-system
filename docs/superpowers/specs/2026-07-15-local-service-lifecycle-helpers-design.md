# Local Service Lifecycle Helpers Design

## Background

The repository now has local helper entry points for:

- initialization
- startup
- verification

The remaining repeated manual step is service lifecycle management after the app is already running.

Today, stopping or refreshing the local services still depends on manual port inspection and ad hoc process management:

- backend listens on `127.0.0.1:8900`
- frontend listens on `127.0.0.1:5899`
- replacing running processes requires finding and killing listeners by hand

That is manageable once, but annoying to repeat.

## Goal

Add repository-local service lifecycle helpers so the local backend and frontend can be stopped or fully restarted through stable script entry points instead of manual port hunting.

## Non-Goals

- Do not change backend or frontend application behavior.
- Do not add a supervisor or background daemon manager.
- Do not add long-lived PID-file orchestration.
- Do not change the startup scripts themselves beyond reusing them.
- Do not add log rotation or deployment logic.

## Approaches Considered

### Approach 1: One restart-all script only

Pros:

- smallest surface area

Cons:

- no clean targeted stop command
- awkward when only one service should be stopped

### Approach 2: Separate stop scripts only

Pros:

- simple and explicit

Cons:

- no one-command refresh path

### Approach 3: Per-service stop helpers plus aggregate stop/restart helpers

Pros:

- easy targeted control
- easy full refresh
- thin wrappers around already-proven startup commands

Cons:

- a few extra small files

## Recommended Approach

Use Approach 3.

Create four lifecycle helpers:

- `scripts/stop-backend.sh`
- `scripts/stop-frontend.sh`
- `scripts/stop-all.sh`
- `scripts/restart-all.sh`

This covers the most frequent local workflow without introducing a heavier service-management system.

## Scope

### Backend Stop Helper

Create `scripts/stop-backend.sh`.

Responsibilities:

- resolve the repo root
- find listeners on `127.0.0.1:8900`
- stop them if present
- succeed cleanly when nothing is running

The script should be idempotent and safe to rerun.

### Frontend Stop Helper

Create `scripts/stop-frontend.sh`.

Responsibilities:

- resolve the repo root
- find listeners on `127.0.0.1:5899`
- stop them if present
- succeed cleanly when nothing is running

The script should also be idempotent.

### Aggregate Stop Helper

Create `scripts/stop-all.sh`.

Responsibilities:

- resolve the repo root
- call `stop-backend.sh`
- call `stop-frontend.sh`

### Aggregate Restart Helper

Create `scripts/restart-all.sh`.

Responsibilities:

- resolve the repo root
- stop both services first
- relaunch backend and frontend in the background using the existing startup helpers
- wait briefly for endpoints to come back
- verify:
  - backend health on `http://127.0.0.1:8900/api/health`
  - frontend root on `http://127.0.0.1:5899`

The restart helper may use lightweight local log files under `/tmp/` for the launch commands, but it should not introduce new repository state.

## Data Flow

No data flow changes.

These scripts only manage local service processes using the already-approved ports and startup helpers.

## Error Handling

The stop helpers should:

- succeed when no listener exists
- fail clearly if `lsof` or `kill` fails unexpectedly

The restart helper should:

- stop on launch failures
- fail if backend health does not return
- fail if the frontend root does not return

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts and docs exist
- the existing acceptance suite
- one live lifecycle check:
  - call `restart-all.sh`
  - confirm backend health returns `investment-research-api`
  - confirm the frontend root returns HTML containing `投研体系`

## Acceptance Criteria

- `scripts/stop-backend.sh`, `scripts/stop-frontend.sh`, `scripts/stop-all.sh`, and `scripts/restart-all.sh` exist.
- The stop helpers target ports `8900` and `5899`.
- The restart helper reuses the existing startup helpers.
- `README.md` documents the lifecycle helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- A live restart validation succeeds for both services.
