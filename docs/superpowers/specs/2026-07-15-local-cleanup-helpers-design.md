# Local Cleanup Helpers Design

## Background

The repository now has local helper entry points for:

- initialization
- startup
- stop and restart
- status checks
- log inspection
- doctor summaries
- verification

The remaining repeated operational step is cleanup.

Today, resetting the local runtime to a clean post-run state still means manually combining a few actions:

- stop backend and frontend
- remove `/tmp/vibe-research-backend.log`
- remove `/tmp/vibe-research-frontend.log`

That is simple, but still repetitive and easy to forget.

## Goal

Add repository-local cleanup helpers so temporary runtime artifacts and running local services can be reset through stable script entry points.

## Non-Goals

- Do not delete user data under `~/.vibe-research/`.
- Do not remove `backend/.venv`.
- Do not remove `frontend/node_modules`.
- Do not clear source-controlled files.
- Do not change runtime logging behavior.

## Approaches Considered

### Approach 1: One cleanup-all script only

Pros:

- smallest surface area

Cons:

- no focused per-service cleanup
- awkward when only one log file should be cleared

### Approach 2: Per-service cleanup helpers only

Pros:

- clear and focused

Cons:

- no one-command local reset

### Approach 3: Per-service cleanup helpers plus one aggregate reset helper

Pros:

- supports targeted cleanup
- supports full local reset
- consistent with the helper pattern already used elsewhere

Cons:

- a few extra small files

## Recommended Approach

Use Approach 3.

Create three cleanup helpers:

- `scripts/clean-backend.sh`
- `scripts/clean-frontend.sh`
- `scripts/clean-all.sh`

## Scope

### Backend Cleanup Helper

Create `scripts/clean-backend.sh`.

Responsibilities:

- stop the backend if it is running by reusing `scripts/stop-backend.sh`
- remove `/tmp/vibe-research-backend.log` if present
- print a small human-readable summary

The helper should succeed even if the backend is already stopped or the log file is already absent.

### Frontend Cleanup Helper

Create `scripts/clean-frontend.sh`.

Responsibilities:

- stop the frontend if it is running by reusing `scripts/stop-frontend.sh`
- remove `/tmp/vibe-research-frontend.log` if present
- print a small human-readable summary

The helper should also be idempotent.

### Aggregate Cleanup Helper

Create `scripts/clean-all.sh`.

Responsibilities:

- resolve the repo root
- call `clean-backend.sh`
- call `clean-frontend.sh`

This helper should remain thin and simply compose the two focused cleanup helpers.

## Data Flow

No data flow changes.

These scripts only stop local listeners and remove the temporary log files already used by startup and restart helpers.

## Error Handling

The cleanup helpers should:

- use `set -eu`
- not fail when services are already stopped
- not fail when log files are already absent
- print readable “already stopped” or “already clean” style messages

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts and docs exist
- the existing acceptance suite
- a live cleanup validation:
  - ensure services/logs exist first
  - run `clean-all.sh`
  - confirm services are stopped and temp logs are removed
  - restart services afterward

## Acceptance Criteria

- `scripts/clean-backend.sh`, `scripts/clean-frontend.sh`, and `scripts/clean-all.sh` exist.
- The backend cleanup helper targets `/tmp/vibe-research-backend.log` and reuses `stop-backend.sh`.
- The frontend cleanup helper targets `/tmp/vibe-research-frontend.log` and reuses `stop-frontend.sh`.
- The aggregate helper composes the two focused cleanup helpers.
- `README.md` documents the cleanup helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- A live cleanup validation succeeds and services can be restored afterward.
