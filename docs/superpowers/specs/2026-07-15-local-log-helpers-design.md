# Local Log Helpers Design

## Background

The repository now has local helper entry points for:

- initialization
- startup
- stop and restart
- status checks
- verification

The next repeated local operation during troubleshooting is log inspection.

Today, checking logs still depends on manually remembering the temporary files used by the startup and restart flow:

- `/tmp/vibe-research-backend.log`
- `/tmp/vibe-research-frontend.log`

That is lightweight, but it is still one more piece of local knowledge that is not yet encoded in repository-owned entry points.

## Goal

Add repository-local log helpers so backend and frontend runtime logs can be viewed through stable script entry points.

## Non-Goals

- Do not change runtime logging behavior.
- Do not introduce persistent repo log files.
- Do not add log rotation.
- Do not add background log streaming daemons.
- Do not change where startup and restart currently write logs.

## Approaches Considered

### Approach 1: One combined log script only

Pros:

- smallest surface area

Cons:

- awkward when only one service log matters
- harder to script targeted debugging

### Approach 2: Separate per-service log helpers only

Pros:

- focused and explicit
- easy targeted inspection

Cons:

- no one-command overview

### Approach 3: Per-service log helpers plus one aggregate helper

Pros:

- supports targeted inspection
- supports quick overview
- consistent with the helper pattern already used elsewhere

Cons:

- a few extra small files

## Recommended Approach

Use Approach 3.

Create three log helpers:

- `scripts/log-backend.sh`
- `scripts/log-frontend.sh`
- `scripts/log-all.sh`

## Scope

### Backend Log Helper

Create `scripts/log-backend.sh`.

Responsibilities:

- resolve the current backend log path:
  - `/tmp/vibe-research-backend.log`
- print a small header
- show the most recent backend log lines

The helper should succeed even if the log file does not exist yet, and clearly say so.

### Frontend Log Helper

Create `scripts/log-frontend.sh`.

Responsibilities:

- resolve the current frontend log path:
  - `/tmp/vibe-research-frontend.log`
- print a small header
- show the most recent frontend log lines

The helper should also succeed cleanly if the log file does not exist yet.

### Aggregate Log Helper

Create `scripts/log-all.sh`.

Responsibilities:

- resolve the repo root
- call `log-backend.sh`
- call `log-frontend.sh`

The helper should remain thin and simply compose the two per-service log viewers.

## Data Flow

No data flow changes.

These scripts only read the existing temporary log files already used by startup and restart helpers.

## Error Handling

The log helpers should:

- use `set -eu`
- not fail when the target log file is absent
- print a clear “log not found yet” style message instead

These are inspection helpers, so missing logs should be treated as a readable status, not a hard error.

## Testing

Verification should include:

- source-level acceptance tests that assert the helper scripts and docs exist
- the existing acceptance suite
- a live log validation after `restart-all.sh`

## Acceptance Criteria

- `scripts/log-backend.sh`, `scripts/log-frontend.sh`, and `scripts/log-all.sh` exist.
- The backend log helper points at `/tmp/vibe-research-backend.log`.
- The frontend log helper points at `/tmp/vibe-research-frontend.log`.
- The aggregate helper composes the two per-service log helpers.
- `README.md` documents the log helpers.
- `docs/local-adoption-notes.md` records the new helper entry points.
- A live log validation succeeds after services are running.
