# High-Frequency Entry Prioritization Design

## Background

The local adaptation work has already completed:

- upstream import and local bootstrapping
- runtime branding customization
- frontend config consolidation
- storage-layout documentation
- AI config consolidation

The next approved step is a light navigation refinement for daily use.

Today the app already redirects `/` to `每日复盘`, which matches the user's preferred starting point. The remaining friction is inside the first screen and the sidebar: several high-frequency pages are available, but not grouped in the order the local workflow uses most often.

## Goal

Make the highest-frequency research entry points easier to reach without changing routing, data flow, or major architecture.

## Non-Goals

- Do not change the root route away from `/daily-review`.
- Do not add new pages.
- Do not change backend APIs or storage behavior.
- Do not redesign the whole sidebar.
- Do not replace the existing `每日复盘` page structure.

## Approved Approach

Keep the homepage entry unchanged and make two small frontend refinements:

1. reorder the sidebar so the most-used research pages appear earlier
2. add a light quick-entry module near the top of `每日复盘`

This preserves the current mental model:

- opening the app still lands on `每日复盘`
- the sidebar becomes more task-oriented
- the first screen offers one-click access to adjacent workflows

## Scope

### Root Route

Keep the current redirect:

- `/` -> `/daily-review`

No route changes are needed.

### Sidebar Navigation Order

Update the primary sidebar order so the first group reflects the approved local workflow priority:

1. `每日复盘`
2. `自选股`
3. `我的持仓`
4. `个股数据`
5. `研究记录`
6. `资讯雷达`

After that, keep the remaining items in a stable order:

- `板块中心`
- `我的研报`
- `接入 AI`

This is an ordering-only change. Existing routes, labels, icons, and nested board shortcuts remain in place.

### DailyReview Quick Entry Module

Add a lightweight quick-entry area within the first screen of `frontend/src/pages/DailyReview.tsx`, directly below the page header and above the market index section.

The module should link to:

- `自选股`
- `我的持仓`
- `个股数据`
- `研究记录`

The module should feel like a navigation aid, not a new dashboard:

- compact layout
- short explanatory copy
- existing visual language only
- no new data dependency
- no async behavior

## Data Flow

No data flow changes.

The sidebar remains static config. The new quick-entry module is plain client-side routing links.

## Error Handling

No new runtime edge cases are expected.

The quick-entry module should degrade naturally because it only renders static links. The main implementation risk is accidental route or label drift, which can be covered with source-level acceptance tests.

## Testing

Verification should include:

- an acceptance test that locks the approved sidebar ordering
- an acceptance test that checks `每日复盘` contains the four quick-entry links
- the existing acceptance suite
- a frontend production build

## Acceptance Criteria

- `/` still redirects to `/daily-review`.
- The sidebar places `每日复盘`, `自选股`, `我的持仓`, `个股数据`, `研究记录`, and `资讯雷达` ahead of the lower-frequency entries.
- `每日复盘` shows a quick-entry module near the top of the page.
- The quick-entry module links to `自选股`, `我的持仓`, `个股数据`, and `研究记录`.
- No backend behavior changes.
- No storage behavior changes.
