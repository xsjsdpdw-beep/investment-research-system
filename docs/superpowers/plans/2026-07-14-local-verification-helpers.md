# Local Verification Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local verification helpers so this workspace can run acceptance checks, frontend build verification, backend offline tests, or the whole local verification chain through stable script entry points.

**Architecture:** This phase adds three focused shell wrappers and one thin aggregate runner under `scripts/`, then updates docs to point at those stable verification commands. The scripts only wrap commands that are already part of the validated local workflow, so the work stays tooling-only and low risk.

**Tech Stack:** POSIX shell, pytest, pnpm, Vite

## Global Constraints

- Do not change application behavior.
- Do not replace upstream test commands for other environments.
- Do not add CI configuration.
- Do not add live-network smoke tests to the default verification path.
- Do not add dependency installation or bootstrap logic in this phase.

---

### Task 1: Lock the Verification Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future helper scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the local verification entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_verification_helpers_exist_and_point_to_workspace_commands():
    acceptance = read("scripts/check-acceptance.sh")
    frontend = read("scripts/check-frontend-build.sh")
    backend = read("scripts/check-backend.sh")
    all_checks = read("scripts/check-all.sh")

    assert "#!/bin/sh" in acceptance
    assert "pytest tests/test_branding_acceptance.py -q" in acceptance

    assert "#!/bin/sh" in frontend
    assert "codex-primary-runtime/dependencies/node/bin" in frontend
    assert "pnpm run build" in frontend

    assert "#!/bin/sh" in backend
    assert '.venv/bin/pytest -m "not live"' in backend

    assert "#!/bin/sh" in all_checks
    assert "scripts/check-acceptance.sh" in all_checks
    assert "scripts/check-frontend-build.sh" in all_checks
    assert "scripts/check-backend.sh" in all_checks
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_verification_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/check-acceptance.sh" in readme
    assert "scripts/check-frontend-build.sh" in readme
    assert "scripts/check-backend.sh" in readme
    assert "scripts/check-all.sh" in readme
    assert "Repository-local verification helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the verification helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local verification helpers"
```

### Task 2: Implement the Verification Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/check-acceptance.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/check-frontend-build.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/check-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/check-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: `backend/.venv`, `frontend/node_modules`, bundled Node runtime path, current verified commands
- Produces: repository-owned verification entry points plus README guidance

- [ ] **Step 1: Add the acceptance helper**

The script should follow this shape:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python"
exec "$PYTHON_BIN" -m pytest "$ROOT_DIR/tests/test_branding_acceptance.py" -q
```

Add a prerequisite check for `backend/.venv/bin/python`.

- [ ] **Step 2: Add the frontend build helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
NODE_BIN_DIR="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PATH="$NODE_BIN_DIR:$PATH"
cd "$ROOT_DIR/frontend"
exec /Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build
```

Add prerequisite checks for `frontend/node_modules` and a usable `node` command.

- [ ] **Step 3: Add the backend offline helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
cd "$ROOT_DIR/backend"
exec .venv/bin/pytest -m "not live"
```

Add a prerequisite check for `backend/.venv/bin/pytest`.

- [ ] **Step 4: Add the aggregate helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/check-acceptance.sh"
"$ROOT_DIR/scripts/check-frontend-build.sh"
"$ROOT_DIR/scripts/check-backend.sh"
```

- [ ] **Step 5: Update the README testing section**

Add a short local note that mentions:

```markdown
- `scripts/check-acceptance.sh`
- `scripts/check-frontend-build.sh`
- `scripts/check-backend.sh`
- `scripts/check-all.sh`
```

- [ ] **Step 6: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all helper-script assertions green.

- [ ] **Step 7: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/check-acceptance.sh /Users/leo/Documents/投研体系/scripts/check-frontend-build.sh /Users/leo/Documents/投研体系/scripts/check-backend.sh /Users/leo/Documents/投研体系/scripts/check-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local verification helpers"
```

### Task 3: Record the Helper Status and Verify Each Entry Point

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new helper scripts
- Produces: local status notes plus fresh proof that each helper works

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local verification helpers now exist for acceptance, frontend build, backend offline tests, and full local verification.
```

- [ ] **Step 2: Run the acceptance helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-acceptance.sh`

Expected: PASS with the acceptance suite output.

- [ ] **Step 3: Run the frontend build helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-frontend-build.sh`

Expected: PASS with a successful production build.

- [ ] **Step 4: Run the backend offline helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-backend.sh`

Expected: PASS with backend offline tests green.

- [ ] **Step 5: Run the aggregate helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline checks running in sequence.

- [ ] **Step 6: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local verification helpers"
```
