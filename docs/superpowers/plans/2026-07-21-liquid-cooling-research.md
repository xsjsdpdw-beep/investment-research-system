# 液冷行业研究框架与独立网页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于用户提供的液冷框架、存储行业框架、研究规范 PDF 和公开资料，交付一份专业化液冷行业 Markdown 主文档与可独立打开的 HTML 研究报告；本轮不接入投研系统。

**Architecture:** Markdown 保存完整研究正文，结构化 JSON 保存图表、公司、指标和来源数据，Python 构建脚本读取两者生成内嵌 CSS/SVG/Vanilla JS 的独立 HTML。HTML 不依赖后端、外部 CDN 或 React，便于浏览器打开、分享和打印。研究页面首屏先给投资建议，正文按原模块顺序展开，每个模块采用“结论—逻辑—信息—验证指标”。

**Tech Stack:** Markdown、JSON、Python 3 标准库、HTML5、CSS3、SVG、Vanilla JavaScript；使用现有工作区测试工具，必要时使用 Poppler/本地浏览器完成打印与渲染检查。

## Global Constraints

- 本轮只交付 Markdown 主文档和独立 HTML，暂不修改 `frontend/src/router.tsx`、`IndustryDraftCanvas` 或后台知识库。
- 首页先给行业阶段、最佳环节、重点公司、催化剂、验证条件和风险；正文保留原 10 个模块并补充供需、商业模式、盈利模型、催化剂、风险和来源。
- 每个模块采用“本节结论 → 逻辑链条 → 支撑信息 → 验证指标”；语言保持专业研究口径，不使用“小白”“新手”等页面标签。
- 事实、预测、判断必须区分；关键数字注明日期、单位、口径和来源；无法交叉验证的数字标注“单一来源”。
- 财务数据优先使用 iFinD 多年序列；无法直接调用 iFinD 时使用公司公告/年报和公开市场数据，并明确标注来源，不将估算写成 iFinD 数据。
- 公司覆盖以 A 股为主，海外液冷龙头和核心客户作为技术、客户和商业模式对照。
- 不使用 Markdown ASCII 流程图；信息图使用内嵌 SVG/HTML 图形，HTML 脱离网络仍能显示。
- 数据优先使用截至 2026-07-21 已公开资料；原始 v2 的 2026-06-30 口径作为历史基线保留并标注。
- 所有最终数字和判断必须附来源索引或可追溯的来源 ID；不输出无法解释的精确目标价。

---

## File Map

- Create: `research/liquid-cooling/liquid_cooling_data.json` — 结构化图表、公司、指标、催化剂、风险和来源数据。
- Create: `research/liquid-cooling/液冷行业研究框架_v3.md` — 完整研究正文、来源索引和口径说明。
- Create: `research/liquid-cooling/build_liquid_cooling_report.py` — 从 Markdown 和 JSON 生成独立 HTML 的构建脚本。
- Create: `research/liquid-cooling/液冷行业研究框架_v3.html` — 生成后的独立网页报告。
- Create: `tests/test_liquid_cooling_report.py` — 数据结构、正文模块、来源、HTML 独立性和图示禁用 ASCII 的回归测试。
- Modify: none in the existing frontend or backend for this phase.

---

### Task 1: 建立证据台账与结构化研究数据

**Files:**
- Create: `research/liquid-cooling/liquid_cooling_data.json`
- Reference: `/Users/leo/Desktop/液冷行业认知框架_v2.md`
- Reference: `/Users/leo/Desktop/存储行业认知框架_v2.md`
- Reference: `/Users/leo/Desktop/同步空间/驼铃资产/驼铃资料/研究规范2024打印版2.0V2.pdf`

**Interfaces:**
- Produces: JSON object with `meta`, `thesis`, `segments`, `companies`, `metrics`, `charts`, `catalysts`, `risks`, `questions`, and `sources`; later tasks read these exact keys.
- Source IDs use stable strings such as `official-nvidia-rubin-2026-01`, `trendforce-liquid-cooling-2026`, `cn-annual-report-601956-2025` so Markdown and HTML can cite the same evidence.

