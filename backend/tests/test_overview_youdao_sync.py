from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def workspace_bundle(tmp_path, monkeypatch):
    monkeypatch.setenv("VR_DATA_DIR", str(tmp_path))
    import knowledge
    import research_ingest
    import research_hub
    import app as app_module

    importlib.reload(knowledge)
    importlib.reload(research_ingest)
    importlib.reload(research_hub)
    importlib.reload(app_module)
    return {
        "client": TestClient(app_module.app),
        "knowledge": knowledge,
        "app_module": app_module,
    }


def test_syncing_youdao_main_note_persists_structured_blocks(workspace_bundle, monkeypatch):
    client: TestClient = workspace_bundle["client"]
    knowledge = workspace_bundle["knowledge"]
    app_module = workspace_bundle["app_module"]

    note_content = """20260430三一重工：关键数据库
问题清单
1、管理
今年经营目标展望，目前环境下是否能完成15%的营收增长。
2、业务
（1）产品
电动挖机行业渗透率只有0.2%。
3、财务
Q2 汇率影响情况如何。
"""

    monkeypatch.setattr(
        app_module.youdao_sync,
        "read_note",
        lambda file_id: {"content": note_content},
    )

    bind = client.post(
        "/api/research/overview-workbench/editor/bind",
        json={
            "scope_type": "stock",
            "scope_id": "600031.SH",
            "provider": "youdao",
            "file_id": "note-600031",
            "title": "20260515【三一重工框架】.note",
            "parent_id": "",
            "content": "",
        },
    )
    assert bind.status_code == 200

    sync = client.post(
        "/api/research/overview-workbench/editor/sync",
        json={"scope_type": "stock", "scope_id": "600031.SH"},
    )
    assert sync.status_code == 200

    record = knowledge.get_overview_workbench("stock", "600031.SH")
    deep_blocks = record["deep_structured_blocks"]

    assert deep_blocks
    assert deep_blocks[0]["title"] == "20260430三一重工：关键数据库"
    child_titles = [child["title"] for child in deep_blocks[0]["children"] if child["type"] == "section"]
    assert "问题清单" in child_titles
