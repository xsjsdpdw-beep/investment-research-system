# Local Doctor Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local doctor helpers so this workspace can report backend and frontend readiness through stable summary commands.

**Architecture:** This phase adds two focused doctor scripts plus one thin aggregate helper under `scripts/`. Each per-area helper will summarize runtime availability, dependency readiness, listener presence, and log-file presence, while the aggregate helper will compose the two summaries.

**Tech Stack:** POSIX shell, lsof

## Global Constraints

- Do not change application behavior.
- Do not add automatic repair logic.
- Do not install missing dependencies automatically.
- Do not restart services automatically.
- Do not replace the focused helpers already in the repo.

---

### Task 1: Lock the Doctor Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future doctor scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the doctor entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_doctor_helpers_exist_and_point_to_workspace_commands():
    doctor_backend = read("scripts/doctor-backend.sh")
    doctor_frontend = read("scripts/doctor-frontend.sh")
    doctor_all = read("scripts/doctor-all.sh")

    assert "#!/bin/sh" in doctor_backend
    assert "codex-primary-runtime/dependencies/python/bin/python3" in doctor_backend
    assert "backend/.venv" in doctor_backend
    assert "8900" in doctor_backend
    assert "/tmp/vibe-research-backend.log" in doctor_backend

    assert "#!/bin/sh" in doctor_frontend
    assert "codex-primary-runtime/dependencies/node/bin" in doctor_frontend
    assert "fallback/pnpm" in doctor_frontend
    assert "frontend/node_modules" in doctor_frontend
    assert "5899" in doctor_frontend
    assert "/tmp/vibe-research-frontend.log" in doctor_frontend

    assert "#!/bin/sh" in doctor_all
    assert "scripts/doctor-backend.sh" in doctor_all
    assert "scripts/doctor-frontend.sh" in doctor_all
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_doctor_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/doctor-backend.sh" in readme
    assert "scripts/doctor-frontend.sh" in readme
    assert "scripts/doctor-all.sh" in readme
    assert "Repository-local doctor helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the doctor helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local doctor helpers"
```

### Task 2: Implement the Doctor Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/doctor-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/doctor-frontend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/doctor-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: bundled runtime paths, dependency directories, ports `8900`/`5899`, and current `/tmp/` log paths
- Produces: repository-owned doctor entry points plus README guidance

- [ ] **Step 1: Add the backend doctor helper**

The script should summarize:

```sh
#!/bin/sh
set -eu
PYTHON_BIN=...
VENV_PYTHON=...
PID=$(lsof -tiTCP:8900 -sTCP:LISTEN || true)
LOG_FILE="/tmp/vibe-research-backend.log"
```

It should print readable status lines for bundled Python, backend venv, backend listener, and backend log file.

- [ ] **Step 2: Add the frontend doctor helper**

The script should summarize:

```sh
#!/bin/sh
set -eu
NODE_BIN_DIR=...
PNPM_BIN=...
NODE_MODULES_DIR=...
PID=$(lsof -tiTCP:5899 -sTCP:LISTEN || true)
LOG_FILE="/tmp/vibe-research-frontend.log"
```

It should print readable status lines for bundled Node, bundled `pnpm`, frontend dependencies, frontend listener, and frontend log file.

- [ ] **Step 3: Add the aggregate doctor helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/doctor-backend.sh"
"$ROOT_DIR/scripts/doctor-frontend.sh"
```

- [ ] **Step 4: Update the README startup area**

Add a short local note that mentions:

```markdown
- `scripts/doctor-backend.sh`
- `scripts/doctor-frontend.sh`
- `scripts/doctor-all.sh`
```

- [ ] **Step 5: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all doctor helper assertions green.

- [ ] **Step 6: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/doctor-backend.sh /Users/leo/Documents/投研体系/scripts/doctor-frontend.sh /Users/leo/Documents/投研体系/scripts/doctor-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local doctor helpers"
```

### Task 3: Record the Helper Status and Run Live Doctor Verification

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new doctor helpers and the existing restart helper
- Produces: local status notes plus fresh proof that the doctor view works

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local doctor helpers now exist for summarizing backend/frontend environment readiness.
```

- [ ] **Step 2: Ensure services are running**

Run: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`

Expected: PASS with both services relaunched and reachable.

- [ ] **Step 3: Run the aggregate doctor helper**

Run: `/Users/leo/Documents/投研体系/scripts/doctor-all.sh`

Expected: PASS with backend and frontend readiness summaries printed.

- [ ] **Step 4: Run the aggregate verification helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline verification still green.

- [ ] **Step 5: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local doctor helpers"
```
