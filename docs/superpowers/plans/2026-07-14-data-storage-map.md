# Data Storage Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-local data storage map that documents current backend file paths, browser local storage keys, environment-variable overrides, compatibility constraints, and backup guidance.

**Architecture:** This is a documentation-only change with a lightweight acceptance test. We will add a single doc file, verify it names the required storage paths and keys, and update local adoption notes to point at it.

**Tech Stack:** Markdown, pytest source assertions

## Global Constraints

- Do not change any storage behavior.
- Do not rename `~/.vibe-research`.
- Do not migrate browser `localStorage` keys.
- Do not change backend environment-variable behavior.
- Do not change frontend code.
- Do not add an in-app UI entry for this documentation.

---

### Task 1: Add Documentation Acceptance Test

**Files:**
- Modify: `/Users/leo/Documents/投研体系/tests/test_branding_acceptance.py`

**Interfaces:**
- Consumes: repository docs as plain text
- Produces: a failing acceptance test that locks the required data map content

- [ ] **Step 1: Add a failing documentation test**

```python
def test_data_storage_map_documents_current_storage_layout():
    storage_map = read("docs/data-storage-map.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "# Data Storage Map" in storage_map
    assert "~/.vibe-research/portfolio.json" in storage_map
    assert "~/.vibe-research/myreports/" in storage_map
    assert "VR_DATA_DIR" in storage_map
    assert "VR_REPORTS_DIR" in storage_map
    assert "vr-watchlist" in storage_map
    assert "vr-notes" in storage_map
    assert "vr-llm" in storage_map
    assert "vr-access-key" in storage_map
    assert "vr-theme" in storage_map
    assert "vr-sidebar" in storage_map
    assert "backend-managed files" in storage_map
    assert "browser-managed local data" in storage_map
    assert "A data storage map is now documented" in local_notes
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: FAIL because `docs/data-storage-map.md` does not exist yet and local notes do not mention the storage map.

- [ ] **Step 3: Commit the red test**

```bash
git add /Users/leo/Documents/投研体系/tests/test_branding_acceptance.py
git commit -m "test: require data storage map documentation"
```

### Task 2: Add the Data Storage Map Document

**Files:**
- Create: `/Users/leo/Documents/投研体系/docs/data-storage-map.md`

**Interfaces:**
- Consumes: storage details from backend and frontend source code
- Produces: one canonical storage map document

- [ ] **Step 1: Create the document with current storage sections**

The document should include these sections:

```markdown
# Data Storage Map

## Backend-Managed Files
## Browser-Managed Local Data
## Environment Variable Overrides
## Compatibility Notes
## Backup Guidance
```

- [ ] **Step 2: Document backend-managed file storage**

Include:

```markdown
- Portfolio data: `~/.vibe-research/portfolio.json`
- Report files: `~/.vibe-research/myreports/`
- `VR_DATA_DIR` overrides the backend data root
- `VR_REPORTS_DIR` overrides the report directory directly
- Older in-repo cache locations existed under `backend/.cache/`
```

- [ ] **Step 3: Document browser-managed local data**

Include:

```markdown
- `vr-watchlist`
- `vr-notes`
- `vr-llm`
- `vr-access-key`
- `vr-theme`
- `vr-sidebar`
```

Each item should say what it stores and that it lives in the browser, not in the repo folder.

- [ ] **Step 4: Document compatibility and backup guidance**

Include:

```markdown
- `~/.vibe-research` remains unchanged for compatibility.
- Browser storage keys still use the `vr-` prefix.
- To back up backend-managed files, back up the relevant user-directory content.
- To preserve browser-only data, back up the browser profile or export through a future workflow.
```

- [ ] **Step 5: Run the documentation acceptance test**

Run: `backend/.venv/bin/python -m pytest tests/test_branding_acceptance.py -q`

Expected: PASS with documentation assertions and existing branding/config assertions all passing.

- [ ] **Step 6: Commit the document**

```bash
git add /Users/leo/Documents/投研体系/docs/data-storage-map.md
git commit -m "docs: add data storage map"
```

### Task 3: Update Local Adoption Notes and Verify

**Files:**
- Modify: `/Users/leo/Documents/投研体系/docs/local-adoption-notes.md`

**Interfaces:**
- Consumes: the new storage map document
- Produces: rollout notes that point future work to the new document

- [ ] **Step 1: Add a short status line to local adoption notes**

Add this line under `Stage 2 Status`:

```markdown
- A data storage map is now documented in `docs/data-storage-map.md`.
```

- [ ] **Step 2: Run backend offline tests**

Run: `cd /Users/leo/Documents/投研体系/backend && .venv/bin/pytest -m "not live"`

Expected: PASS with backend offline tests passing.

- [ ] **Step 3: Commit the note update**

```bash
git add /Users/leo/Documents/投研体系/docs/local-adoption-notes.md
git commit -m "docs: record data storage map status"
```
