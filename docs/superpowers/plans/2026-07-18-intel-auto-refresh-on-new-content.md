# Intel Auto Refresh On New Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Intel page silently auto-refresh only when genuinely new news content appears while the user is staying on `/intel`.

**Architecture:** Reuse the existing Intel load pipeline, but add a small content-signature helper and a lightweight polling loop that first checks `radar.generated_at`, then compares a stable signature of displayed news content before deciding whether to trigger a silent reload. Keep failures non-blocking and avoid any refresh when content is unchanged.

**Tech Stack:** React, TypeScript, React Router, native timers, existing API client in `frontend/src/lib/api.ts`, Node `node:test` regression tests, Vite build verification

## Global Constraints

- Only run automatic detection while the top-level route is `/intel`.
- Only auto-refresh when news content actually changes, not merely when `radar.generated_at` changes.
- Keep polling low-frequency and silent; do not show periodic error toasts for poll failures.
- Reuse the current Intel loading pipeline instead of creating a second page-data fetch path.
- Preserve the current manual-refresh fallback behavior when strong refresh requests fail.

---

## File Structure

- Create: `frontend/src/lib/intel-content-signature.ts`
  - Builds a stable comparable signature from the Intel news content actually shown to the user.
- Modify: `frontend/src/lib/intel-refresh.ts`
  - Return enough lightweight state for change detection and add helper support if needed.
- Modify: `frontend/src/pages/Intel.tsx`
  - Store current radar timestamp/signature, poll while on `/intel`, compare updates, and trigger silent refresh only when content differs.
- Modify: `frontend/tests/intel-refresh.test.mjs`
  - Extend refresh workflow regression coverage if helper interfaces change.
- Create: `frontend/tests/intel-content-signature.test.mjs`
  - Verify signature behavior for unchanged versus changed news content.

### Task 1: Add A Stable Intel Content Signature Helper

**Files:**
- Create: `frontend/src/lib/intel-content-signature.ts`
- Create: `frontend/tests/intel-content-signature.test.mjs`

**Interfaces:**
- Consumes:
  - `ResearchHubData`
- Produces:
  - `export function buildIntelContentSignature(hub: ResearchHubData | null): string`

- [ ] **Step 1: Write a failing signature test for identical content**

```js
import test from "node:test";
import assert from "node:assert/strict";

import { buildIntelContentSignature } from "../src/lib/intel-content-signature.ts";

test("identical intel content produces identical signatures", () => {
  const hub = makeHub({
    tech: [{ title: "A", url: "u1", time: "t1", source: "s1" }],
    macro: [{ title: "B", url: "u2", time: "t2", source: "s2" }],
  });

  assert.equal(buildIntelContentSignature(hub), buildIntelContentSignature(hub));
});
```

- [ ] **Step 2: Run the signature test to verify it fails**

Run: `node --test --experimental-strip-types /Users/leo/Documents/投研体系/frontend/tests/intel-content-signature.test.mjs`

Expected: FAIL with module-not-found for `intel-content-signature.ts`

- [ ] **Step 3: Implement the minimal signature helper**

```ts
import type { ResearchHubData } from "@/lib/api";

export function buildIntelContentSignature(hub: ResearchHubData | null): string {
  if (!hub) return "";

  const rows = [
    ...(hub.fundamental.global_tech_headlines ?? []).map((item) => ["tech", item.industry_key, item.title, item.url, item.time, item.source].join("|")),
    ...(hub.fundamental.macro_events ?? []).flatMap((group) => (group.items ?? []).map((item) => ["macro", group.key, item.title, item.url, item.time, item.source].join("|"))),
    ...(hub.fundamental.industry_dynamics ?? []).flatMap((group) => (group.items ?? []).map((item) => ["industry", group.key, item.title, item.url, item.time, item.source].join("|"))),
    ...(hub.fundamental.stock_topics ?? []).flatMap((group) => (group.items ?? []).map((item) => ["stock-topic", group.key, item.title, item.url, item.time, item.source].join("|"))),
    ...(hub.fundamental.stock_dynamics ?? []).map((item) => ["stock-dynamic", item.ticker, item.name, ...(item.highlights ?? [])].join("|")),
    ...(hub.fundamental.geopolitics.items ?? []).map((item) => ["geopolitics", item.industry_key || "", item.title, item.url || "", item.time || "", item.source || ""].join("|")),
  ];

  return rows.join("\n");
}
```

- [ ] **Step 4: Extend the test to prove changed content changes the signature**

```js
test("changed intel content produces a different signature", () => {
  const before = makeHub({
    tech: [{ title: "Old", url: "u1", time: "t1", source: "s1" }],
  });
  const after = makeHub({
    tech: [{ title: "New", url: "u1", time: "t1", source: "s1" }],
  });

  assert.notEqual(buildIntelContentSignature(before), buildIntelContentSignature(after));
});
```

- [ ] **Step 5: Run the signature test to verify it passes**

Run: `node --test --experimental-strip-types /Users/leo/Documents/投研体系/frontend/tests/intel-content-signature.test.mjs`

