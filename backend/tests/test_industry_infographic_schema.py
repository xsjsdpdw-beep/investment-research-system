import knowledge
from fastapi.testclient import TestClient
from app import app
from knowledge import _overview_record_defaults, normalize_industry_draft_canvas


client = TestClient(app)


def test_save_draft_theme_schema_round_trips_block_edits():
    payload = {
        "scope_type": "sector",
        "scope_id": "HBM-editable-blocks",
        "schema": {
            "kind": "industry_draft_canvas",
            "version": "v2",
            "scope": "HBM",
            "tabs": [
                {
                    "id": "tab-overview",
                    "title": "总览",
                    "blocks": [
                        {
                            "id": "block-1",
                            "type": "comparison_table",
                            "title": "代际对比",
                            "spec": {"columns": ["项目", "HBM3E"], "rows": [["层数", "16Hi"]]},
                        }
                    ],
                }
            ],
        },
    }

    response = client.post("/api/research/overview-workbench/draft-theme-schema", json=payload)

    assert response.status_code == 200
    assert response.json()["data"]["draft_theme_schema"]["tabs"][0]["blocks"][0]["type"] == "comparison_table"


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

    normalized = normalize_industry_draft_canvas(raw, is_hbm_initial_draft=True)

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


def test_normalize_industry_draft_canvas_coerces_unsupported_block_and_chart_types():
    normalized = normalize_industry_draft_canvas(
        {
            "kind": "industry_draft_canvas",
            "scope": "HBM",
            "tabs": [
                {
                    "blocks": [
                        {"type": "unknown_block", "spec": {"headline": "fallback"}},
                        {"type": "chart_spec", "spec": {"chart_type": "pie"}},
                    ]
                }
            ],
        },
        is_hbm_initial_draft=True,
    )

    assert normalized["tabs"][0]["blocks"][0]["type"] == "summary_hero"
    assert normalized["tabs"][0]["blocks"][1]["spec"]["chart_type"] == "bar"


def test_overview_record_defaults_does_not_rewrite_non_hbm_canvas_schema():
    schema = {
        "kind": "industry_draft_canvas",
        "scope": "光互联",
        "tabs": [{"cards": [{"type": "unknown_block", "content": {"headline": "preserve"}}]}],
    }

    record = _overview_record_defaults("sector", "光互联", {"draft_theme_schema": schema})

    assert record["draft_theme_schema"] == schema


def test_save_draft_theme_schema_does_not_rewrite_stock_canvas_schema(monkeypatch):
    schema = {
        "kind": "industry_draft_canvas",
        "scope": "000001.SZ",
        "tabs": [{"cards": [{"type": "unknown_block", "content": {"headline": "preserve"}}]}],
    }
    record = {"draft_theme_schema": {}}
    monkeypatch.setattr(knowledge, "_get_or_create_overview_record", lambda *_args: (record, [record], 0))
    monkeypatch.setattr(knowledge, "_save_overview_workbench", lambda _items: None)

    saved = knowledge.save_overview_draft_theme_schema("stock", "000001.SZ", schema)

    assert saved["draft_theme_schema"] == schema
