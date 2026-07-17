from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import research_ingest


def test_engine_status_includes_core_engines(monkeypatch):
    monkeypatch.setattr(research_ingest, "_module_exists", lambda name: name == "pypdf")
    monkeypatch.setattr(research_ingest, "_command_exists", lambda name: name == "tesseract")
    monkeypatch.setattr(research_ingest.os.environ, "get", lambda key, default="": "/tmp/umi" if key == "VR_UMI_OCR_CMD" else default)

    status = research_ingest.engine_status()

    assert status["pypdf"]["ready"] is True
    assert status["mineru"]["ready"] is False
    assert status["tesseract"]["ready"] is True
    assert status["umi_ocr"]["ready"] is True
