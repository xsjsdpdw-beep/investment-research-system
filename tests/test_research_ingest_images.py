from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import research_ingest


def test_extract_image_to_blocks_uses_ocr_fallback(monkeypatch, tmp_path):
    image = tmp_path / "note.png"
    image.write_bytes(b"fake")
    monkeypatch.setattr(research_ingest, "_run_paddleocr_if_available", lambda path: None)
    monkeypatch.setattr(research_ingest, "_run_umiocr_if_available", lambda path: {"text": "渠道库存下降"})

    blocks = research_ingest.extract_image_to_blocks(str(image), "渠道反馈")

    assert blocks
    assert any("渠道库存下降" in (block.get("content") or "") for block in blocks[0]["children"])