- [ ] **Step 1: Extract the source claims that must be preserved**

  Build a claim list from the supplied liquid-cooling Markdown, retaining the original claim, section, date, source hint, and whether it is fact/forecast/judgment. Include the original thesis around GPU power, rack density, adoption, CDU/cold plate/UQD, company tiers, business model, tracking indicators, manufacturing, downstream applications and risks.

- [ ] **Step 2: Cross-check the research framework requirements**

  Use the PDF sections covering conclusion/investment recommendation, commercial model, P=EPS×PE, supply/demand, industry prosperity, business data, financial data, valuation and risk to ensure the data model has a field for every investment-relevant requirement.

- [ ] **Step 3: Add public-source records and source IDs**

  Collect primary or authoritative records first: NVIDIA/OCP technical standards and platform materials, company annual reports and announcements, regulatory filings, industry data releases, then high-quality domestic and overseas institutional research. Every market-size, penetration, value-share, certification and localization claim receives a source ID and date.

- [ ] **Step 4: Write the JSON schema and populate the first complete dataset**

  Use this shape and keep missing values explicit rather than inventing them:

```json
{
  "meta": {
    "version": "v3",
    "data_cutoff": "2026-07-21",
    "baseline_cutoff": "2026-06-30",
    "coverage": ["A股", "海外对标"],
    "disclaimer": "仅供研究使用，不构成投资建议。"
  },
  "thesis": {
    "stage": "",
    "best_segments": [],
    "company_priorities": [],
    "catalysts": [],
    "validation_conditions": [],
    "invalidation_conditions": []
  },
  "segments": [],
  "companies": [],
  "metrics": [],
  "charts": {
    "market_size": [],
    "penetration": [],
    "value_pool": [],
    "competition_matrix": [],
    "financials": []
  },
  "catalysts": [],
  "risks": [],
  "questions": [],
  "sources": []
}
```

- [ ] **Step 5: Run a schema check before writing prose**

  Run:

  ```bash
  python3 - <<'PY'
  import json
  from pathlib import Path
  path = Path("research/liquid-cooling/liquid_cooling_data.json")
  data = json.loads(path.read_text())
  required = {"meta", "thesis", "segments", "companies", "metrics", "charts", "catalysts", "risks", "questions", "sources"}
  missing = required - data.keys()
  assert not missing, f"missing keys: {sorted(missing)}"
  assert data["meta"]["data_cutoff"] == "2026-07-21"
  assert data["sources"], "source ledger cannot be empty"
  print("liquid_cooling_data schema: PASS")
  PY
  ```

  Expected output: `liquid_cooling_data schema: PASS`.

- [ ] **Step 6: Commit the evidence dataset**

  ```bash
  git add research/liquid-cooling/liquid_cooling_data.json
  git commit -m "research: add liquid cooling evidence dataset"
  ```

### Task 2: 编写完整 Markdown 研究正文

**Files:**
- Create: `research/liquid-cooling/液冷行业研究框架_v3.md`
- Read: `research/liquid-cooling/liquid_cooling_data.json`

**Interfaces:**
- Consumes: `meta`, `thesis`, `segments`, `companies`, `metrics`, `catalysts`, `risks`, `questions`, and `sources` from Task 1.
- Produces: prose with stable heading IDs implied by heading text, source IDs in tables/footnotes, and no ASCII diagrams.

- [ ] **Step 1: Write the investment conclusion before the industry description**

  Start with data cutoff, one-sentence thesis, best-segment decision, company priority tiers, investment horizon, catalysts, validation conditions, risks and invalidation conditions. Use “核心配置环节 / 高弹性环节 / 卡位观察环节” as research categories, not as an unqualified buy/sell instruction.

