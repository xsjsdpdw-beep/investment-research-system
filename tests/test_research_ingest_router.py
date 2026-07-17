from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import research_ingest


def test_detect_source_kind_routes_youdao_image_to_ocr():
    source = {
        "source_type": "note_image",
        "provider": "youdao",
        "file_path": "",
        "content": "",
    }

    result = research_ingest.detect_source_kind(source)

    assert result == "youdao_image"

