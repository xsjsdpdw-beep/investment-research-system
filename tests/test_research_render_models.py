from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import knowledge


def test_normalize_structured_render_block_defaults():
    block = knowledge.normalize_structured_render_block({
        "type": "paragraph",
        "title": "核心结论",
        "content": "需求继续改善。",
    })

    assert block["type"] == "paragraph"
    assert block["title"] == "核心结论"
    assert block["content"] == "需求继续改善。"
    assert block["children"] == []
    assert block["source_refs"] == []
    assert block["render_hint"] == {}
