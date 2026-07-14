# Investment News Static Share Design

## Background

The current `investment-news` workflow is optimized for local use:

- `server.py` serves the dashboard on `127.0.0.1:8793`
- refresh runs local fetch and digest scripts
- the final artifact is a browser page backed by local files

That works well for personal use, but it does not create a clean handoff for sharing the current dashboard with other people. A simple local URL cannot be opened by others, and the current directory mixes runtime files, scripts, and local-only behavior.

The user chose a fixed snapshot sharing model rather than a live-updating public site.

## Goal

Add a small export path that turns the current `investment-news` dashboard state into a clean static publishable package that can be uploaded to any static host and shared with others.

## Non-Goals

- Do not build a public live-refresh service.
- Do not add cloud deployment automation in this step.
- Do not change how the local dashboard works on `localhost`.
- Do not require a database, build system, or new third-party dependencies.
- Do not make the shared version regenerate news or AI summaries online.
- Do not redesign the dashboard UI.

## Recommended Approach

Create a repository-local export script that produces a dedicated static output directory from the already-generated snapshot.

Recommended behavior:

1. read the existing `index.html` and `data.js`
2. copy the files needed for static viewing into a clean share directory
3. disable or hide local-only refresh behavior in the shared output
4. leave links to original articles intact

This keeps the current dashboard architecture intact while creating a shareable artifact that is easy to upload to GitHub Pages, Vercel, Netlify, or any other static hosting provider.

## Scope

### Export Script

Add a small script under the `investment-news` project that generates a share-ready directory.

Recommended file:

- `scripts/export_static_share.py`

Responsibilities:

- resolve the project root
- validate that `index.html` and `data.js` exist
- create or replace a dedicated output directory
- write a static-safe HTML file for sharing
- copy `data.js` into the output directory

The script should be idempotent so it can be re-run whenever the local snapshot is updated.

### Output Directory

Create a clean export directory dedicated to publishable artifacts.

Recommended directory:

- `share_dist/`

The directory should contain only what a static host needs, for example:

- `index.html`
- `data.js`

No local scripts, config files, or server entry points should be included.

### Shared HTML Behavior

The shared `index.html` should preserve the current reading experience:

- sector navigation
- AI key points
- bilingual titles
- outbound links to source articles

The shared version should not present local-only refresh as if it still works publicly. The export step should either:

- remove the refresh button, or
- leave it visually present but disabled with clear static-share labeling

The preferred approach is to disable the refresh affordance clearly in the exported version while keeping the rest of the UI unchanged.

### Local Version Isolation

The export flow must not mutate the local source `index.html` in place.

The local dashboard should keep its current behavior, including local refresh support and localhost serving. Any static-share adjustment should happen only in the generated output.

### Documentation

Add a short usage note explaining:

- how to generate the share package
- where the output directory is created
- that the result is a fixed snapshot
- that publishing is done by uploading the output directory to a static host

This can live in the `investment-news` README or in a small adjacent note, depending on what fits the existing structure best.

## Data Flow

The data flow stays snapshot-based:

1. local `fetch.py` and `digest.py` generate the current `data.js`
2. export script packages that already-generated snapshot
3. the static host serves the exported files as read-only content

No new runtime data flow is introduced in the shared version.

## Error Handling

The export script should fail early with clear messages when:

- `data.js` is missing
- `index.html` is missing
- the output directory cannot be created

It should avoid partial silent output. If export fails, the user should know exactly which prerequisite is missing.

## Testing

Verification should include:

- source-level confirmation that the export script exists and targets a dedicated output directory
- a successful export run that produces `share_dist/index.html` and `share_dist/data.js`
- a static serving check that the exported directory can be opened without `server.py`
- confirmation that the exported page does not rely on `/api/refresh`
- confirmation that the local original `index.html` remains unchanged for localhost use

## Acceptance Criteria

- A one-command export path exists for generating a shareable static snapshot.
- Export output is written to a dedicated clean directory.
- The exported page can be hosted as plain static files.
- The exported page still displays the current dashboard content and source links.
- The exported page does not expose a misleading working refresh action.
- The local dashboard workflow remains unchanged.
