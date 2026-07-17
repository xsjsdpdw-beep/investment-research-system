from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import knowledge


def test_apply_overview_candidate_keeps_structured_blocks():
    knowledge.save_overview_draft("sector", "HBM", {"summary": "", "modules": [], "sources": [], "keywords": []})
    knowledge.save_overview_deep_cards("sector", "HBM", [{
        "id": "card-market",
        "title": "市场规模",
        "body": "旧内容",
        "content_blocks": [],
    }])
    knowledge.append_overview_candidates("sector", "HBM", "report", [{
        "id": "candidate-market",
        "title": "市场规模更新",
        "summary": "新证据",
        "structured_blocks": [{"id": "b1", "type": "paragraph", "title": "", "content": "新证据", "children": []}],
        "proposed_patch": "新证据",
    }])

    result = knowledge.apply_overview_candidate("sector", "HBM", "candidate-market", "append", {"card_id": "card-market"})

    assert result["candidate"]["status"] == "accepted"
    assert result["card"]["content_blocks"]
    assert result["version"]["after_snapshot"]["content_blocks"]
