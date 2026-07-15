# Local Cleanup Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local cleanup helpers so running services and temporary runtime logs can be reset with stable script entry points.

**Architecture:** This phase adds two focused cleanup scripts plus one thin aggregate helper under `scripts/`. Each focused helper will reuse the existing stop helper for its service and then remove the corresponding `/tmp/` log file, while the aggregate helper will compose the two.

**Tech Stack:** POSIX shell, rm

## Global Constraints

- Do not delete user data under `~/.vibe-research/`.
- Do not remove `backend/.venv`.
- Do not remove `frontend/node_modules`.
- Do not clear source-controlled files.
- Do not change runtime logging behavior.

---

### Task 1: Lock the Cleanup Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future cleanup scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the cleanup entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_cleanup_helpers_exist_and_point_to_workspace_commands():
    clean_backend = read("scripts/clean-backend.sh")
    clean_frontend = read("scripts/clean-frontend.sh")
    clean_all = read("scripts/clean-all.sh")

    assert "#!/bin/sh" in clean_backend
    assert "stop-backend.sh" in clean_backend
    assert "/tmp/vibe-research-backend.log" in clean_backend

    assert "#!/bin/sh" in clean_frontend
    assert "stop-frontend.sh" in clean_frontend
    assert "/tmp/vibe-research-frontend.log" in clean_frontend

    assert "#!/bin/sh" in clean_all
    assert "scripts/clean-backend.sh" in clean_all
    assert "scripts/clean-frontend.sh" in clean_all
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_cleanup_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/clean-backend.sh" in readme
    assert "scripts/clean-frontend.sh" in readme
    assert "scripts/clean-all.sh" in readme
    assert "Repository-local cleanup helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the cleanup helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local cleanup helpers"
```

### Task 2: Implement the Cleanup Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/clean-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/clean-frontend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/clean-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: existing stop helpers and current `/tmp/` log paths
- Produces: repository-owned cleanup entry points plus README guidance

- [ ] **Step 1: Add the backend cleanup helper**

The script should follow this shape:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
LOG_FILE="/tmp/vibe-research-backend.log"
"$ROOT_DIR/scripts/stop-backend.sh"
if [ -f "$LOG_FILE" ]; then
  rm -f "$LOG_FILE"
fi
```

It should print a short cleanup summary.

- [ ] **Step 2: Add the frontend cleanup helper**

The script should mirror the backend helper for `stop-frontend.sh` and `/tmp/vibe-research-frontend.log`.

- [ ] **Step 3: Add the aggregate cleanup helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/clean-backend.sh"
"$ROOT_DIR/scripts/clean-frontend.sh"
```

- [ ] **Step 4: Update the README startup area**

Add a short local note that mentions:

```markdown
- `scripts/clean-backend.sh`
- `scripts/clean-frontend.sh`
- `scripts/clean-all.sh`
```

- [ ] **Step 5: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all cleanup helper assertions green.

- [ ] **Step 6: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/clean-backend.sh /Users/leo/Documents/投研体系/scripts/clean-frontend.sh /Users/leo/Documents/投研体系/scripts/clean-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local cleanup helpers"
```

### Task 3: Record the Helper Status and Run Live Cleanup Verification

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new cleanup helpers and the existing restart/check helpers
- Produces: local status notes plus fresh proof that cleanup and recovery work

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local cleanup helpers now exist for stopping services and clearing temporary runtime logs.
```

- [ ] **Step 2: Ensure services and logs exist**

Run: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`

Expected: PASS with services relaunched and logs present.

- [ ] **Step 3: Run the aggregate cleanup helper**

Run: `/Users/leo/Documents/投研体系/scripts/clean-all.sh`

Expected: PASS with backend/frontend stopped and both `/tmp/` log files removed.

- [ ] **Step 4: Re-run restart and verification**

Run: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`

Expected: PASS with services restored.

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline verification still green.

- [ ] **Step 5: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local cleanup helpers"
```
