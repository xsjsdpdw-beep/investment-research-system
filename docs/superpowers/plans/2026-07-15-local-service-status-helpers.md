# Local Service Status Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local status helpers so the current runtime state of the local backend and frontend can be checked with stable script entry points.

**Architecture:** This phase adds two focused status scripts plus one thin aggregate helper under `scripts/`. The backend helper will combine local listener detection with `/api/health`, the frontend helper will combine local listener detection with an app-root fetch, and the aggregate helper will compose the two.

**Tech Stack:** POSIX shell, lsof, Python stdlib HTTP checks

## Global Constraints

- Do not change application behavior.
- Do not add background monitoring.
- Do not add recurring health polling.
- Do not add notifications or desktop integration.
- Do not change startup, stop, or restart behavior.

---

### Task 1: Lock the Status Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future status scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the new status entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_service_status_helpers_exist_and_point_to_workspace_commands():
    status_backend = read("scripts/status-backend.sh")
    status_frontend = read("scripts/status-frontend.sh")
    status_all = read("scripts/status-all.sh")

    assert "#!/bin/sh" in status_backend
    assert "8900" in status_backend
    assert "api/health" in status_backend
    assert "lsof" in status_backend

    assert "#!/bin/sh" in status_frontend
    assert "5899" in status_frontend
    assert "lsof" in status_frontend

    assert "#!/bin/sh" in status_all
    assert "scripts/status-backend.sh" in status_all
    assert "scripts/status-frontend.sh" in status_all
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_service_status_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/status-backend.sh" in readme
    assert "scripts/status-frontend.sh" in readme
    assert "scripts/status-all.sh" in readme
    assert "Repository-local service status helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the status helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local service status helpers"
```

### Task 2: Implement the Status Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/status-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/status-frontend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/status-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: local ports `8900` and `5899`, backend health endpoint, frontend app root
- Produces: repository-owned status entry points plus README guidance

- [ ] **Step 1: Add the backend status helper**

The script should:

```sh
#!/bin/sh
set -eu
PID=$(lsof -tiTCP:8900 -sTCP:LISTEN || true)
python3 - <<'PY'
...
PY
```

It should print one of:

- backend not running
- backend listening but health check failed
- backend healthy with PID

- [ ] **Step 2: Add the frontend status helper**

The script should mirror the same diagnostic style for port `5899` and `http://127.0.0.1:5899`.

- [ ] **Step 3: Add the aggregate status helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/status-backend.sh"
"$ROOT_DIR/scripts/status-frontend.sh"
```

- [ ] **Step 4: Update the README startup area**

Add a short local note that mentions:

```markdown
- `scripts/status-backend.sh`
- `scripts/status-frontend.sh`
- `scripts/status-all.sh`
```

- [ ] **Step 5: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all status helper assertions green.

- [ ] **Step 6: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/status-backend.sh /Users/leo/Documents/投研体系/scripts/status-frontend.sh /Users/leo/Documents/投研体系/scripts/status-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local service status helpers"
```

### Task 3: Record the Helper Status and Run Live Status Verification

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new status helpers and the existing restart helper
- Produces: local status notes plus fresh proof that status checks work on live services

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local service status helpers now exist for checking backend/frontend runtime state.
```

- [ ] **Step 2: Ensure services are running**

Run: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`

Expected: PASS with both services relaunched and reachable.

- [ ] **Step 3: Run the aggregate status helper**

Run: `/Users/leo/Documents/投研体系/scripts/status-all.sh`

Expected: PASS with backend reported healthy and frontend reported reachable.

- [ ] **Step 4: Run the aggregate verification helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline verification still green.

- [ ] **Step 5: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local service status helpers"
```
