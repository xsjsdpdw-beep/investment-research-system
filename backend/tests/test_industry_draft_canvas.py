from fastapi.testclient import TestClient

from app import app
import knowledge


client = TestClient(app)


def test_save_draft_theme_schema_round_trips_industry_canvas():
    payload = {
        "scope_type": "sector",
        "scope_id": "HBM-canvas-save",
        "schema": {
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
                            "layout": "hero",
                            "content": {"headline": "HBM 需求偏强", "bullets": [], "tags": []},
                        }
                    ],
                }
            ],
            "meta": {"generated_at": "2026-07-18T00:00:00+08:00", "source_mode": "auto"},
        },
    }

    response = client.post("/api/research/overview-workbench/draft-theme-schema", json=payload)

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["draft_theme_schema"]["kind"] == "industry_draft_canvas"
    stored = knowledge.get_overview_workbench("sector", "HBM-canvas-save")
    assert stored["draft_theme_schema"]["tabs"][0]["title"] == "总览"
