# Local Doctor Helpers Design

## Background

The repository now has local helper entry points for:

- initialization
- startup
- stop and restart
- status checks
- log inspection
- verification

That already covers the main operational workflow, but one remaining high-frequency local need is a compact environment summary.

Today, answering “is this workspace basically healthy?” still means combining several checks mentally:

- are the bundled runtimes present
- does `backend/.venv` exist
- does `frontend/node_modules` exist
- are backend and frontend running
- are the expected `/tmp/` log files present

All the information is available, but it is spread across multiple helpers.

## Goal

Add repository-local doctor helpers so the current local environment readiness can be summarized through stable script entry points.

## Non-Goals

- Do not change application behavior.
- Do not add automatic repair logic.
- Do not install missing dependencies automatically.
- Do not restart services automatically.
- Do not replace the focused helpers already in the repo.

## Approaches Considered

### Approach 1: One doctor-all script only

Pros:

- smallest possible surface area

Cons:

- no focused per-service environment check
- harder to reuse or extend later

### Approach 2: Only per-area doctor helpers

Pros:

- clear separation between backend and frontend diagnosis

Cons:

- no single summary command

### Approach 3: Per-area doctor helpers plus one aggregate summary

Pros:

- easy targeted diagnosis
- easy top-level summary
- consistent with the helper pattern already used elsewhere

Cons:

- a few extra small files

## Recommended Approach

Use Approach 3.

Create three doctor helpers:

- `scripts/doctor-backend.sh`
- `scripts/doctor-frontend.sh`
- `scripts/doctor-all.sh`

## Scope

### Backend Doctor Helper

Create `scripts/doctor-backend.sh`.

Responsibilities:

- check for the bundled Python runtime path
- check for `backend/.venv/bin/python`
- check whether something is listening on `127.0.0.1:8900`
- check whether `/tmp/vibe-research-backend.log` exists
- print a compact human-readable summary

### Frontend Doctor Helper

Create `scripts/doctor-frontend.sh`.

Responsibilities:

- check for the bundled Node runtime path
- check for the bundled `pnpm` launcher
- check for `frontend/node_modules`
- check whether something is listening on `127.0.0.1:5899`
- check whether `/tmp/vibe-research-frontend.log` exists
- print a compact human-readable summary

### Aggregate Doctor Helper

Create `scripts/doctor-all.sh`.

Responsibilities:

- resolve the repo root
- call `doctor-backend.sh`
- call `doctor-frontend.sh`

This helper should remain thin and simply compose the two per-area summaries.

## Data Flow

No data flow changes.

These scripts only inspect existing runtime paths, directories, listeners, and log files.

## Error Handling

The doctor helpers should:

- use `set -eu`
- avoid failing on “not ready” cases
- represent missing pieces as readable status lines instead of hard errors

These are diagnostic tools, so partial readiness should be reported, not crash the script.

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts and docs exist
- the existing acceptance suite
- a live doctor validation after `restart-all.sh`

## Acceptance Criteria

- `scripts/doctor-backend.sh`, `scripts/doctor-frontend.sh`, and `scripts/doctor-all.sh` exist.
- The backend doctor helper checks the bundled Python runtime, backend venv, port `8900`, and backend log path.
- The frontend doctor helper checks the bundled Node runtime, bundled `pnpm`, `frontend/node_modules`, port `5899`, and frontend log path.
- The aggregate helper composes the two per-area doctor helpers.
- `README.md` documents the doctor helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- A live doctor validation succeeds while services are running.
