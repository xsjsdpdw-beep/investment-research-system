# Local Startup Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local helper scripts that reliably start the backend and frontend in this workspace, plus lightweight documentation that points future use toward those stable entry points.

**Architecture:** This is a tooling-and-docs refinement with source-level acceptance coverage and live startup verification. We will lock the desired helper scripts in tests first, implement two shell scripts under `scripts/`, update README and local adoption notes, then verify both helpers by actually launching each service and checking the expected local endpoint.

**Tech Stack:** POSIX shell, FastAPI, Vite, pytest source assertions, pnpm

## Global Constraints

- Do not change backend or frontend application behavior.
- Do not replace the upstream quick start.
- Do not add a process manager.
- Do not add deployment scripts.
- Do not add background daemon logic or PID management.
- Do not restructure package scripts or backend module layout.

---

### Task 1: Lock the Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: `scripts/dev-backend.sh`, `scripts/dev-frontend.sh`, `README.md`, `docs/local-adoption-notes.md`
- Produces: source-level acceptance tests that fail until the helper scripts and docs exist

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_startup_helpers_exist_and_point_to_workspace_commands():
    backend_helper = read("scripts/dev-backend.sh")
    frontend_helper = read("scripts/dev-frontend.sh")

    assert "#!/bin/sh" in backend_helper
    assert "backend/.venv/bin/python" in backend_helper
    assert "uvicorn app:app --host 127.0.0.1 --port 8900" in backend_helper

    assert "#!/bin/sh" in frontend_helper
    assert "codex-primary-runtime/dependencies/node/bin" in frontend_helper
    assert "frontend/node_modules/.bin/vite" in frontend_helper
    assert "--host 127.0.0.1 --port 5899" in frontend_helper
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_startup_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/dev-backend.sh" in readme
    assert "scripts/dev-frontend.sh" in readme
    assert "Repository-local startup helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the helper scripts and their README references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local startup helpers"
```

### Task 2: Implement the Helper Scripts and README Entry

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/dev-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/dev-frontend.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: `backend/.venv`, `frontend/node_modules`, bundled Node runtime under `/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`
- Produces: repeatable local startup entry points and an updated local quick-start note

- [ ] **Step 1: Add the backend helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python"
cd "$ROOT_DIR/backend"
exec "$PYTHON_BIN" -m uvicorn app:app --host 127.0.0.1 --port 8900
```

Also add a prerequisite check with a clear error if `backend/.venv/bin/python` is missing.

- [ ] **Step 2: Add the frontend helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
NODE_BIN_DIR="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PATH="$NODE_BIN_DIR:$PATH"
VITE_BIN="$ROOT_DIR/frontend/node_modules/.bin/vite"
cd "$ROOT_DIR/frontend"
exec "$VITE_BIN" --host 127.0.0.1 --port 5899
```

Also add prerequisite checks for `frontend/node_modules` and a usable `node` command.

- [ ] **Step 3: Update the README quick-start area**

Add a compact local-workspace note near `快速开始` that mentions:

```markdown
- `scripts/dev-backend.sh`
- `scripts/dev-frontend.sh`
```

State that these helpers capture the validated local runtime setup for this derivative workspace.

- [ ] **Step 4: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with helper-script assertions and previous acceptance tests all green.

- [ ] **Step 5: Run the frontend production build**

Run: `cd /Users/leo/Documents/投研体系/frontend && PATH="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build`

Expected: PASS with a successful Vite production build.

- [ ] **Step 6: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/dev-backend.sh /Users/leo/Documents/投研体系/scripts/dev-frontend.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local startup helpers"
```

### Task 3: Record the Helper Status and Run Live Verification

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new helper scripts
- Produces: local rollout notes plus fresh verification evidence that the helpers actually launch the services

- [ ] **Step 1: Record the helper status in local adoption notes**

Add a `Stage 2 Status` line like:

```markdown
- Repository-local startup helpers now exist at `scripts/dev-backend.sh` and `scripts/dev-frontend.sh`.
```

- [ ] **Step 2: Run backend offline tests**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/pytest -m "not live"`

Expected: PASS with backend offline tests green.

- [ ] **Step 3: Live-check the backend helper**

Run the helper in the background, verify `http://127.0.0.1:8900/api/health`, then stop it.

Expected: PASS with the health endpoint returning the local service metadata.

- [ ] **Step 4: Live-check the frontend helper**

Run the helper in the background, verify `http://127.0.0.1:5899`, then stop it.

Expected: PASS with the app HTML reachable from the local port.

- [ ] **Step 5: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local startup helpers"
```
