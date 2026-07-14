# Data Storage Map Design

## Background

The project has already completed three low-risk local adaptation steps:

- upstream import and local bootstrapping
- runtime branding customization
- frontend config consolidation

The next useful step is not a migration. It is a documentation pass that makes the current storage model easy to understand.

Today, project data is split across two categories:

- backend-managed files in the user directory, mainly under `~/.vibe-research/`
- browser-managed local data in `localStorage`

The code already documents parts of this behavior inline, but the storage picture is still scattered across multiple files. That makes backup, onboarding, and future migration work harder than it needs to be.

## Goal

Add a single repository document that explains where data currently lives, which parts are configurable, which parts remain compatibility-preserving, and what should be backed up.

## Non-Goals

- Do not change any storage behavior.
- Do not rename `~/.vibe-research`.
- Do not migrate browser `localStorage` keys.
- Do not change backend environment-variable behavior.
- Do not change frontend code.
- Do not add an in-app UI entry for this documentation.

## Recommended Approach

Create a standalone document at `docs/data-storage-map.md`.

This document should be practical and repo-local. It should describe the current storage system as it exists today, not propose a new storage model.

A separate document is better than expanding `local-adoption-notes.md` because:

- the storage map becomes easy to find later
- the adoption notes stay focused on rollout status
- future migration work can reference the storage map directly

## Scope

### New Storage Map Document

Create `docs/data-storage-map.md`.

The document should be structured around current storage surfaces:

1. backend file data
2. browser local data
3. environment-variable overrides
4. compatibility and migration notes
5. backup guidance

### Backend File Data Section

Document at least these items:

- portfolio data:
  - default path `~/.vibe-research/portfolio.json`
  - override via `VR_DATA_DIR`
  - old in-repo cache path was `backend/.cache/portfolio.json`
- report files:
  - default path `~/.vibe-research/myreports/`
  - override via `VR_REPORTS_DIR`
  - `VR_DATA_DIR` also changes the default root when `VR_REPORTS_DIR` is unset
  - old in-repo cache path was `backend/.cache/myreports/`

The document should also say clearly that these locations are outside the repo folder and therefore survive re-downloading or replacing the workspace.

### Browser Local Data Section

Document at least these items:

- watchlist: `vr-watchlist`
- research notes: `vr-notes`
- AI config: `vr-llm`
- backend access key: `vr-access-key`
- theme: `vr-theme`
- sidebar state: `vr-sidebar`

For each item, explain briefly what it stores and that it lives in the browser rather than in the repo or backend user directory.

### Environment Variable Section

Document the current storage-related environment variables:

- `VR_DATA_DIR`
- `VR_REPORTS_DIR`

It is acceptable to mention `VR_API_KEY` only as a security setting, but it should not be treated as data-path configuration.

### Compatibility Section

Explain that current path names and browser key names are intentionally preserved for compatibility:

- `~/.vibe-research` remains unchanged
- browser keys still use the `vr-` prefix
- this stage documents the current layout rather than renaming it

### Backup Guidance Section

Add practical backup advice:

- to preserve backend-managed files, back up the relevant user directory content
- to preserve browser-only data, back up the browser profile or export later through a future workflow

Avoid overpromising. The doc should not claim browser data is automatically synchronized or exported.

### Local Adoption Notes

Update `docs/local-adoption-notes.md` with one short status line indicating that the storage map document now exists.

## Data Flow

No data flow changes.

The backend continues to read and write the same files. The frontend continues to use the same `localStorage` keys. The change is documentation-only.

## Error Handling

No runtime error-handling changes are expected.

The main risk is documentation drift or overstatement. To avoid that, the document should stay narrowly grounded in the current code paths and key names.

## Testing

Verification should include:

- a documentation acceptance test that checks `docs/data-storage-map.md` exists and mentions the required storage paths and keys
- existing branding/config acceptance tests
- backend offline tests, since they are already part of the repo confidence loop

## Acceptance Criteria

- `docs/data-storage-map.md` exists.
- The document clearly separates backend file data from browser local data.
- The document mentions:
  - `~/.vibe-research/portfolio.json`
  - `~/.vibe-research/myreports/`
  - `VR_DATA_DIR`
  - `VR_REPORTS_DIR`
  - `vr-watchlist`
  - `vr-notes`
  - `vr-llm`
  - `vr-access-key`
  - `vr-theme`
  - `vr-sidebar`
- `docs/local-adoption-notes.md` mentions that the storage map document has been added.
- No storage behavior is changed.
