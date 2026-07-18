# Task 3 Report: Generic HBM Draft Block Router

## Scope

- Limited the change to `行业概览 -> HBM -> 初稿`.
- Kept the existing tab-based `IndustryDraftCanvas` interaction model.
- Did not modify any `深度` rendering or non-HBM industry default rendering.

## Implementation

- Added `getIndustryDraftBlockComponent()` and `renderIndustryDraftBlock()` to route all first-phase block types through the generic renderer path.
- Retained the narrow compatibility renderer for Task 2 block types that do not receive their polished Task 4 visual implementation yet.
- Added `mapLegacyHbmDashboardToCanvas()` for legacy `hbm_draft_dashboard` payloads, including the older `label + sections` tab shape.
- Kept the existing `industry_draft_canvas.cards[]` migration path and made HBM legacy adaptation produce `version: "v2"` block-first canvases.
- Changed `Framework.tsx` so the HBM initial-draft branch maps or migrates its persisted payload before it reaches `IndustryDraftCanvas`.
- Retained `HBMDraftDashboard` as a compatibility wrapper that now passes a mapped canvas.

## Tests

- Added block-router coverage in `frontend/tests/industry-draft-blocks.test.mjs`.
- Added legacy HBM adapter coverage in `frontend/tests/hbm-draft-dashboard.test.mjs`.
- Focused suite passed: 23 tests, 0 failures.
- TypeScript project build passed with `tsc -b frontend`.

## Verification Limitation

- The requested bare `node` command could not run because `node` is absent from PATH. The Codex-bundled Node binary was used instead.
- `vite build` could not complete because the existing Rollup optional native dependency fails macOS code-signature loading (`@rollup/rollup-darwin-x64`); this occurred after TypeScript compilation and is unrelated to this change.

## Review Follow-up

- Fixed mixed legacy HBM payload mapping so every tab independently selects its adapter.
- Tabs with valid `sections` continue through the section-to-block mapper.
- Tabs without `sections` now use the existing classic HBM adapter semantics on a single-tab payload, preserving hero, metrics, timelines, ranges, chains, comparisons, and evidence blocks.
- Added a regression test with one section-based tab and one classic tab; both retain their expected block content.
- Follow-up verification passed: 14 tests, TypeScript project check, and `git diff --check`.
