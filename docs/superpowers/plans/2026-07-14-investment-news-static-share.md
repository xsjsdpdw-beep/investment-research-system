# Investment News Static Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-command export flow that turns the current local `investment-news` dashboard snapshot into a clean static package that can be uploaded to any static host.

**Architecture:** Keep the existing local dashboard untouched and add a small export layer beside it. The export script reads the current `index.html` and `data.js`, writes a share-safe `share_dist/` directory, and rewrites only the exported HTML so refresh becomes clearly disabled in the shared snapshot.

**Tech Stack:** Python 3 standard library, existing single-file HTML dashboard, existing `data.js` snapshot format, repository Markdown docs

## Global Constraints

- Do not build a public live-refresh service.
- Do not add cloud deployment automation in this step.
- Do not change how the local dashboard works on `localhost`.
- Do not require a database, build system, or new third-party dependencies.
- Do not make the shared version regenerate news or AI summaries online.
- Do not redesign the dashboard UI.

---

## File Structure

- Create: `/Users/leo/.codex/skills/investment-news/scripts/export_static_share.py`
  - Single-purpose export entry point that validates inputs, prepares `share_dist/`, and rewrites exported HTML safely.
- Create: `/Users/leo/.codex/skills/investment-news/tests/test_export_static_share.py`
  - Standard-library test coverage for export behavior, using temporary directories and fixture HTML snippets.
- Modify: `/Users/leo/.codex/skills/investment-news/README.md`
  - Add a short “share snapshot” usage section with exact export command and hosting expectations.

## Task 1: Add export script and focused tests

**Files:**
- Create: `/Users/leo/.codex/skills/investment-news/scripts/export_static_share.py`
- Create: `/Users/leo/.codex/skills/investment-news/tests/test_export_static_share.py`

**Interfaces:**
- Consumes: existing `/Users/leo/.codex/skills/investment-news/index.html`, existing `/Users/leo/.codex/skills/investment-news/data.js`
- Produces:
  - `build_share_snapshot(root: Path, output_dir_name: str = "share_dist") -> Path`
  - `rewrite_share_html(html: str) -> str`
  - CLI entry point: `python3 scripts/export_static_share.py`

- [ ] **Step 1: Write the failing test**

```python
import tempfile
import unittest
from pathlib import Path

from scripts.export_static_share import build_share_snapshot, rewrite_share_html


class ExportStaticShareTests(unittest.TestCase):
    def test_rewrite_share_html_disables_refresh_without_api_refresh(self):
        source = """
        <button class="refresh" id="refreshBtn" title="刷新"><span class="ri">⟳</span></button>
        <script>
        document.getElementById('refreshBtn').onclick = async function(){
          await fetch('/api/refresh', {method:'POST'});
        };
        </script>
        """
        html = rewrite_share_html(source)
        self.assertIn("快照分享版", html)
        self.assertIn("disabled", html)
        self.assertNotIn("/api/refresh", html)

    def test_build_share_snapshot_writes_clean_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").write_text(
                "<button class='refresh' id='refreshBtn'>⟳</button>"
                "<script>fetch('/api/refresh')</script>",
                encoding="utf-8",
            )
            (root / "data.js").write_text("window.DATA = {};\n", encoding="utf-8")

            output = build_share_snapshot(root)

            self.assertEqual(output, root / "share_dist")
            self.assertTrue((output / "index.html").exists())
            self.assertTrue((output / "data.js").exists())
            self.assertNotIn("/api/refresh", (output / "index.html").read_text(encoding="utf-8"))
            self.assertEqual((output / "data.js").read_text(encoding="utf-8"), "window.DATA = {};\n")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/leo/.codex/skills/investment-news && python3 -m unittest tests.test_export_static_share -v`

Expected: FAIL with `ModuleNotFoundError` or `ImportError` because `scripts/export_static_share.py` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```python
#!/usr/bin/env python3
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR_NAME = "share_dist"


def rewrite_share_html(html: str) -> str:
    html = html.replace("/api/refresh", "")
    html = html.replace(
        'class="refresh" id="refreshBtn" title="刷新:重新抓取 + AI 要点 + 翻译"',
        'class="refresh" id="refreshBtn" title="快照分享版: 在线刷新不可用" disabled aria-disabled="true"',
    )
    html = html.replace(
        '<div class="bt">投资资讯<br><small>Investment News</small></div>',
        '<div class="bt">投资资讯<br><small>Investment News · 快照分享版</small></div>',
    )
    html = html.replace(
        "document.getElementById('refreshBtn')",
        "null",
    )
    return html


def build_share_snapshot(root: Path, output_dir_name: str = OUTPUT_DIR_NAME) -> Path:
    index_path = root / "index.html"
    data_path = root / "data.js"
    if not index_path.exists():
        raise FileNotFoundError(f"Missing required file: {index_path}")
    if not data_path.exists():
        raise FileNotFoundError(f"Missing required file: {data_path}")

    output_dir = root / output_dir_name
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    html = rewrite_share_html(index_path.read_text(encoding="utf-8"))
    (output_dir / "index.html").write_text(html, encoding="utf-8")
    shutil.copy2(data_path, output_dir / "data.js")
    return output_dir


def main() -> None:
    output_dir = build_share_snapshot(ROOT)
    print(f"Static share snapshot written to: {output_dir}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/leo/.codex/skills/investment-news && python3 -m unittest tests.test_export_static_share -v`

Expected: PASS with both tests green.

- [ ] **Step 5: Commit**

```bash
git -C /Users/leo/Documents/投研体系 add \
  /Users/leo/.codex/skills/investment-news/scripts/export_static_share.py \
  /Users/leo/.codex/skills/investment-news/tests/test_export_static_share.py
git -C /Users/leo/Documents/投研体系 commit -m "feat: add investment-news static share export"
```

