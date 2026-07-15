# Local Service Status Helpers Design

## Background

The repository now has local helper entry points for:

- initialization
- startup
- service stop and restart
- verification

That covers the main local workflow, but one high-frequency step still relies on manual inspection:

- checking whether the backend is running
- checking whether the frontend is running
- confirming whether the backend health endpoint is actually healthy

Right now, this still means using `lsof`, `ps`, or opening URLs manually.

## Goal

Add repository-local status helpers so the current state of the local backend and frontend can be checked through stable script entry points.

## Non-Goals

- Do not change application behavior.
- Do not add background monitoring.
- Do not add recurring health polling.
- Do not add notifications or desktop integration.
- Do not change startup, stop, or restart behavior.

## Approaches Considered

### Approach 1: One `status-all` script only

Pros:

- smallest surface area

Cons:

- no focused per-service checks
- harder to reuse in scripts or troubleshooting

### Approach 2: Per-service status helpers only

Pros:

- clear boundaries
- easier targeted checks

Cons:

- no one-command overview

### Approach 3: Per-service status helpers plus one aggregate view

Pros:

- easy targeted checks
- easy one-command overview
- consistent with the helper pattern already used elsewhere

Cons:

- a few extra small files

## Recommended Approach

Use Approach 3.

Create three status helpers:

- `scripts/status-backend.sh`
- `scripts/status-frontend.sh`
- `scripts/status-all.sh`

## Scope

### Backend Status Helper

Create `scripts/status-backend.sh`.

Responsibilities:

- resolve the repo root
- inspect whether anything is listening on `127.0.0.1:8900`
- if present, report the PID
- check `http://127.0.0.1:8900/api/health`
- print a small human-readable status summary

It should distinguish between:

- port not listening
- port listening but health check failing
- port listening and health check healthy

### Frontend Status Helper

Create `scripts/status-frontend.sh`.

Responsibilities:

- resolve the repo root
- inspect whether anything is listening on `127.0.0.1:5899`
- if present, report the PID
- attempt to fetch `http://127.0.0.1:5899`
- print a small human-readable status summary

It should distinguish between:

- port not listening
- port listening but HTTP root not reachable
- port listening and app root reachable

### Aggregate Status Helper

Create `scripts/status-all.sh`.

Responsibilities:

- resolve the repo root
- call `status-backend.sh`
- call `status-frontend.sh`

This helper should remain thin and simply compose the per-service status scripts.

## Data Flow

No data flow changes.

The scripts only inspect existing local listeners and endpoints.

## Error Handling

The scripts should:

- use `set -eu`
- avoid failing on “service not running” cases
- only fail for genuine script/runtime issues

The status scripts are diagnostic tools, so “not running” should be represented as output, not a hard failure.

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts and docs exist
- the existing acceptance suite
- a live status validation after `restart-all.sh`

## Acceptance Criteria

- `scripts/status-backend.sh`, `scripts/status-frontend.sh`, and `scripts/status-all.sh` exist.
- The backend status helper checks port `8900` and `/api/health`.
- The frontend status helper checks port `5899`.
- The aggregate helper composes the two per-service helpers.
- `README.md` documents the status helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- A live status validation succeeds after services are running.