- [ ] **Step 2: Write the 16-module body in the agreed order**

  Use the following heading sequence exactly:

  1. 行业投资逻辑
  2. 跟踪体系
  3. 基础原理与技术路线
  4. 市场规模
  5. 产业链全景
  6. 上游原材料与卡脖子环节
  7. 中游制造工艺、设备与耗材
  8. 下游应用
  9. 行业竞争格局
  10. 产业链上市公司全景与财务对比
  11. 供需与产能
  12. 商业模式拆解
  13. 盈利模型、财务质量与估值
  14. 催化剂与验证条件
  15. 风险与问题清单
  16. 来源索引与口径说明

  For each module, put a short conclusion first, then the causal chain, then tables/charts and source-backed details, then the metrics or questions that would validate the conclusion.

- [ ] **Step 3: Add the required commercial-model decomposition**

  For each representative segment and company, cover R&D model, manufacturing model, pricing, order model, supply-chain model, sales model, service/replacement revenue, customer certification, payment terms, working-capital intensity and lifecycle value. Express earnings as `销量 × (价格 - 成本) + 多产品/服务收入` and connect each term to a measurable indicator.

- [ ] **Step 4: Add the multi-year financial comparison**

  Use iFinD series when available and show at least 3 years for the core A-share comparison set, with a consistent period and unit. Include revenue, gross margin, net margin, ROE, R&D rate, operating cash flow, receivables turnover, inventory turnover, capex, customer concentration and liquid-cooling disclosure status. For overseas companies, disclose currency and comparability limits.

- [ ] **Step 5: Add professional visual replacements for all diagrams**

  Use inline SVG/HTML-friendly chart blocks that the standalone builder can render without a network dependency. Do not copy the original box-drawing diagrams. Every chart/table must have a caption, unit, time period, source ID and a one-sentence interpretation.

- [ ] **Step 6: Run the Markdown content checks**

  Run:

  ```bash
  python3 - <<'PY'
  from pathlib import Path
  text = Path("research/liquid-cooling/液冷行业研究框架_v3.md").read_text()
  required = ["行业投资逻辑", "跟踪体系", "基础原理", "市场规模", "产业链全景", "上游", "中游", "下游", "竞争格局", "上市公司", "商业模式", "财务", "催化剂", "风险", "来源索引"]
  missing = [item for item in required if item not in text]
  forbidden = [char for char in "╔╗╚╝╠╣║═┌┐└┘├┤│─" if char in text]
  assert not missing, f"missing sections: {missing}"
  assert not forbidden, f"ASCII-style box drawing found: {forbidden}"
  print("liquid cooling markdown structure: PASS")
  PY
  ```

  Expected output: `liquid cooling markdown structure: PASS`.

- [ ] **Step 7: Commit the Markdown draft**

  ```bash
  git add research/liquid-cooling/液冷行业研究框架_v3.md
  git commit -m "research: draft liquid cooling industry framework"
  ```

### Task 3: 构建独立 HTML 研究报告

**Files:**
- Create: `research/liquid-cooling/build_liquid_cooling_report.py`
- Create: `research/liquid-cooling/液冷行业研究框架_v3.html`
- Read: `research/liquid-cooling/液冷行业研究框架_v3.md`
- Read: `research/liquid-cooling/liquid_cooling_data.json`

**Interfaces:**
- Commands: `python3 research/liquid-cooling/build_liquid_cooling_report.py --markdown research/liquid-cooling/液冷行业研究框架_v3.md --data research/liquid-cooling/liquid_cooling_data.json --output research/liquid-cooling/液冷行业研究框架_v3.html` to build; add `--check` with the same arguments to validate without changing the output.
- Produces: a single HTML file with inline CSS, inline SVG, inline JavaScript and all report content embedded; no remote stylesheet, script, font or image dependency.