Expected: PASS with both signature tests green

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/intel-content-signature.ts frontend/tests/intel-content-signature.test.mjs
git commit -m "feat: add intel content signature helper"
```

### Task 2: Expose Poll-Friendly Intel Refresh State

**Files:**
- Modify: `frontend/src/lib/intel-refresh.ts`
- Modify: `frontend/tests/intel-refresh.test.mjs`

**Interfaces:**
- Consumes:
  - `RadarData`
  - existing `runIntelRefresh(...)` inputs
- Produces:
  - `runIntelRefresh(...)` still returning existing shape
  - stable `radarGeneratedAt` and `refreshError` semantics preserved for polling callers

- [ ] **Step 1: Add a failing regression test for “refresh result carries enough state for polling”**

```js
test("manual refresh returns radar timestamp for downstream poll comparison", async () => {
  const result = await runIntelRefresh({
    forceRadarRefresh: true,
    refreshRadar: async () => ({ generated_at: "2026-07-18 20:00" }),
    loadRadar: async () => ({ generated_at: "2026-07-18 19:59" }),
    // remaining minimal loaders...
  });

  assert.equal(result.radarGeneratedAt, "2026-07-18 20:00");
  assert.equal(result.refreshError, null);
});
```

- [ ] **Step 2: Run the refresh workflow tests**

Run: `node --test --experimental-strip-types /Users/leo/Documents/投研体系/frontend/tests/intel-refresh.test.mjs`

Expected: FAIL only if the newly asserted polling fields are missing or wrong

- [ ] **Step 3: Keep `runIntelRefresh` return contract explicit and minimal**

```ts
export type IntelRefreshResult = {
  hubData: ResearchHubData;
  overview: MarketOverview | null;
  globals: GlobalIndex[];
  turnover: TurnoverTop | null;
  configData: NewsRadarConfig | null;
  stockFeeds: IntelStockFeedItem[];
  radarGeneratedAt: string | null;
  refreshError: string | null;
};
```

- [ ] **Step 4: Re-run the refresh workflow tests**

Run: `node --test --experimental-strip-types /Users/leo/Documents/投研体系/frontend/tests/intel-refresh.test.mjs`

Expected: PASS with all refresh workflow tests green

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/intel-refresh.ts frontend/tests/intel-refresh.test.mjs
git commit -m "test: lock intel refresh polling contract"
```

### Task 3: Auto-Refresh Intel Only On New Content

**Files:**
- Modify: `frontend/src/pages/Intel.tsx`
- Modify: `frontend/src/lib/intel-content-signature.ts` only if integration reveals missing fields
- Test: `frontend/tests/intel-content-signature.test.mjs`, `frontend/tests/intel-refresh.test.mjs`

**Interfaces:**
- Consumes:
  - `buildIntelContentSignature(hub: ResearchHubData | null): string`
  - `runIntelRefresh(...)`
  - route state from `useLocation`
- Produces:
  - new local state for current radar timestamp and content signature
  - polling effect scoped to `/intel`

- [ ] **Step 1: Add route-aware and signature-aware local state**

```ts
const location = useLocation();
const [contentSignature, setContentSignature] = useState("");
const [autoRefreshInFlight, setAutoRefreshInFlight] = useState(false);
```

- [ ] **Step 2: Update the main load path to store radar timestamp and content signature**

```ts
const nextSignature = buildIntelContentSignature(hubData);
setContentSignature(nextSignature);
setRadarUpdatedAt(radarGeneratedAt);
```

- [ ] **Step 3: Add a lightweight poll effect that only runs on `/intel`**

```ts
useEffect(() => {
  if (location.pathname !== "/intel" || !hub) return;

  const timer = window.setInterval(async () => {
    if (refreshState === "loading" || autoRefreshInFlight) return;

    try {
      const radar = await api.radar();
      if (!radar.generated_at || radar.generated_at === radarUpdatedAt) return;

      const latestHub = await api.researchHub();
      const nextSignature = buildIntelContentSignature(latestHub);
      if (nextSignature === contentSignature) {
        setRadarUpdatedAt(radar.generated_at);
        return;
      }

      setAutoRefreshInFlight(true);
      await load({ silent: true });
    } catch {
      // poll stays silent by design
    } finally {
      setAutoRefreshInFlight(false);
    }
  }, 60000);

  return () => window.clearInterval(timer);
}, [location.pathname, hub, refreshState, autoRefreshInFlight, radarUpdatedAt, contentSignature]);
```

- [ ] **Step 4: Keep poll failures silent and preserve the existing manual-refresh toast behavior**

```ts
catch {
  // no toast here; user stays on current content
}
```

- [ ] **Step 5: Ensure a pure timestamp bump without content change does not trigger a full reload**

```ts
if (nextSignature === contentSignature) {
  setRadarUpdatedAt(radar.generated_at);
  return;
}
```

- [ ] **Step 6: Run the node regression tests**

Run: `node --test --experimental-strip-types /Users/leo/Documents/投研体系/frontend/tests/intel-refresh.test.mjs /Users/leo/Documents/投研体系/frontend/tests/intel-content-signature.test.mjs`

Expected: PASS

- [ ] **Step 7: Run the frontend build**

Run: `PATH=/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH pnpm run build`

Expected: PASS

- [ ] **Step 8: Manually verify the page behavior**

Run: `http://127.0.0.1:5899/intel`

Check:
- staying on `/intel` does not auto-refresh immediately without content changes
- when `radar.generated_at` changes but content signature is unchanged, the timestamp updates without disruptive page refresh
- when news content changes, the page silently refreshes and the timestamp updates
- leaving `/intel` stops further polling

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Intel.tsx frontend/src/lib/intel-content-signature.ts frontend/src/lib/intel-refresh.ts frontend/tests/intel-content-signature.test.mjs frontend/tests/intel-refresh.test.mjs
git commit -m "feat: auto refresh intel on new content"
```

## Self-Review

- Spec coverage:
  - polling only on `/intel` is implemented in Task 3
  - two-phase detection (`generated_at` gate plus content signature) is implemented across Tasks 1 and 3
  - silent poll failure behavior is covered in Task 3
  - reuse of the current Intel load pipeline is preserved in Task 3
- Placeholder scan:
  - no `TODO`, `TBD`, or vague “handle edge cases” placeholders remain
- Type consistency:
  - `buildIntelContentSignature`, `runIntelRefresh`, `radarGeneratedAt`, and `refreshError` are named consistently throughout the plan