## Task 2: Verify real export output against the actual dashboard snapshot

**Files:**
- Modify: `/Users/leo/.codex/skills/investment-news/scripts/export_static_share.py`
- Test: `/Users/leo/.codex/skills/investment-news/share_dist/index.html`
- Test: `/Users/leo/.codex/skills/investment-news/share_dist/data.js`

**Interfaces:**
- Consumes:
  - `build_share_snapshot(root: Path, output_dir_name: str = "share_dist") -> Path`
  - live local snapshot files at `/Users/leo/.codex/skills/investment-news/index.html` and `/Users/leo/.codex/skills/investment-news/data.js`
- Produces:
  - real exported directory `/Users/leo/.codex/skills/investment-news/share_dist/`
  - stable CLI success output for repeated export runs

- [ ] **Step 1: Write the failing verification command**

```bash
cd /Users/leo/.codex/skills/investment-news
python3 scripts/export_static_share.py
grep -n "/api/refresh" share_dist/index.html
```

Expected: The export command may succeed, but `grep` should still find `/api/refresh` if the first-pass rewrite is incomplete.

- [ ] **Step 2: Run verification to capture the real mismatch**

Run:

```bash
cd /Users/leo/.codex/skills/investment-news
python3 scripts/export_static_share.py
grep -n "/api/refresh" share_dist/index.html || true
grep -n "快照分享版" share_dist/index.html || true
```

Expected: Use the output to identify any remaining live-refresh wiring or any missing shared-label copy in the real exported page.

- [ ] **Step 3: Tighten the export implementation minimally**

```python
def rewrite_share_html(html: str) -> str:
    html = html.replace("/api/refresh", "")
    html = html.replace(
        'class="refresh" id="refreshBtn" title="刷新:重新抓取 + AI 要点 + 翻译"',
        'class="refresh" id="refreshBtn" title="快照分享版: 在线刷新不可用" disabled aria-disabled="true"',
    )
    html = html.replace(
        '<div class="bt">投资资讯<br><small>Investment News</small></div>',
        '<div class="bt">投资资讯<br><small>Investment News · 快照分享版</small></div>',
    )
    html = html.replace(
        "var btn = document.getElementById('refreshBtn');",
        "var btn = document.getElementById('refreshBtn'); if (btn) { btn.disabled = true; }",
    )
    html = html.replace(
        "btn.onclick = async function(){",
        "if (btn) btn.onclick = function(){ return false; };",
    )
    return html
```

Use the exact string replacements that match the real file content discovered in Step 2. Do not refactor the page broadly; only neutralize the local-only refresh affordance in exported output.

- [ ] **Step 4: Run export and static smoke checks**

Run:

```bash
cd /Users/leo/.codex/skills/investment-news
python3 scripts/export_static_share.py
test -f share_dist/index.html
test -f share_dist/data.js
! grep -q "/api/refresh" share_dist/index.html
grep -q "快照分享版" share_dist/index.html
python3 -m http.server 8794 --directory share_dist >/tmp/investment-news-share.log 2>&1 &
SERVER_PID=$!
sleep 1
curl -I -s http://127.0.0.1:8794/index.html
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null || true
```

Expected: exported files exist, `/api/refresh` is absent, `快照分享版` is present, and the static server responds `HTTP/1.0 200 OK` or `HTTP/1.1 200 OK`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/leo/Documents/投研体系 add \
  /Users/leo/.codex/skills/investment-news/scripts/export_static_share.py \
  /Users/leo/.codex/skills/investment-news/share_dist/index.html \
  /Users/leo/.codex/skills/investment-news/share_dist/data.js
git -C /Users/leo/Documents/投研体系 commit -m "test: verify investment-news static share output"
```

## Task 3: Document the snapshot sharing workflow

**Files:**
- Modify: `/Users/leo/.codex/skills/investment-news/README.md`

**Interfaces:**
- Consumes:
  - `python3 scripts/export_static_share.py`
  - output directory `/Users/leo/.codex/skills/investment-news/share_dist/`
- Produces:
  - README section documenting export command and static-host upload expectations

- [ ] **Step 1: Write the failing doc check**

```bash
cd /Users/leo/.codex/skills/investment-news
rg -n "share_dist|export_static_share|静态分享|快照分享" README.md
```

Expected: FAIL to find any share-export documentation before the README is updated.

- [ ] **Step 2: Run the doc check to verify the gap**

Run: `cd /Users/leo/.codex/skills/investment-news && rg -n "share_dist|export_static_share|静态分享|快照分享" README.md`

Expected: no matches.

- [ ] **Step 3: Write the minimal documentation**

```md
## 分享当前看板快照

如果你想把当前已经生成好的资讯看板分享给别人看，可以导出一个静态快照版本：

```bash
python3 scripts/export_static_share.py
```

导出后会生成：

```text
share_dist/
├── index.html
└── data.js
```

说明：

- 这是一个固定快照版，不会在线刷新资讯
- 适合上传到 GitHub Pages、Netlify、Vercel 等静态托管
- 本地版的 `server.py`、刷新按钮和抓取脚本仍然保留，导出不会改动原始本地看板
```

Place this section near the existing local usage guidance so the difference between local mode and shared static mode is obvious.

- [ ] **Step 4: Run the doc verification**

Run:

```bash
cd /Users/leo/.codex/skills/investment-news
rg -n "share_dist|export_static_share|静态快照|固定快照" README.md
```

Expected: matches for the new export command and snapshot explanation.

- [ ] **Step 5: Commit**

```bash
git -C /Users/leo/Documents/投研体系 add /Users/leo/.codex/skills/investment-news/README.md
git -C /Users/leo/Documents/投研体系 commit -m "docs: explain investment-news static share export"
```
