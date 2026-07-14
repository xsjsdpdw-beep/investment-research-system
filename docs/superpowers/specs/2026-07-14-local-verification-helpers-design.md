# Local Verification Helpers Design

## Background

The repository now has stable local startup helpers:

- `scripts/dev-backend.sh`
- `scripts/dev-frontend.sh`

That removed the most annoying manual runtime knowledge for starting the app. The next repeated pain point is verification.

Today the known-good local verification flow still depends on remembering several separate commands:

- frontend acceptance assertions
- frontend production build with the bundled Node runtime on `PATH`
- backend offline test suite

These commands are already validated, but they still live mostly in notes, plans, and recent shell history rather than repository-owned entry points.

## Goal

Add repository-local verification helpers so this workspace has stable, reusable commands for:

- frontend acceptance checks
- frontend production build verification
- backend offline regression checks
- running the full local verification chain in one command

## Non-Goals

- Do not change application behavior.
- Do not replace upstream test commands for other environments.
- Do not add CI configuration.
- Do not add live-network smoke tests to the default verification path.
- Do not add dependency installation or bootstrap logic in this phase.

## Approaches Considered

### Approach 1: One monolithic verification script

Pros:

- only one command to remember

Cons:

- hard to isolate failures quickly
- less reusable when only one area needs to be rechecked

### Approach 2: Only per-area scripts

Pros:

- failure scope is very clear
- each script has one obvious responsibility

Cons:

- still no single “run everything” entry point

### Approach 3: Per-area scripts plus one aggregator

Pros:

- preserves clear boundaries
- adds a simple full-check command
- easiest to extend later

Cons:

- adds one extra file compared with the absolute minimum

## Recommended Approach

Use Approach 3.

Create three focused verification helpers and one aggregate runner:

- `scripts/check-acceptance.sh`
- `scripts/check-frontend-build.sh`
- `scripts/check-backend.sh`
- `scripts/check-all.sh`

This keeps the scripts small, readable, and easy to troubleshoot while also giving the workspace one reliable “full local verification” command.

## Scope

### Acceptance Helper

Create `scripts/check-acceptance.sh`.

Responsibilities:

- resolve the repo root
- require `backend/.venv/bin/python`
- run `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

### Frontend Build Helper

Create `scripts/check-frontend-build.sh`.

Responsibilities:

- resolve the repo root
- prepend the bundled Node runtime directory when present
- require `frontend/node_modules`
- run the existing production build via `pnpm run build`

The script should encode the same workspace runtime handling already used successfully in manual verification.

### Backend Offline Helper

Create `scripts/check-backend.sh`.

Responsibilities:

- resolve the repo root
- require `backend/.venv/bin/pytest`
- run `backend/.venv/bin/pytest -m "not live"` from `backend/`

### Aggregate Helper

Create `scripts/check-all.sh`.

Responsibilities:

- resolve the repo root
- call the three focused helpers in sequence
- stop on first failure

This script should stay intentionally thin. It is an orchestration entry point, not a new test harness.

### Documentation

Update `README.md` with a short local verification note near the testing section.

The README should point to:

- `scripts/check-acceptance.sh`
- `scripts/check-frontend-build.sh`
- `scripts/check-backend.sh`
- `scripts/check-all.sh`

### Local Adoption Notes

Update `docs/local-adoption-notes.md` with one short line noting that repository-local verification helpers now exist.

## Data Flow

No data flow changes.

The new scripts only wrap already-approved verification commands.

## Error Handling

Each focused helper should fail early with a clear message when its prerequisite is missing:

- backend python or pytest missing
- frontend dependencies missing
- usable `node` runtime missing for the frontend build helper

The aggregate helper should rely on `set -eu` and stop at the first failing sub-check.

## Testing

Verification should include:

- acceptance tests that assert the helper scripts and docs exist
- the acceptance helper itself
- the frontend build helper itself
- the backend offline helper itself
- the aggregate helper itself

## Acceptance Criteria

- The repository contains the four verification helpers.
- Each helper points at the intended local command.
- `README.md` documents the local verification helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- Running `scripts/check-all.sh` successfully executes acceptance, frontend build, and backend offline verification in sequence.
