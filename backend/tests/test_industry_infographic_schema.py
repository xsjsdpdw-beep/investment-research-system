from knowledge import _overview_record_defaults, normalize_industry_draft_canvas


def test_normalize_industry_draft_canvas_migrates_cards_to_blocks():
    raw = {
        "kind": "industry_draft_canvas",
        "version": "v1",
        "scope": "HBM",
        "tabs": [
            {
                "id": "tab-overview",
                "title": "总览",
                "cards": [
                    {
                        "id": "card-1",
                        "type": "summary_hero",
                        "title": "景气总览",
                        "content": {"headline": "HBM 需求偏强"},
                    }
                ],
            }
        ],
    }

    normalized = normalize_industry_draft_canvas(raw)

    assert "cards" not in normalized["tabs"][0]
    assert normalized["tabs"][0]["blocks"][0]["type"] == "summary_hero"
    assert normalized["tabs"][0]["blocks"][0]["spec"]["headline"] == "HBM 需求偏强"


def test_overview_record_defaults_migrates_persisted_canvas_cards_to_blocks():
    record = _overview_record_defaults(
        "sector",
        "HBM",
        {
            "draft_theme_schema": {
                "kind": "industry_draft_canvas",
                "tabs": [{"id": "tab-overview", "title": "总览", "cards": [{"content": {"headline": "HBM 需求偏强"}}]}],
            }
        },
    )

    assert record["draft_theme_schema"]["tabs"][0]["blocks"][0]["spec"]["headline"] == "HBM 需求偏强"
