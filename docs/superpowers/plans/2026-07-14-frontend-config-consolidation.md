# Frontend Config Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate low-risk frontend constants into `frontend/src/lib/app-config.ts` without changing runtime behavior.

**Architecture:** Add a small frontend config module with static constants, then import it from existing frontend files. Keep storage key values, package names, backend proxy behavior, and data directories unchanged.

**Tech Stack:** React 19, TypeScript, Vite, pytest source assertions, pnpm

## Global Constraints

- Do not change backend code.
- Do not change backend environment variables.
- Do not change `~/.vibe-research` local data directories.
- Do not rename package names or lockfile package names.
- Do not reorder navigation.
- Do not redesign UI.
- Do not migrate existing browser localStorage keys in this stage.
- `APP_STORAGE_KEYS.sidebar` must remain `vr-sidebar`.
- `APP_STORAGE_KEYS.theme` must remain `vr-theme`.

---

### Task 1: Add Frontend Config Acceptance Test

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: frontend source files as text
- Produces: a failing acceptance test for centralized config ownership

- [ ] **Step 1: Add a failing test for config consolidation**

```python
def test_frontend_config_constants_are_centralized():
    config = read("frontend/src/lib/app-config.ts")
    layout = read("frontend/src/components/layout/Layout.tsx")
    dark_mode = read("frontend/src/hooks/useDarkMode.ts")
    api = read("frontend/src/lib/api.ts")
    llm = read("frontend/src/lib/llm.ts")

    assert 'productName: "投研体系"' in config
    assert 'productTitle: "投研体系 · 个人 AI 投研系统（A股/美股/港股）"' in config
    assert 'productSubtitle: "个人 AI 投研系统 · A股/美股/港股"' in config
    assert 'upstreamRepoUrl: "https://github.com/simonlin1212/Vibe-Research"' in config
    assert 'upstreamLabel: "上游项目 · Vibe-Research"' in config
    assert "backendPort: 8900" in config
    assert 'sidebar: "vr-sidebar"' in config
    assert 'theme: "vr-theme"' in config

    assert "APP_CONFIG" in layout
    assert "APP_STORAGE_KEYS.sidebar" in layout
    assert "APP_STORAGE_KEYS.theme" in dark_mode
    assert "APP_CONFIG.backendPort" in api
    assert "APP_CONFIG.backendPort" in llm
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because `frontend/src/lib/app-config.ts` does not exist yet.

- [ ] **Step 3: Commit the red test**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require frontend config consolidation"
```

### Task 2: Create Config Module and Migrate Frontend Constants

**Files:**
- Create: `/Users/leo/Documents/投研体系/frontend/src/lib/app-config.ts`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/components/layout/Layout.tsx`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/hooks/useDarkMode.ts`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/lib/api.ts`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/lib/llm.ts`

**Interfaces:**
- Consumes: Task 1 config acceptance test
- Produces: static `APP_CONFIG` and `APP_STORAGE_KEYS` imports used by existing frontend code

- [ ] **Step 1: Create `app-config.ts`**

```typescript
export const APP_CONFIG = {
  productName: "投研体系",
  productTitle: "投研体系 · 个人 AI 投研系统（A股/美股/港股）",
  productSubtitle: "个人 AI 投研系统 · A股/美股/港股",
  upstreamRepoUrl: "https://github.com/simonlin1212/Vibe-Research",
  upstreamLabel: "上游项目 · Vibe-Research",
  backendPort: 8900,
} as const;

export const APP_STORAGE_KEYS = {
  sidebar: "vr-sidebar",
  theme: "vr-theme",
  accessKey: "vr-access-key",
  llm: "vr-llm",
} as const;
```

- [ ] **Step 2: Update layout imports and constant usage**

Import:

```typescript
import { APP_CONFIG, APP_STORAGE_KEYS } from "@/lib/app-config";
```

Replace local storage key literals with `APP_STORAGE_KEYS.sidebar`.

Replace upstream link constants with `APP_CONFIG.upstreamRepoUrl` and `APP_CONFIG.upstreamLabel`.

Use `APP_CONFIG.productSubtitle` for the sidebar subtitle.

- [ ] **Step 3: Update theme storage key**

Import `APP_STORAGE_KEYS` and replace `vr-theme` literals with `APP_STORAGE_KEYS.theme`.

- [ ] **Step 4: Update backend startup hints**

Import `APP_CONFIG` in `api.ts` and `llm.ts`.

Replace the hardcoded error message port with a template string:

```typescript
throw new ApiError(`连接不到后端，请先启动 backend（uvicorn app:app --port ${APP_CONFIG.backendPort}）`, 0);
```

- [ ] **Step 5: Run config acceptance tests**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all acceptance tests passing.

- [ ] **Step 6: Commit implementation**

```bash
git add /Users/leo/Documents/投研体系/frontend/src/lib/app-config.ts \
  /Users/leo/Documents/投研体系/frontend/src/components/layout/Layout.tsx \
  /Users/leo/Documents/投研体系/frontend/src/hooks/useDarkMode.ts \
  /Users/leo/Documents/投研体系/frontend/src/lib/api.ts \
  /Users/leo/Documents/投研体系/frontend/src/lib/llm.ts
git commit -m "refactor: consolidate frontend app config"
```

### Task 3: Document and Verify

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: frontend config consolidation implementation
- Produces: updated local notes plus fresh verification evidence

- [ ] **Step 1: Update local notes**

Add to `Stage 2 Status`:

```markdown
- Frontend app constants centralized in `frontend/src/lib/app-config.ts`; browser storage key values remain unchanged.
```

- [ ] **Step 2: Run frontend build**

Run: `cd /Users/leo/Documents/投研体系/frontend && PATH="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build`

Expected: PASS with Vite build completed successfully.

- [ ] **Step 3: Run backend offline tests**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/pytest -m "not live"`

Expected: PASS with backend offline tests passing.

- [ ] **Step 4: Commit notes**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record frontend config consolidation"
```