- [ ] **Step 1: Implement a small Markdown-to-report renderer**

  Support the actual report subset: headings, paragraphs, blockquotes, ordered/unordered lists, GFM tables, emphasis, links, source IDs and horizontal rules. Preserve Chinese punctuation and avoid interpreting untrusted HTML as executable markup. Fail with a non-zero exit code when the Markdown file is missing or empty.

- [ ] **Step 2: Implement the report shell and navigation**

  Create a responsive page with a sticky chapter rail, a conclusion hero, source drawer, print styles and mobile collapse behavior. Use the agreed palette `#071522`, `#F2783F`, `#72CFFF`, `#A9B7C5`, `#F05A67`; use professional Chinese typography and monospaced metric labels.

- [ ] **Step 3: Implement the signature thermal-ribbon visuals**

  Add inline SVG/HTML visuals for:

  - chip → cold plate/UQD → Manifold → CDU → facility heat-flow path;
  - value-pool distribution across liquid-cooling segments;
  - adoption/power-density timeline;
  - company competition matrix;
  - cold-plate/CDU manufacturing process;
  - leading/synchronous/lagging tracking dashboard;
  - multi-year financial comparison.

  Use data from `liquid_cooling_data.json` so chart labels, units and source notes stay synchronized with the Markdown. Add `prefers-reduced-motion` handling and a print mode that hides controls but preserves evidence and tables.

- [ ] **Step 4: Add source interactions and accessibility**

  Make every source marker open a native `<details>` block or an accessible drawer with source title, institution, date, URL/file reference, evidence type and supported claim. Ensure every interactive element has visible focus, a text label and a keyboard path.

- [ ] **Step 5: Build the HTML and check for external dependencies**

  Run:

  ```bash
  python3 research/liquid-cooling/build_liquid_cooling_report.py \
    --markdown research/liquid-cooling/液冷行业研究框架_v3.md \
    --data research/liquid-cooling/liquid_cooling_data.json \
    --output research/liquid-cooling/液冷行业研究框架_v3.html
  rg -n 'https?://|<script[^>]+src=|<link[^>]+href=' research/liquid-cooling/液冷行业研究框架_v3.html
  ```

  Expected output: the build succeeds; the second command returns only source links inside visible source records, not external CSS/script/font dependencies.

- [ ] **Step 6: Commit the standalone report**

  ```bash
  git add research/liquid-cooling/build_liquid_cooling_report.py research/liquid-cooling/液冷行业研究框架_v3.html
  git commit -m "feat: build standalone liquid cooling research report"
  ```

### Task 4: Add regression tests for research/report integrity

**Files:**
- Create: `tests/test_liquid_cooling_report.py`
- Test: `research/liquid-cooling/liquid_cooling_data.json`
- Test: `research/liquid-cooling/液冷行业研究框架_v3.md`
- Test: `research/liquid-cooling/液冷行业研究框架_v3.html`

**Interfaces:**
- Test command: `python3 -m unittest tests/test_liquid_cooling_report.py -v`
- Produces: deterministic PASS/FAIL checks that prevent missing sections, empty sources, external asset dependencies and ASCII diagrams from slipping into the deliverable.

