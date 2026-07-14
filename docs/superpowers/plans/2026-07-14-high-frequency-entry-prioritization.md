# High-Frequency Entry Prioritization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the highest-frequency research pages closer to the user by reordering sidebar navigation and adding a compact quick-entry module to the top of `每日复盘`, while keeping routing and data flow unchanged.

**Architecture:** This is a frontend-only refinement with source-level acceptance coverage. We will first lock the approved sidebar ordering and quick-entry links in tests, then make a minimal layout update in the existing sidebar and `DailyReview` page, and finally refresh adoption notes to reflect that the Stage 2 navigation priority has been completed.

**Tech Stack:** React, TypeScript, React Router, Tailwind utility classes, pytest source assertions

## Global Constraints

- Do not change the root route away from `/daily-review`.
- Do not add new pages.
- Do not change backend APIs or storage behavior.
- Do not redesign the whole sidebar.
- Do not replace the existing `每日复盘` page structure.

---

### Task 1: Lock the Approved Entry Priority in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: `frontend/src/components/layout/Layout.tsx`, `frontend/src/pages/DailyReview.tsx`, `frontend/src/router.tsx`
- Produces: source-level acceptance tests that fail until the sidebar and quick-entry content match the approved design

- [ ] **Step 1: Add a failing sidebar-ordering test**

```python
def test_sidebar_prioritizes_high_frequency_pages():
    layout = read("frontend/src/components/layout/Layout.tsx")

    daily = layout.index('label: "每日复盘"')
    watchlist = layout.index('label: "自选股"')
    portfolio = layout.index('label: "我的持仓"')
    stock_data = layout.index('label: "个股数据"')
    notes = layout.index('label: "研究记录"')
    intel = layout.index('label: "资讯雷达"')
    sectors = layout.index('label: "板块中心"')
    reports = layout.index('label: "我的研报"')
    settings = layout.index('label: "接入 AI"')

    assert daily < watchlist < portfolio < stock_data < notes < intel < sectors < reports < settings
```

- [ ] **Step 2: Add a failing quick-entry test**

```python
def test_daily_review_exposes_quick_links_to_core_workflows():
    daily_review = read("frontend/src/pages/DailyReview.tsx")
    router = read("frontend/src/router.tsx")

    assert 'path: "/", element: <Navigate to="/daily-review" replace />' in router
    assert "快捷入口" in daily_review
    assert 'to="/watchlist"' in daily_review
    assert 'to="/portfolio"' in daily_review
    assert 'to="/stock-data"' in daily_review
    assert 'to="/notes"' in daily_review
    assert "自选股" in daily_review
    assert "我的持仓" in daily_review
    assert "个股数据" in daily_review
    assert "研究记录" in daily_review
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the current sidebar order and `每日复盘` content do not yet match the approved design.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require high-frequency entry prioritization"
```

### Task 2: Reorder the Sidebar and Add DailyReview Quick Entry Links

**Files:**
- Modify: `/Users/leo/Documents/投研体系/frontend/src/components/layout/Layout.tsx`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/pages/DailyReview.tsx`

**Interfaces:**
- Consumes: existing `NAV` sidebar config, existing `Link` usage, existing `GlassCard` and `PageHeader` UI patterns
- Produces: reordered navigation plus a static quick-entry module on the `每日复盘` page

- [ ] **Step 1: Reorder the sidebar `NAV` array**

Update the array so these entries appear first and in this exact order:

```ts
[
  { to: "/daily-review", label: "每日复盘" },
  { to: "/watchlist", label: "自选股" },
  { to: "/portfolio", label: "我的持仓" },
  { to: "/stock-data", label: "个股数据" },
  { to: "/notes", label: "研究记录" },
  { to: "/intel", label: "资讯雷达" },
]
```

Keep the remaining entries afterward:

```ts
[
  { to: "/sectors", label: "板块中心" },
  { to: "/my-reports", label: "我的研报" },
  { to: "/settings", label: "接入 AI" },
]
```

- [ ] **Step 2: Add a compact quick-entry module below the page header**

Render a `GlassCard` near the top of `DailyReview` with:

```tsx
<h3>快捷入口</h3>
<Link to="/watchlist">自选股</Link>
<Link to="/portfolio">我的持仓</Link>
<Link to="/stock-data">个股数据</Link>
<Link to="/notes">研究记录</Link>
```

Add one short line of copy explaining that these links jump directly into daily research workflows. Reuse existing utility classes and avoid introducing new component files.

- [ ] **Step 3: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with both new tests and the earlier branding/config tests all green.

- [ ] **Step 4: Run the frontend production build**

Run: `cd /Users/leo/Documents/投研体系/frontend && /Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build`

Expected: PASS with a successful Vite production build.

- [ ] **Step 5: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/frontend/src/components/layout/Layout.tsx /Users/leo/Documents/投研体系/frontend/src/pages/DailyReview.tsx
git commit -m "feat: prioritize high-frequency research entries"
```

### Task 3: Refresh Rollout Notes

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the completed navigation refinement
- Produces: rollout notes that record the new state and remove stale Stage 2 priority items

- [ ] **Step 1: Add a Stage 2 status line for the completed navigation refinement**

Add:

```markdown
- Sidebar navigation now prioritizes 每日复盘、自选股、我的持仓、个股数据、研究记录、资讯雷达.
- 每日复盘 now includes quick links to the core adjacent workflows.
```

- [ ] **Step 2: Replace stale Stage 2 priority bullets**

Update `Stage 2 Priority` so it no longer lists already-finished items such as AI config consolidation or storage-path review. Keep the section focused on any genuinely remaining follow-up work, or mark this phase complete if no immediate Stage 2 priority remains.

- [ ] **Step 3: Run backend offline tests**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/pytest -m "not live"`

Expected: PASS with backend offline tests still green.

- [ ] **Step 4: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record high-frequency entry prioritization"
```
