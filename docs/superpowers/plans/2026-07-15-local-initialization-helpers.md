# Local Initialization Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local initialization helpers so backend and frontend dependency setup for this workspace can be reproduced through stable script entry points, plus one aggregate setup command.

**Architecture:** This phase adds two focused setup scripts and one thin aggregate runner under `scripts/`, then points the README and local adoption notes at them. The scripts only wrap the validated local runtime paths and install commands already used successfully in this workspace, so the work stays tooling-only and compatibility-preserving.

**Tech Stack:** POSIX shell, Python virtual environments, pip, pnpm

## Global Constraints

- Do not change application behavior.
- Do not add dependency pin changes.
- Do not add deployment or packaging logic.
- Do not automatically start services after installation.
- Do not delete existing environments or caches.
- Do not hide installation failures behind retry loops.

---

### Task 1: Lock the Initialization Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future initialization helper scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the local initialization entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_initialization_helpers_exist_and_point_to_workspace_commands():
    backend = read("scripts/init-backend.sh")
    frontend = read("scripts/init-frontend.sh")
    all_init = read("scripts/init-all.sh")

    assert "#!/bin/sh" in backend
    assert "codex-primary-runtime/dependencies/python/bin/python3" in backend
    assert "requirements.txt" in backend
    assert "requirements-dev.txt" in backend

    assert "#!/bin/sh" in frontend
    assert "codex-primary-runtime/dependencies/node/bin" in frontend
    assert "pnpm install" in frontend
    assert "pnpm approve-builds --all" in frontend

    assert "#!/bin/sh" in all_init
    assert "scripts/init-backend.sh" in all_init
    assert "scripts/init-frontend.sh" in all_init
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_initialization_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/init-backend.sh" in readme
    assert "scripts/init-frontend.sh" in readme
    assert "scripts/init-all.sh" in readme
    assert "Repository-local initialization helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the initialization helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local initialization helpers"
```

### Task 2: Implement the Initialization Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/init-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/init-frontend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/init-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: bundled Python runtime, bundled Node runtime, bundled `pnpm`, backend and frontend dependency manifests
- Produces: repository-owned initialization entry points plus README guidance

- [ ] **Step 1: Add the backend initialization helper**

The script should follow this shape:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
PYTHON_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
VENV_BIN="$ROOT_DIR/backend/.venv/bin/python"
cd "$ROOT_DIR/backend"
"$PYTHON_BIN" -m venv .venv
"$VENV_BIN" -m pip install --upgrade pip
"$VENV_BIN" -m pip install -r requirements.txt
"$VENV_BIN" -m pip install -r requirements-dev.txt
```

It is acceptable to run `python -m venv .venv` on every invocation; it should remain safe for an existing environment.

- [ ] **Step 2: Add the frontend initialization helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
NODE_BIN_DIR="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PNPM_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"
PATH="$NODE_BIN_DIR:$PATH"
cd "$ROOT_DIR/frontend"
"$PNPM_BIN" install
"$PNPM_BIN" approve-builds --all
```

Add prerequisite checks for a usable `node` command and the bundled `pnpm` launcher.

- [ ] **Step 3: Add the aggregate initialization helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/init-backend.sh"
"$ROOT_DIR/scripts/init-frontend.sh"
```

- [ ] **Step 4: Update the README quick-start area**

Add a short local note that mentions:

```markdown
- `scripts/init-backend.sh`
- `scripts/init-frontend.sh`
- `scripts/init-all.sh`
```

- [ ] **Step 5: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all helper-script assertions green.

- [ ] **Step 6: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/init-backend.sh /Users/leo/Documents/投研体系/scripts/init-frontend.sh /Users/leo/Documents/投研体系/scripts/init-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local initialization helpers"
```

### Task 3: Record the Helper Status and Re-Run the Existing Validation Chain

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new initialization helper scripts
- Produces: local status notes plus fresh evidence that the repository remains healthy after the helper additions

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local initialization helpers now exist at `scripts/init-backend.sh`, `scripts/init-frontend.sh`, and `scripts/init-all.sh`.
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

- [ ] **Step 5: Run the aggregate verification helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline checks running in sequence.

- [ ] **Step 6: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local initialization helpers"
```
