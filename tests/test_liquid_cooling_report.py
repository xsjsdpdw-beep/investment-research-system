import json
import re
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "research" / "liquid-cooling"
DATA_PATH = REPORT_DIR / "liquid_cooling_data.json"
MARKDOWN_PATH = REPORT_DIR / "液冷行业研究框架_v3.md"
HTML_PATH = REPORT_DIR / "液冷行业研究框架_v3.html"
BUILDER_PATH = REPORT_DIR / "build_liquid_cooling_report.py"


class LiquidCoolingReportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        cls.markdown = MARKDOWN_PATH.read_text(encoding="utf-8")
        cls.html = HTML_PATH.read_text(encoding="utf-8")

    def test_data_schema_and_source_ledger(self):
        required = {
            "meta",
            "thesis",
            "segments",
            "companies",
            "metrics",
            "charts",
            "catalysts",
            "risks",
            "questions",
            "sources",
        }
        self.assertTrue(required.issubset(self.data))
        self.assertEqual(self.data["meta"]["data_cutoff"], "2026-07-21")
        self.assertGreaterEqual(len(self.data["sources"]), 15)
        self.assertEqual(len({source["id"] for source in self.data["sources"]}), len(self.data["sources"]))

    def test_markdown_keeps_required_research_modules(self):
        required = [
            "行业投资逻辑",
            "跟踪体系",
            "基础原理与技术路线",
            "市场规模情况",
            "产业链全景分析",
            "上游原材料与卡脖子环节",
            "中游制造工艺、设备与耗材",
            "下游应用领域",
            "行业竞争格局分析",
            "产业链上市公司全景与财务对比",
            "供需与产能",
            "商业模式拆解",
            "盈利模型、财务质量与估值",
            "催化剂与验证条件",
            "风险与问题清单",
            "来源索引与口径说明",
        ]
        for heading in required:
            self.assertIn(heading, self.markdown)
        self.assertNotIn("╔", self.markdown)
        self.assertNotIn("║", self.markdown)
        self.assertIn("2023—2025财务对比", self.markdown)
        self.assertIn("订单金额不看验收回款", self.markdown)
        self.assertEqual(self.markdown.count("assets/"), 11)

    def test_html_is_standalone_and_visual(self):
        self.assertIn("THERMAL CARTOGRAPHY", self.html)
        self.assertGreaterEqual(self.html.count("<svg"), 12)
        self.assertIn("source-drawer", self.html)
        self.assertIn("data-open-drawer", self.html)
        for visual_label in [
            "TRACKING SYSTEM",
            "TECHNOLOGY MAP",
            "SUPPLY CHAIN ATLAS",
            "MANUFACTURING RIBBON",
            "BUSINESS MODEL LOOP",
            "CATALYST TIMELINE",
            "FINANCIAL DASHBOARD",
            "SUPPLY CHAIN VALUE FLOW",
            "PENETRATION CURVE",
            "data-details",
        ]:
            self.assertIn(visual_label, self.html)
        self.assertIn("HARDWARE BOARD", self.html)
        self.assertIn('class="data-details"', self.html)
        self.assertGreaterEqual(self.html.count("data:image/jpeg;base64"), 6)
        self.assertNotRegex(self.html, r"<link[^>]+https?://")
        self.assertNotRegex(self.html, r"<script[^>]+src=")
        self.assertNotRegex(self.html, r"<img[^>]+src=\"https?://")
        self.assertNotIn("react", self.html.lower())

    def test_financial_data_has_three_annual_periods(self):
        annual = [row for row in self.data["charts"]["financials"] if row.get("period") is None]
        by_ticker = {}
        for row in annual:
            by_ticker.setdefault(row["ticker"], set()).add(row["year"])
        self.assertTrue(any(years == {2023, 2024, 2025} for years in by_ticker.values()))
        self.assertTrue(any(row.get("ocf") is not None for row in annual))

    def test_builder_check(self):
        result = subprocess.run(
            [
                sys.executable,
                str(BUILDER_PATH),
                "--markdown",
                str(MARKDOWN_PATH),
                "--data",
                str(DATA_PATH),
                "--output",
                str(HTML_PATH),
                "--check",
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertIn("PASS", result.stdout)


if __name__ == "__main__":
    unittest.main()