- [ ] **Step 1: Write the failing integrity tests**

  Include tests with these exact assertions:

  ```python
  import json
  import re
  import unittest
  from pathlib import Path

  ROOT = Path(__file__).resolve().parents[1]
  PACK = ROOT / "research/liquid-cooling"

  class LiquidCoolingReportTests(unittest.TestCase):
      @classmethod
      def setUpClass(cls):
          cls.data = json.loads((PACK / "liquid_cooling_data.json").read_text())
          cls.markdown = (PACK / "液冷行业研究框架_v3.md").read_text()
          cls.html = (PACK / "液冷行业研究框架_v3.html").read_text()

      def test_required_data_sections_exist(self):
          for key in ("meta", "thesis", "segments", "companies", "metrics", "charts", "sources"):
              self.assertIn(key, self.data)
          self.assertTrue(self.data["sources"])

      def test_required_markdown_modules_exist(self):
          for heading in ("行业投资逻辑", "跟踪体系", "基础原理", "市场规模", "产业链全景", "上市公司", "商业模式", "催化剂", "风险", "来源索引"):
              self.assertIn(heading, self.markdown)

      def test_no_box_drawing_diagrams(self):
          self.assertIsNone(re.search(r"[╔╗╚╝╠╣║═┌┐└┘├┤│─]", self.markdown))

      def test_html_contains_conclusion_and_visuals(self):
          self.assertIn("投资建议", self.html)
          self.assertIn("thermal-ribbon", self.html)
          self.assertIn("<svg", self.html)

      def test_html_has_no_external_asset_tags(self):
          self.assertIsNone(re.search(r"<(script|link)[^>]+(src|href)=['\"]https?://", self.html, re.I))

  if __name__ == "__main__":
      unittest.main()
  ```

- [ ] **Step 2: Run the tests before the final QA pass**

  ```bash
  python3 -m unittest tests/test_liquid_cooling_report.py -v
  ```

  Expected output: all integrity tests pass. If the HTML has not been built yet, the expected failure is limited to missing report artifact; rebuild Task 3 and rerun.

- [ ] **Step 3: Commit the tests**

  ```bash
  git add tests/test_liquid_cooling_report.py
  git commit -m "test: verify liquid cooling report integrity"
  ```

### Task 5: Visual, print and final evidence QA

**Files:**
- Verify: `research/liquid-cooling/液冷行业研究框架_v3.md`
- Verify: `research/liquid-cooling/液冷行业研究框架_v3.html`
- Verify: `research/liquid-cooling/liquid_cooling_data.json`

**Interfaces:**
- Consumes: the completed Markdown, JSON and HTML from Tasks 1–4.
- Produces: a reviewed deliverable with aligned conclusions, chart labels, source IDs, navigation, responsive layout and print output.

- [ ] **Step 1: Serve the report locally and check the HTTP response**

  Run:

  ```bash
  python3 -m http.server 4173 --directory research/liquid-cooling >/tmp/liquid-cooling-http.log 2>&1 &
  SERVER_PID=$!
  curl -fsS http://127.0.0.1:4173/液冷行业研究框架_v3.html | rg -n '投资建议|行业投资逻辑|来源索引|<svg'
  kill "$SERVER_PID"
  ```

  Expected output: all four markers are present and the server exits cleanly.

- [ ] **Step 2: Inspect desktop, narrow and print layouts**

  Open the local HTML in the available browser/runtime at desktop width, narrow mobile width and print preview. Verify that the conclusion is visible before scrolling, charts do not overlap, tables can scroll horizontally on narrow screens, focus styles are visible, and print mode removes controls without removing source notes.

- [ ] **Step 3: Render a print sample and inspect the image**

  If a Chromium-compatible headless browser is available, export the first page to PDF; otherwise use the available local browser print preview. Render the PDF page to PNG with the bundled `pdftoppm` and inspect it for clipped Chinese text, broken table rows, missing SVGs, black blocks or unreadable source labels.

- [ ] **Step 4: Run the complete local verification suite**

  ```bash
  python3 -m unittest tests/test_liquid_cooling_report.py -v
  python3 research/liquid-cooling/build_liquid_cooling_report.py --check \
    --markdown research/liquid-cooling/液冷行业研究框架_v3.md \
    --data research/liquid-cooling/liquid_cooling_data.json \
    --output research/liquid-cooling/液冷行业研究框架_v3.html
  git diff --check
  ```

  Expected output: all tests pass, the builder reports a valid synchronized report, and `git diff --check` has no whitespace errors.

- [ ] **Step 5: Commit the final research package**

  ```bash
  git add research/liquid-cooling tests/test_liquid_cooling_report.py
  git commit -m "research: finalize liquid cooling framework and report"
  ```
