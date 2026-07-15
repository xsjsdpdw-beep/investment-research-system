# Local Log Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-local log helpers so backend and frontend runtime logs can be inspected with stable script entry points.

**Architecture:** This phase adds two focused log-view scripts plus one thin aggregate helper under `scripts/`. Each per-service helper will read the existing `/tmp/` log file already used by the startup and restart flow, while the aggregate helper will compose the two.

**Tech Stack:** POSIX shell, tail

## Global Constraints

- Do not change runtime logging behavior.
- Do not introduce persistent repo log files.
- Do not add log rotation.
- Do not add background log streaming daemons.
- Do not change where startup and restart currently write logs.

---

### Task 1: Lock the Log Helper Contract in Acceptance Tests

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: the future log scripts plus `README.md` and `docs/local-adoption-notes.md`
- Produces: source-level acceptance coverage for the log entry points

- [ ] **Step 1: Add a failing helper-script test**

```python
def test_local_log_helpers_exist_and_point_to_workspace_commands():
    log_backend = read("scripts/log-backend.sh")
    log_frontend = read("scripts/log-frontend.sh")
    log_all = read("scripts/log-all.sh")

    assert "#!/bin/sh" in log_backend
    assert "/tmp/vibe-research-backend.log" in log_backend
    assert "tail" in log_backend

    assert "#!/bin/sh" in log_frontend
    assert "/tmp/vibe-research-frontend.log" in log_frontend
    assert "tail" in log_frontend

    assert "#!/bin/sh" in log_all
    assert "scripts/log-backend.sh" in log_all
    assert "scripts/log-frontend.sh" in log_all
```

- [ ] **Step 2: Add a failing documentation test**

```python
def test_local_docs_point_to_log_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/log-backend.sh" in readme
    assert "scripts/log-frontend.sh" in readme
    assert "scripts/log-all.sh" in readme
    assert "Repository-local log helpers" in local_notes
```

- [ ] **Step 3: Run the acceptance suite and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because the log helper scripts and their doc references do not exist yet.

- [ ] **Step 4: Commit the red tests**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require local log helpers"
```

### Task 2: Implement the Log Helpers and README Note

**Files:**
- Create: `/Users/leo/Documents/投研体系/scripts/log-backend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/log-frontend.sh`
- Create: `/Users/leo/Documents/投研体系/scripts/log-all.sh`
- Modify: `/Users/leo/Documents/投研体系/README.md`

**Interfaces:**
- Consumes: `/tmp/vibe-research-backend.log`, `/tmp/vibe-research-frontend.log`
- Produces: repository-owned log entry points plus README guidance

- [ ] **Step 1: Add the backend log helper**

The script should follow this shape:

```sh
#!/bin/sh
set -eu
LOG_FILE="/tmp/vibe-research-backend.log"
if [ ! -f "$LOG_FILE" ]; then
  echo "Backend log not found yet."
  exit 0
fi
tail -n 40 "$LOG_FILE"
```

It should print a short header before the log content.

- [ ] **Step 2: Add the frontend log helper**

The script should mirror the backend helper for `/tmp/vibe-research-frontend.log`.

- [ ] **Step 3: Add the aggregate log helper**

The script should:

```sh
#!/bin/sh
set -eu
ROOT_DIR=...
"$ROOT_DIR/scripts/log-backend.sh"
"$ROOT_DIR/scripts/log-frontend.sh"
```

- [ ] **Step 4: Update the README startup area**

Add a short local note that mentions:

```markdown
- `scripts/log-backend.sh`
- `scripts/log-frontend.sh`
- `scripts/log-all.sh`
```

- [ ] **Step 5: Run the acceptance suite and verify it passes**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with all log helper assertions green.

- [ ] **Step 6: Commit the implementation**

```bash
git add /Users/leo/Documents/投研体系/scripts/log-backend.sh /Users/leo/Documents/投研体系/scripts/log-frontend.sh /Users/leo/Documents/投研体系/scripts/log-all.sh /Users/leo/Documents/投研体系/README.md
git commit -m "feat: add local log helpers"
```

### Task 3: Record the Helper Status and Run Live Log Verification

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new log helpers and the existing restart helper
- Produces: local status notes plus fresh proof that log viewing works

- [ ] **Step 1: Record the helper status in local adoption notes**

Add:

```markdown
- Repository-local log helpers now exist for reading backend/frontend runtime logs.
```

- [ ] **Step 2: Ensure services are running**

Run: `/Users/leo/Documents/投研体系/scripts/restart-all.sh`

Expected: PASS with both services relaunched and reachable.

- [ ] **Step 3: Run the aggregate log helper**

Run: `/Users/leo/Documents/投研体系/scripts/log-all.sh`

Expected: PASS with both current log files readable.

- [ ] **Step 4: Run the aggregate verification helper**

Run: `/Users/leo/Documents/投研体系/scripts/check-all.sh`

Expected: PASS with acceptance, frontend build, and backend offline verification still green.

- [ ] **Step 5: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record local log helpers"
```
