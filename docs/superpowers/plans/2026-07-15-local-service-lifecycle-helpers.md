# Local Service Lifecycle Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local helpers for stopping the backend/frontend and for fully restarting the local app stack through stable script entry points.

**Architecture:** This phase adds two focused stop scripts plus two thin aggregate helpers under `scripts/`. The restart helper will compose the existing startup helpers and perform a lightweight live endpoint check, while the stop helpers remain idempotent wrappers around the known local ports.

**Tech Stack:** POSIX shell, lsof, kill, Python stdlib HTTP checks

## Global Constraints

- Do not change backend or frontend application behavior.
- Do not add a supervisor or background daemon manager.
- Do not add long-lived PID-file orchestration.
- Do not change the startup scripts themselves beyond reusing them.
- Do not add log rotation or deployment logic.

---

### Task 1: Lock the Lifecycle Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future lifecycle scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the stop/restart entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_service_lifecycle_helpers_exist_and_point_to_workspace_commands():
    stop_backend = read("scripts/stop-backend.sh")
    stop_frontend = read("scripts/stop-frontend.sh")
    stop_all = read("scripts/stop-all.sh")
    restart_all = read("scripts/restart-all.sh")

    assert "#!/bin/sh" in stop_backend
    assert "8900" in stop_backend
    assert "lsof" in stop_backend

    assert "#!/bin/sh" in stop_frontend
    assert "5899" in stop_frontend
    assert "lsof" in stop_frontend

    assert "#!/bin/sh" in stop_all
    assert "scripts/stop-backend.sh" in stop_all
    assert "scripts/stop-frontend.sh" in stop_all

    assert "#!/bin/sh" in restart_all
    assert "scripts/stop-all.sh" in restart_all
    assert "scripts/dev-backend.sh" in restart_all
    assert "scripts/dev-frontend.sh" in restart_all
    assert "api/health" in restart_all
    assert "5899" in restart_all
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_service_lifecycle_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/stop-backend.sh" in readme
    assert "scripts/stop-frontend.sh" in readme
    assert "scripts/stop-all.sh" in readme
    assert "scripts/restart-all.sh" in readme
    assert "Repository-local service lifecycle helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the lifecycle helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local service lifecycle helpers"
```

### Task 2: Implement the Lifecycle Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/stop-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/stop-frontend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/stop-all.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: existing startup helpers, local ports `8900` and `5899`
- Produces: repository-owned lifecycle entry points plus README guidance

- [ ] **Step 1: Add the backend stop helper**

The script should:

```sh
#!/bin/sh
set -eu
PID=$(lsof -tiTCP:8900 -sTCP:LISTEN || true)
if [ -n "$PID" ]; then
  kill "$PID"
fi
```

It should print a short message in both the “stopped” and “already stopped” cases.

- [ ] **Step 2: Add the frontend stop helper**

The script should mirror the backend helper for port `5899`.

- [ ] **Step 3: Add the aggregate stop helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/stop-backend.sh"
"$ROOT_DIR/scripts/stop-frontend.sh"
```

- [ ] **Step 4: Add the aggregate restart helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/stop-all.sh"
nohup "$ROOT_DIR/scripts/dev-backend.sh" >/tmp/... &
nohup "$ROOT_DIR/scripts/dev-frontend.sh" >/tmp/... &
python3 - <<'PY'
...
PY
```

The inline Python check should validate both backend and frontend endpoints before exiting successfully.

- [ ] **Step 5: Update the README startup area**

Add a short local note that mentions:

```markdown
- `scripts/stop-backend.sh`
- `scripts/stop-frontend.sh`
- `scripts/stop-all.sh`
- `scripts/restart-all.sh`
```

- [ ] **Step 6: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all lifecycle helper assertions green.

- [ ] **Step 7: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/stop-backend.sh /Users/leo/Documents/投研体系/scripts/stop-frontend.sh /Users/leo/Documents/投研体系/scripts/stop-all.sh /Users/leo/Documents/投研体系/scripts/restart-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local service lifecycle helpers"
```

### Task 3: Record the Helper Status and Run Live Restart Verification

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new lifecycle scripts
- Produces: local status notes plus fresh proof that full restart works

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local service lifecycle helpers now exist for stopping or fully restarting the local backend/frontend stack.
```

- [ ] **Step 2: Run the acceptance helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-acceptance.sh`

Expected: PASS with the acceptance suite output.

- [ ] **Step 3: Run the aggregate verification helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline verification still green.

- [ ] **Step 4: Run the lifecycle restart helper**

Run: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`

Expected: PASS with backend health returning `investment-research-api` and the frontend root returning HTML that contains `投研体系`.

- [ ] **Step 5: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local service lifecycle helpers"
```
