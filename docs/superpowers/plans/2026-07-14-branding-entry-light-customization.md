# Branding Entry Light Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the running app present itself as `投研体系` across browser metadata, sidebar branding, key user-facing copy, AI assistant identity, and backend API metadata.

**Architecture:** This is a targeted string and metadata change across frontend runtime surfaces and backend identity fields. It intentionally keeps package names, upstream repository links, local data directories, and data adapters unchanged so the derivative project remains easy to compare with upstream.

**Tech Stack:** React 19, Vite, TypeScript, FastAPI, Python 3.12, pytest, pnpm

## Global Constraints

- Do not change default local data directories such as `~/.vibe-research/`.
- Do not rename package names, lockfile package names, or repository provenance.
- Do not change data-source adapters.
- Do not reorder navigation in this stage.
- Do not redesign the visual system.
- Do not remove upstream attribution from README or source comments where it explains origin.
- Use `投研体系` when the copy describes the local running product.
- Keep `Vibe-Research` only where the copy explicitly refers to the upstream project or provenance.

---

### Task 1: Add Branding Acceptance Tests

**Files:**
- Create: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: frontend and backend source files as plain text
- Produces: pytest assertions that fail until runtime product identity changes to `投研体系`

- [ ] **Step 1: Write the failing acceptance test**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_frontend_runtime_branding_uses_local_product_name():
    html = read("frontend/index.html")
    layout = read("frontend/src/components/layout/Layout.tsx")
    disclaimer = read("frontend/src/components/ui/Disclaimer.tsx")
    settings = read("frontend/src/pages/Settings.tsx")
    stock_data = read("frontend/src/pages/StockData.tsx")

    assert "<title>投研体系 · 个人 AI 投研系统（A股/美股/港股）</title>" in html
    assert "投研体系: Your Personal Trading Research Agent" in html
    assert "Vibe-<span" not in layout
    assert "投研体系" in layout
    assert "上游项目 · Vibe-Research" in layout
    assert "投研体系 只客观呈现公开数据与榜单" in disclaimer
    assert "投研体系 是一个中立的信息整理与 AI 接入工具" in disclaimer
    assert "投研体系 后端会用它以你的订阅额度作答" in settings
    assert "投研体系 不预置任何标的、不做推荐" in stock_data


def test_backend_runtime_identity_uses_local_product_name():
    app_py = read("backend/app.py")
    chat_py = read("backend/chat.py")

    assert 'FastAPI(title="投研体系 API", version="0.1.3")' in app_py
    assert '"service": "investment-research-api"' in app_py
    assert "你是 投研体系 里的投研助理" in chat_py
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because `frontend/index.html`, `Layout.tsx`, and backend metadata still contain upstream runtime branding.

- [ ] **Step 3: Commit the red test**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: add branding acceptance coverage"
```

### Task 2: Update Runtime Branding and API Identity

**Files:**
- Modify: `/Users/leo/Documents/投研体系/frontend/index.html`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/components/layout/Layout.tsx`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/components/ui/Disclaimer.tsx`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/pages/Settings.tsx`
- Modify: `/Users/leo/Documents/投研体系/frontend/src/pages/StockData.tsx`
- Modify: `/Users/leo/Documents/投研体系/backend/app.py`
- Modify: `/Users/leo/Documents/投研体系/backend/chat.py`

**Interfaces:**
- Consumes: Task 1 acceptance tests
- Produces: Runtime-visible app identity of `投研体系`, backend API service id `investment-research-api`, and unchanged upstream provenance links

- [ ] **Step 1: Update frontend browser metadata**

Change `frontend/index.html` title to:

```html
<title>投研体系 · 个人 AI 投研系统（A股/美股/港股）</title>
```

Change the meta description content to start with:

```text
投研体系: Your Personal Trading Research Agent
```

- [ ] **Step 2: Update sidebar brand and footer reference**

In `Layout.tsx`, replace the visible sidebar brand with:

```tsx
<span className="text-lg font-extrabold tracking-tight">
  投研<span className="text-primary">体系</span>
</span>
```

Change `SITE_URL` to the upstream repository URL and change footer text to:

```tsx
上游项目 · Vibe-Research
```

- [ ] **Step 3: Update runtime user-facing copy**

Use targeted replacements:

```text
Vibe-Research 只客观呈现公开数据与榜单 -> 投研体系 只客观呈现公开数据与榜单
Vibe-Research 是一个中立的信息整理与 AI 接入工具 -> 投研体系 是一个中立的信息整理与 AI 接入工具
Vibe-Research 后端会用它以你的订阅额度作答 -> 投研体系 后端会用它以你的订阅额度作答
Vibe-Research 不预置任何标的、不做推荐 -> 投研体系 不预置任何标的、不做推荐
```

- [ ] **Step 4: Update backend API metadata and assistant identity**

Change `backend/app.py`:

```python
app = FastAPI(title="投研体系 API", version="0.1.3")
```

Change health service:

```python
return {"ok": True, "service": "investment-research-api", "version": "0.1.3"}
```

Change `backend/chat.py` prompt identity to:

```python
SYSTEM_PROMPT = f"""你是 投研体系 里的投研助理。你可以调用工具获取客观数据来支撑回答：
```

- [ ] **Step 5: Run branding acceptance tests to verify green**

Run: `python3 -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all branding acceptance tests passing.

- [ ] **Step 6: Commit runtime branding change**

```bash
git add /Users/leo/Documents/投研体系/frontend/index.html \
  /Users/leo/Documents/投研体系/frontend/src/components/layout/Layout.tsx \
  /Users/leo/Documents/投研体系/frontend/src/components/ui/Disclaimer.tsx \
  /Users/leo/Documents/投研体系/frontend/src/pages/Settings.tsx \
  /Users/leo/Documents/投研体系/frontend/src/pages/StockData.tsx \
  /Users/leo/Documents/投研体系/backend/app.py \
  /Users/leo/Documents/投研体系/backend/chat.py
git commit -m "feat: brand runtime as investment research system"
```

### Task 3: Update Local Adoption Notes and Verify End-to-End

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: branding implementation and local verification commands
- Produces: documented Stage 2 branding status and fresh validation evidence

- [ ] **Step 1: Update local adoption notes**

Add this under `Stage 1 Status` or a new `Stage 2 Status` section:

```markdown
## Stage 2 Status

- Runtime branding updated from upstream `Vibe-Research` to local product name `投研体系`.
- Backend API metadata now reports `投研体系 API`.
- `/api/health` now reports service `investment-research-api`.
- Local data directories remain unchanged for compatibility.
```

- [ ] **Step 2: Run full backend offline verification**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/pytest -m "not live"`

Expected: PASS with backend offline tests passing.

- [ ] **Step 3: Run full frontend build verification**

Run: `cd /Users/leo/Documents/投研体系/frontend && PATH="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build`

Expected: PASS with Vite build completed successfully.

- [ ] **Step 4: Run runtime metadata checks**

Run: `python3 - <<'PY'\nfrom urllib.request import urlopen\nimport json\nhealth = json.loads(urlopen('http://127.0.0.1:8900/api/health', timeout=5).read())\nassert health['service'] == 'investment-research-api'\nhtml = urlopen('http://127.0.0.1:5899', timeout=5).read().decode('utf-8', 'ignore')\nassert '投研体系' in html\nprint('PASS: runtime branding metadata verified')\nPY`

Expected: PASS with `PASS: runtime branding metadata verified`.

- [ ] **Step 5: Commit documentation update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record branding customization status"
```
