from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import research_ingest


def test_extract_pdf_report_to_blocks_falls_back_to_paragraph_blocks(tmp_path):
    report = tmp_path / "sample.md"
    report.write_text("# HBM行业\n\n需求继续扩张。\n\n| 环节 | 份额 |\n| --- | --- |\n| HBM | 32% |\n", encoding="utf-8")

    blocks = research_ingest.extract_pdf_report_to_blocks(str(report), "HBM行业")

    assert blocks[0]["type"] == "section"
    assert blocks[0]["title"] == "HBM行业"
    assert any(block["type"] == "table" for block in blocks[0]["children"])
