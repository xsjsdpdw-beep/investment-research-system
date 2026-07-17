import base64

from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)


def test_import_uploaded_markdown_report_to_structured_candidate():
    content = "# 行业总览\n\nHBM 需求继续上修。\n\n| 指标 | 数值 |\n| --- | --- |\n| ASP | +12% |\n"
    upload = client.post(
        "/api/myreports",
        json={
            "name": "HBM-深度.md",
            "content_b64": "data:text/markdown;base64," + base64.b64encode(content.encode("utf-8")).decode(),
        },
    )
    assert upload.status_code == 200
    meta = upload.json()["data"]
    try:
        resp = client.post(
            "/api/research/overview-workbench/render/import-report",
            json={
                "scope_type": "sector",
                "scope_id": "HBM",
                "report_id": meta["id"],
                "title": "HBM 深度",
            },
        )
        assert resp.status_code == 200
        payload = resp.json()["data"]
        assert payload["blocks"]
        assert payload["workbench"]["candidates"]
        assert payload["workbench"]["candidates"][-1]["structured_blocks"]
    finally:
        client.delete(f"/api/myreports/{meta['id']}")


def test_import_knowledge_attachment_entry_to_structured_candidate():
    content = "# 行业概览\n\n工程机械景气度回升。\n\n| 指标 | 变化 |\n| --- | --- |\n| 挖机销量 | +18% |\n"
    upload = client.post(
        "/api/myreports",
        json={
            "name": "工程机械-月报.md",
            "content_b64": "data:text/markdown;base64," + base64.b64encode(content.encode("utf-8")).decode(),
        },
    )
    assert upload.status_code == 200
    meta = upload.json()["data"]
    entry = client.post(
        "/api/knowledge/entries",
        json={
            "title": "附件投喂：工程机械月报",
            "type": "attachment_link",
            "content": f"report:{meta['id']}\n{meta['name']}",
            "related_sectors": ["工程机械"],
            "tags": ["附件"],
        },
    )
    assert entry.status_code == 200
    entry_id = entry.json()["data"]["id"]
    try:
        resp = client.post(
            "/api/research/overview-workbench/render/import-entry",
            json={
                "scope_type": "sector",
                "scope_id": "工程机械",
                "entry_id": entry_id,
            },
        )
        assert resp.status_code == 200
        payload = resp.json()["data"]
        assert payload["workbench"]["candidates"]
        candidate = payload["workbench"]["candidates"][-1]
        assert candidate["source_entry_id"] == entry_id
        assert candidate["structured_blocks"]
    finally:
        client.delete(f"/api/knowledge/entries/{entry_id}")
        client.delete(f"/api/myreports/{meta['id']}")
