from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import research_ingest


def test_extract_youdao_note_to_blocks_preserves_headings(monkeypatch):
    monkeypatch.setattr(
        research_ingest.youdao_sync,
        "read_note",
        lambda file_id: {"content": "# 工程机械\n\n## 产业链\n\n主机厂需求回暖。"},
    )

    content, blocks = research_ingest.extract_youdao_note_to_blocks("note-1", "工程机械")

    assert "工程机械" in content
    assert blocks[0]["title"] == "工程机械"
    assert blocks[0]["children"][0]["title"] == "产业链"
