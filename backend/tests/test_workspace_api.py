"""一期工作台接口回归测：本地知识库 / 投资日历 / 关注列表 / AI 产物 / 数据库样板。"""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def workspace_client(tmp_path, monkeypatch):
    monkeypatch.setenv("VR_DATA_DIR", str(tmp_path))
    import database_modules
    import knowledge
    import research_hub
    import app as app_module

    importlib.reload(database_modules)
    importlib.reload(knowledge)
    importlib.reload(research_hub)
    importlib.reload(app_module)
    return TestClient(app_module.app)


def test_knowledge_entry_roundtrip_and_search(workspace_client: TestClient):
    create = workspace_client.post("/api/knowledge/entries", json={
        "title": "工程机械周观点",
        "type": "memo",
        "content": "本周继续跟踪工程机械出口和开工率。\n\n结论偏积极。",
        "tags": ["工程机械", "周观点"],
        "related_sectors": ["工程机械"],
        "related_stocks": ["000425.SZ"],
    })
    assert create.status_code == 200
    entry = create.json()["data"]
    assert entry["title"] == "工程机械周观点"
    assert entry["summary_status"] == "pending"
    assert entry["content"].startswith("本周继续")

    entry_id = entry["id"]
    fetched = workspace_client.get(f"/api/knowledge/entries/{entry_id}")
    assert fetched.status_code == 200
    assert fetched.json()["data"]["id"] == entry_id

    updated = workspace_client.put(f"/api/knowledge/entries/{entry_id}", json={
        "title": "工程机械周观点更新",
        "content": "更新后的内容，补充挖机销量和出口表现。",
        "tags": ["工程机械", "更新"],
    })
    assert updated.status_code == 200
    assert updated.json()["data"]["title"] == "工程机械周观点更新"

    search = workspace_client.get("/api/knowledge/search?q=挖机")
    assert search.status_code == 200
    assert [item["id"] for item in search.json()["data"]][0] == entry_id

    filtered = workspace_client.get("/api/knowledge/entries?kind=memo&sector=工程机械")
    assert filtered.status_code == 200
    assert filtered.json()["data"][0]["id"] == entry_id

    removed = workspace_client.delete(f"/api/knowledge/entries/{entry_id}")
    assert removed.status_code == 200
    assert removed.json()["data"]["ok"] is True
    assert workspace_client.get(f"/api/knowledge/entries/{entry_id}").status_code == 404


def test_calendar_watchlist_and_artifact_endpoints(workspace_client: TestClient):
    event = workspace_client.post("/api/calendar/events", json={
        "title": "国务院发布会",
        "date": "2026-07-18",
        "category": "macro",
        "importance": "high",
        "source": "manual",
        "notes": "关注稳增长政策表述。",
    })
    assert event.status_code == 200
    event_id = event.json()["data"]["id"]

    listing = workspace_client.get("/api/calendar/events?view=upcoming")
    assert listing.status_code == 200
    assert any(item["id"] == event_id for item in listing.json()["data"])

    watchlist = workspace_client.put("/api/watchlist", json={
        "stocks": [
            {"code": "000425", "market": "SZ", "name": "徐工机械", "group": "工程机械", "sort_order": 0},
            {"code": "002595", "market": "SZ", "name": "豪迈科技", "group": "高端制造", "sort_order": 1},
        ],
        "indicators": [
            {"key": "cn_cpi", "label": "中国CPI", "category": "宏观", "value": "0.1%", "note": "最新月度"},
        ],
    })
    assert watchlist.status_code == 200
    assert len(watchlist.json()["data"]["stocks"]) == 2

    entry = workspace_client.post("/api/knowledge/entries", json={
        "title": "徐工机械调研纪要",
        "type": "research_note",
        "content": "公司反馈出口订单保持较快增长，国内需求温和复苏。",
        "related_stocks": ["000425.SZ"],
    }).json()["data"]
    entry_id = entry["id"]

    summary = workspace_client.post(f"/api/knowledge/entries/{entry_id}/summary")
    assert summary.status_code == 200
    assert summary.json()["data"]["summary_status"] == "ready"
    assert "出口订单保持较快增长" in summary.json()["data"]["summary_text"]

    artifact = workspace_client.post(f"/api/knowledge/entries/{entry_id}/image-artifact")
    assert artifact.status_code == 200
    assert artifact.json()["data"]["image_artifact_status"] == "prepared"
    assert artifact.json()["data"]["artifact_request"]["entry_id"] == entry_id


def test_workspace_hub_and_macro_shell(workspace_client: TestClient):
    workspace_client.put("/api/watchlist", json={
        "stocks": [{"code": "000425", "market": "SZ", "name": "徐工机械", "group": "工程机械", "sort_order": 0}],
        "indicators": [],
    })
    workspace_client.post("/api/knowledge/entries", json={
        "title": "工程机械行业卡片",
        "type": "sector_profile",
        "content": "行业核心跟踪挖机销量、装载机销量、开工率。",
        "related_sectors": ["工程机械"],
    })
    workspace_client.post("/api/knowledge/entries", json={
        "title": "周度复盘 2026-07-13",
        "type": "weekly_review",
        "content": "本周行业观点延续积极，继续关注工程机械与出口链。",
        "related_sectors": ["工程机械"],
        "related_stocks": ["000425.SZ"],
    })

    hub = workspace_client.get("/api/research/hub")
    assert hub.status_code == 200
    data = hub.json()["data"]
    assert "fundamental" in data
    assert "liquidity" in data
    assert "global_tech_headlines" in data["fundamental"]
    assert "source_interfaces" in data["fundamental"]
    assert data["framework"]["stock_focus"][0]["ticker"] == "000425.SZ"

    macro = workspace_client.get("/api/database/china-macro-overview")
    assert macro.status_code == 200
    overview = macro.json()["data"]
    assert len(overview["overview_rows"]) >= 3
    assert len(overview["heatmap"]["columns"]) >= 6
    assert overview["trend"]["series"][0]["name"]


def test_stock_center_aggregation_and_provider_status(workspace_client: TestClient, monkeypatch):
    import astock

    monkeypatch.setattr(astock, "individual_info", lambda code: {"行业": "工程机械", "总股本": "80亿", "上市时间": "2011-01-28"})
    monkeypatch.setattr(astock, "announcements", lambda code: [
        {"date": "2026-07-15", "title": "关于海外订单增长的公告", "type": "公告", "url": "https://example.com/a1"},
    ])
    monkeypatch.setattr(astock, "stock_news", lambda code, limit=20: [
        {"新闻标题": "徐工机械出口订单继续增长", "发布时间": "2026-07-15 09:30", "新闻链接": "https://example.com/n1"},
    ])

    workspace_client.put("/api/watchlist", json={
        "stocks": [{"code": "000425", "market": "SZ", "name": "徐工机械", "group": "工程机械", "sort_order": 0}],
        "indicators": [],
    })
    workspace_client.post("/api/knowledge/entries", json={
        "title": "徐工机械调研纪要",
        "type": "research_note",
        "content": "出口订单、海外渠道和矿山设备是这次调研的核心。",
        "related_stocks": ["000425.SZ"],
    })
    workspace_client.post("/api/knowledge/entries", json={
        "title": "徐工机械公告点评",
        "type": "tracking_comment",
        "content": "公告验证了海外订单延续高增长。",
        "related_stocks": ["000425.SZ"],
    })
    workspace_client.post("/api/knowledge/entries", json={
        "title": "徐工机械渠道跟踪链接",
        "type": "attachment_link",
        "content": "https://example.com/report\n渠道纪要外链",
        "related_stocks": ["000425.SZ"],
    })

    center = workspace_client.get("/api/research/stock-center?ticker=000425.SZ")
    assert center.status_code == 200
    data = center.json()["data"]
    assert data["ticker"] == "000425.SZ"
    assert data["company"]["name"] == "徐工机械"
    assert data["public_info"]["行业"] == "工程机械"
    assert data["announcements"][0]["title"] == "关于海外订单增长的公告"
    assert data["news"][0]["新闻标题"] == "徐工机械出口订单继续增长"
    assert len(data["research_notes"]) == 1
    assert len(data["tracking_comments"]) == 1
    assert len(data["attachments"]) == 1

    providers = workspace_client.get("/api/database/providers")
    assert providers.status_code == 200
    provider_data = providers.json()["data"]
    assert provider_data["china_macro_overview"]["active_provider"] in {"public", "ifind"}
    assert "ifind" in provider_data["providers"]
    assert "premium_notes" in provider_data["providers"]
    assert "research_ingest" in provider_data["providers"]
    assert "industry_expert_notes" in provider_data
    assert "stock_expert_notes" in provider_data

    ingest_status = workspace_client.get("/api/research/ingest/status")
    assert ingest_status.status_code == 200
    ingest_data = ingest_status.json()["data"]
    assert "mineru" in ingest_data
    assert "pypdf" in ingest_data

    registry = workspace_client.get("/api/database/china-macro-registry")
    assert registry.status_code == 200
    registry_data = registry.json()["data"]
    assert registry_data["groups"][0]["items"][0]["ifind_code"]
    assert registry_data["groups"][0]["items"][0]["label"]


def test_premium_note_ingest_can_sink_into_industry_and_stock_centers(workspace_client: TestClient):
    industry_note = workspace_client.post("/api/research/premium-notes", json={
        "title": "工程机械渠道会纪要",
        "content": "专家反馈出口链订单和矿山设备景气度仍强。",
        "sector": "工程机械",
        "source_name": "alphaengine_placeholder",
        "source_type": "expert_call",
        "note_kind": "research_note",
    })
    assert industry_note.status_code == 200
    created = industry_note.json()["data"]
    assert created["scope"] == "industry"
    assert created["entry"]["type"] == "research_note"

    stock_note = workspace_client.post("/api/research/premium-notes", json={
        "title": "徐工机械专家会纪要",
        "content": "海外渠道拓展和矿山设备出海是本轮交流重点。",
        "ticker": "000425.SZ",
        "source_name": "alphaengine_placeholder",
        "source_type": "expert_transcript",
        "note_kind": "research_note",
    })
    assert stock_note.status_code == 200
    assert stock_note.json()["data"]["scope"] == "stock"

    sector_notes = workspace_client.get("/api/knowledge/entries?kind=research_note&sector=工程机械")
    assert sector_notes.status_code == 200
    assert sector_notes.json()["data"][0]["title"] == "工程机械渠道会纪要"

    stock_notes = workspace_client.get("/api/knowledge/entries?kind=research_note&stock=000425.SZ")
    assert stock_notes.status_code == 200
    assert stock_notes.json()["data"][0]["title"] == "徐工机械专家会纪要"


def test_market_report_ingest_dedupes_and_attaches_to_stock_center(workspace_client: TestClient, monkeypatch):
    import astock

    monkeypatch.setattr(astock, "eastmoney_reports", lambda code, max_pages=1: [
        {
            "infoCode": "AP202607150001",
            "title": "徐工机械深度报告：海外增长延续",
            "publishDate": "2026-07-15 08:00:00",
            "orgSName": "示例证券",
            "emRatingName": "买入",
            "indvInduName": "工程机械",
        },
        {
            "infoCode": "AP202607150002",
            "title": "徐工机械点评：订单兑现加速",
            "publishDate": "2026-07-14 18:00:00",
            "orgSName": "样本研究",
            "emRatingName": "增持",
            "indvInduName": "工程机械",
        },
    ])
    monkeypatch.setattr(astock, "pdf_url", lambda info_code: f"https://example.com/{info_code}.pdf")
    monkeypatch.setattr(astock, "individual_info", lambda code: {})
    monkeypatch.setattr(astock, "announcements", lambda code: [])
    monkeypatch.setattr(astock, "stock_news", lambda code, limit=20: [])

    workspace_client.put("/api/watchlist", json={
        "stocks": [{"code": "000425", "market": "SZ", "name": "徐工机械", "group": "工程机械", "sort_order": 0}],
        "indicators": [],
    })

    first = workspace_client.post("/api/research/market-reports/ingest", json={
        "tickers": ["000425.SZ"],
        "pages": 1,
        "max_reports_per_stock": 5,
    })
    assert first.status_code == 200
    first_data = first.json()["data"]
    assert first_data["created"] == 2
    assert first_data["skipped"] == 0
    assert first_data["items"][0]["status"] == "created"
    assert first_data["items"][0]["pdfUrl"].endswith(".pdf")

    second = workspace_client.post("/api/research/market-reports/ingest", json={
        "tickers": ["000425.SZ"],
        "pages": 1,
        "max_reports_per_stock": 5,
    })
    assert second.status_code == 200
    second_data = second.json()["data"]
    assert second_data["created"] == 0
    assert second_data["skipped"] == 2

    center = workspace_client.get("/api/research/stock-center?ticker=000425.SZ")
    assert center.status_code == 200
    attachments = center.json()["data"]["attachments"]
    assert len(attachments) == 2
    assert attachments[0]["type"] == "attachment_link"
    assert "市场研报" in attachments[0]["tags"]
    assert "eastmoney-report:" in attachments[0]["content_preview"]


def test_learning_pack_can_be_generated_from_existing_entry(workspace_client: TestClient):
    source = workspace_client.post("/api/knowledge/entries", json={
        "title": "工程机械行业深度研报",
        "type": "attachment_link",
        "content": "\n".join([
            "核心结论：出口链仍是工程机械最重要的景气线索。",
            "行业逻辑：海外渠道、产品结构和汇率共同影响盈利弹性。",
            "公司比较：龙头公司在矿山设备、电动化和服务网络上差异明显。",
            "财务验证：收入增速、毛利率、经营现金流需要交叉验证。",
            "风险因素：地产链需求、海外贸易政策和原材料成本波动。",
        ]),
        "tags": ["市场研报", "工程机械"],
        "related_sectors": ["工程机械"],
        "related_stocks": ["000425.SZ"],
    })
    assert source.status_code == 200
    source_id = source.json()["data"]["id"]

    generated = workspace_client.post("/api/learning/packs/generate", json={
        "source_entry_id": source_id,
        "title": "工程机械研报学习包",
    })
    assert generated.status_code == 200
    pack = generated.json()["data"]
    assert pack["type"] == "learning_pack"
    assert pack["title"] == "工程机械研报学习包"
    assert pack["related_sectors"] == ["工程机械"]
    assert pack["related_stocks"] == ["000425.SZ"]

    content = pack["content"]
    assert '"mode": "challenge"' in content
    assert "出口链仍是工程机械最重要的景气线索" in content
    assert "路演模式" in content
    assert "推演模式" in content

    packs = workspace_client.get("/api/knowledge/entries?kind=learning_pack")
    assert packs.status_code == 200
    assert packs.json()["data"][0]["id"] == pack["id"]


def test_learning_pack_interactive_html_artifact_can_be_opened(workspace_client: TestClient):
    source = workspace_client.post("/api/knowledge/entries", json={
        "title": "机器人行业资料",
        "type": "memo",
        "content": "核心结论：机器人产业链进入订单验证期。\n风险因素：价格竞争和交付节奏。",
        "tags": ["机器人"],
        "related_sectors": ["机器人"],
    }).json()["data"]
    pack = workspace_client.post("/api/learning/packs/generate", json={
        "source_entry_id": source["id"],
    }).json()["data"]

    generated = workspace_client.post(f"/api/learning/packs/{pack['id']}/interactive-html")
    assert generated.status_code == 200
    artifact = generated.json()["data"]
    assert artifact["artifact_type"] == "interactive_html"
    assert artifact["entry_id"] == pack["id"]
    assert artifact["url"].endswith(f"/api/learning/packs/{pack['id']}/interactive-html")

    page = workspace_client.get(f"/api/learning/packs/{pack['id']}/interactive-html")
    assert page.status_code == 200
    assert "text/html" in page.headers["content-type"]
    assert "机器人行业资料" in page.text
    assert "闯关模式" in page.text
    assert "路演模式" in page.text
    assert "推演模式" in page.text


def test_macro_registry_can_be_saved_locally(workspace_client: TestClient):
    registry = workspace_client.get("/api/database/china-macro-registry").json()["data"]
    registry["groups"][0]["items"].append({
        "key": "ppi_yoy",
        "label": "PPI同比",
        "freq": "月度",
        "public_key": "ppi_yoy",
        "ifind_code": "M0001227",
    })

    saved = workspace_client.put("/api/database/china-macro-registry", json=registry)
    assert saved.status_code == 200
    assert saved.json()["data"]["groups"][0]["items"][-1]["label"] == "PPI同比"

    reread = workspace_client.get("/api/database/china-macro-registry")
    assert reread.status_code == 200
    assert reread.json()["data"]["groups"][0]["items"][-1]["ifind_code"] == "M0001227"


def test_database_module_registry_exposes_phase_one_skeleton(workspace_client: TestClient):
    resp = workspace_client.get("/api/database/modules")
    assert resp.status_code == 200
    data = resp.json()["data"]
    keys = [item["key"] for item in data["modules"]]
    assert keys == [
        "industry-map",
        "earnings-tracker",
        "china-macro",
        "china-midstream",
        "us-macro",
        "china-index-review",
        "us-index-review",
    ]
    china_macro = next(item for item in data["modules"] if item["key"] == "china-macro")
    assert china_macro["status"] == "sample_ready"
    assert china_macro["filters"][0]["key"] == "indicator_group"
    assert china_macro["containers"][0]["kind"] == "table"
    assert data["container_contract"]["chart"]["empty_state"]


def test_custom_database_module_can_be_added_locally(workspace_client: TestClient):
    created = workspace_client.post("/api/database/modules/custom", json={
        "key": "global-liquidity",
        "label": "海外流动性数据库",
        "description": "跟踪美元流动性、海外利率和主要央行资产负债表。",
    })
    assert created.status_code == 200
    module = created.json()["data"]
    assert module["key"] == "global-liquidity"
    assert module["status"] == "skeleton"
    assert module["custom"] is True
    assert module["filters"][0]["label"] == "自定义筛选"
    assert {item["kind"] for item in module["containers"]} == {"chart", "table"}

    listing = workspace_client.get("/api/database/modules")
    assert listing.status_code == 200
    modules = listing.json()["data"]["modules"]
    assert modules[-1]["key"] == "global-liquidity"
    assert modules[-1]["label"] == "海外流动性数据库"


def test_sector_tree_can_add_nested_industry_nodes(workspace_client: TestClient):
    root = workspace_client.post("/api/framework/sector-tree/nodes", json={
        "name": "工程机械",
        "description": "跟踪挖机、装载机、开工小时数等指标。",
    })
    assert root.status_code == 200
    root_node = root.json()["data"]
    assert root_node["id"] == "工程机械"
    assert root_node["level"] == 0

    child = workspace_client.post("/api/framework/sector-tree/nodes", json={
        "name": "挖掘机",
        "parent_id": root_node["id"],
        "description": "月度销量、出口、开工小时数。",
    })
    assert child.status_code == 200
    child_node = child.json()["data"]
    assert child_node["parent_id"] == "工程机械"
    assert child_node["level"] == 1

    listing = workspace_client.get("/api/framework/sector-tree")
    assert listing.status_code == 200
    nodes = listing.json()["data"]["nodes"]
    assert [node["name"] for node in nodes] == ["工程机械", "挖掘机"]
    assert nodes[1]["description"] == "月度销量、出口、开工小时数。"


def test_sector_tree_left_nav_order_can_be_saved(workspace_client: TestClient):
    workspace_client.post("/api/framework/sector-tree/nodes", json={
        "name": "工程机械",
        "description": "跟踪挖机、装载机、开工小时数等指标。",
    })
    workspace_client.post("/api/framework/sector-tree/nodes", json={
        "name": "电网设备",
        "description": "跟踪电网投资、变压器、出海节奏。",
    })

    saved = workspace_client.put("/api/framework/sector-tree/order", json={
        "ids": ["电网设备", "工程机械"],
    })
    assert saved.status_code == 200
    assert [item["name"] for item in saved.json()["data"]["nodes"]] == ["电网设备", "工程机械"]

    listing = workspace_client.get("/api/framework/sector-tree")
    assert listing.status_code == 200
    assert [item["name"] for item in listing.json()["data"]["nodes"]] == ["电网设备", "工程机械"]


def test_weekly_review_order_can_be_saved(workspace_client: TestClient):
    first = workspace_client.post("/api/knowledge/entries", json={
        "title": "2026W29 周度复盘",
        "type": "weekly_review",
        "content": "第一篇周复盘。",
        "date": "2026-07-15",
    }).json()["data"]
    second = workspace_client.post("/api/knowledge/entries", json={
        "title": "2026W30 周度复盘",
        "type": "weekly_review",
        "content": "第二篇周复盘。",
        "date": "2026-07-16",
    }).json()["data"]

    saved = workspace_client.put("/api/knowledge/entries/order", json={
        "kind": "weekly_review",
        "ids": [first["id"], second["id"]],
    })
    assert saved.status_code == 200
    assert [item["id"] for item in saved.json()["data"]] == [first["id"], second["id"]]

    listing = workspace_client.get("/api/knowledge/entries?kind=weekly_review")
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["data"]] == [first["id"], second["id"]]


def test_learning_pack_order_can_be_saved(workspace_client: TestClient):
    first_source = workspace_client.post("/api/knowledge/entries", json={
        "title": "工程机械学习资料 A",
        "type": "memo",
        "content": "第一份学习资料。",
    }).json()["data"]
    second_source = workspace_client.post("/api/knowledge/entries", json={
        "title": "工程机械学习资料 B",
        "type": "memo",
        "content": "第二份学习资料。",
    }).json()["data"]

    first = workspace_client.post("/api/learning/packs/generate", json={
        "source_entry_id": first_source["id"],
        "title": "学习包 A",
    }).json()["data"]
    second = workspace_client.post("/api/learning/packs/generate", json={
        "source_entry_id": second_source["id"],
        "title": "学习包 B",
    }).json()["data"]

    saved = workspace_client.put("/api/knowledge/entries/order", json={
        "kind": "learning_pack",
        "ids": [first["id"], second["id"]],
    })
    assert saved.status_code == 200
    assert [item["id"] for item in saved.json()["data"]] == [first["id"], second["id"]]

    listing = workspace_client.get("/api/knowledge/entries?kind=learning_pack")
    assert listing.status_code == 200
    assert [item["id"] for item in listing.json()["data"]] == [first["id"], second["id"]]


def test_intel_dynamics_digest_and_image_artifact_can_be_prepared(workspace_client: TestClient):
    workspace_client.put("/api/watchlist", json={
        "stocks": [{"code": "000425", "market": "SZ", "name": "徐工机械", "group": "工程机械", "sort_order": 0}],
        "indicators": [],
    })

    industry_digest = workspace_client.post("/api/research/intel-digest", json={"kind": "industry"})
    assert industry_digest.status_code == 200
    industry_data = industry_digest.json()["data"]
    assert industry_data["kind"] == "industry"
    assert industry_data["title"] == "行业动态摘要"
    assert industry_data["summary_text"]

    stock_digest = workspace_client.post("/api/research/intel-digest", json={"kind": "stock"})
    assert stock_digest.status_code == 200
    stock_data = stock_digest.json()["data"]
    assert stock_data["kind"] == "stock"
    assert "徐工机械" in stock_data["summary_text"]

    artifact = workspace_client.post("/api/research/intel-image-artifact", json={"kind": "stock"})
    assert artifact.status_code == 200
    request = artifact.json()["data"]
    assert request["status"] == "prepared"
    assert request["kind"] == "stock"
    assert request["artifact_type"] == "intel_dynamic_card"
    assert request["skill_interface"] == "replaceable_local_skill"


def test_sector_tracking_indicator_can_be_added_and_listed(workspace_client: TestClient):
    created = workspace_client.post("/api/framework/sector-indicators", json={
        "sector": "工程机械",
        "name": "挖掘机月度销量",
        "freq": "月度",
        "chart_kind": "bar",
        "viewpoint": "销量同比和出口占比是判断工程机械景气的核心指标。",
    })
    assert created.status_code == 200
    indicator = created.json()["data"]
    assert indicator["sector"] == "工程机械"
    assert indicator["name"] == "挖掘机月度销量"
    assert indicator["chart_kind"] == "bar"
    assert indicator["viewpoint"].startswith("销量同比")

    listing = workspace_client.get("/api/framework/sector-indicators?sector=工程机械")
    assert listing.status_code == 200
    rows = listing.json()["data"]["items"]
    assert len(rows) == 1
    assert rows[0]["freq"] == "月度"


def test_sector_tracking_indicators_can_be_reordered(workspace_client: TestClient):
    workspace_client.post("/api/framework/sector-indicators", json={
        "sector": "工程机械",
        "name": "挖掘机月度销量",
        "freq": "月度",
        "chart_kind": "bar",
        "viewpoint": "跟踪销量同比。",
    })
    workspace_client.post("/api/framework/sector-indicators", json={
        "sector": "工程机械",
        "name": "开工小时数",
        "freq": "月度",
        "chart_kind": "line",
        "viewpoint": "跟踪开工景气。",
    })

    reordered = workspace_client.put("/api/framework/sector-indicators/order", json={
        "sector": "工程机械",
        "ids": ["工程机械-开工小时数", "工程机械-挖掘机月度销量"],
    })
    assert reordered.status_code == 200
    rows = reordered.json()["data"]["items"]
    assert [item["name"] for item in rows] == ["开工小时数", "挖掘机月度销量"]
    assert [item["sort_order"] for item in rows] == [0, 1]

    listing = workspace_client.get("/api/framework/sector-indicators?sector=工程机械")
    assert listing.status_code == 200
    assert [item["name"] for item in listing.json()["data"]["items"]] == ["开工小时数", "挖掘机月度销量"]


def test_sector_center_custom_module_can_be_added_and_listed(workspace_client: TestClient):
    created = workspace_client.post("/api/framework/sector-modules", json={
        "sector": "工程机械",
        "title": "竞争格局",
        "category": "行业框架",
        "content": "龙头集中度、CR3 变化、出海份额和价格带分化是核心观察点。",
        "data_source": "manual_placeholder",
    })
    assert created.status_code == 200
    module = created.json()["data"]
    assert module["sector"] == "工程机械"
    assert module["title"] == "竞争格局"
    assert module["category"] == "行业框架"

    listing = workspace_client.get("/api/framework/sector-modules?sector=工程机械")
    assert listing.status_code == 200
    rows = listing.json()["data"]["items"]
    assert len(rows) == 1
    assert rows[0]["content"].startswith("龙头集中度")


def test_stock_center_custom_module_can_be_added_and_listed(workspace_client: TestClient):
    created = workspace_client.post("/api/framework/stock-modules", json={
        "ticker": "000425.SZ",
        "title": "股权结构",
        "category": "公开信息",
        "content": "控股股东、实际控制人和核心持股平台后续自动抽取。",
        "data_source": "public_info_placeholder",
    })
    assert created.status_code == 200
    module = created.json()["data"]
    assert module["ticker"] == "000425.SZ"
    assert module["title"] == "股权结构"
    assert module["category"] == "公开信息"

    listing = workspace_client.get("/api/framework/stock-modules?ticker=000425.SZ")
    assert listing.status_code == 200
    rows = listing.json()["data"]["items"]
    assert len(rows) == 1
    assert rows[0]["content"].startswith("控股股东")


def test_sector_modules_can_be_reordered(workspace_client: TestClient):
    workspace_client.post("/api/framework/sector-modules", json={
        "sector": "工程机械",
        "title": "竞争格局",
        "category": "行业框架",
        "content": "先记录竞争格局。",
    })
    workspace_client.post("/api/framework/sector-modules", json={
        "sector": "工程机械",
        "title": "政策框架",
        "category": "政策",
        "content": "再记录政策框架。",
    })

    reordered = workspace_client.put("/api/framework/sector-modules/order", json={
        "sector": "工程机械",
        "ids": ["工程机械-政策框架", "工程机械-竞争格局"],
    })
    assert reordered.status_code == 200
    rows = reordered.json()["data"]["items"]
    assert [item["title"] for item in rows] == ["政策框架", "竞争格局"]
    assert [item["sort_order"] for item in rows] == [0, 1]

    listing = workspace_client.get("/api/framework/sector-modules?sector=工程机械")
    assert listing.status_code == 200
    assert [item["title"] for item in listing.json()["data"]["items"]] == ["政策框架", "竞争格局"]


def test_stock_modules_can_be_reordered(workspace_client: TestClient):
    workspace_client.post("/api/framework/stock-modules", json={
        "ticker": "000425.SZ",
        "title": "股权结构",
        "category": "公开信息",
        "content": "先记录股权结构。",
    })
    workspace_client.post("/api/framework/stock-modules", json={
        "ticker": "000425.SZ",
        "title": "管理层",
        "category": "公开信息",
        "content": "再记录管理层。",
    })

    reordered = workspace_client.put("/api/framework/stock-modules/order", json={
        "ticker": "000425.SZ",
        "ids": ["000425.SZ-管理层", "000425.SZ-股权结构"],
    })
    assert reordered.status_code == 200
    rows = reordered.json()["data"]["items"]
    assert [item["title"] for item in rows] == ["管理层", "股权结构"]
    assert [item["sort_order"] for item in rows] == [0, 1]

    listing = workspace_client.get("/api/framework/stock-modules?ticker=000425.SZ")
    assert listing.status_code == 200
    assert [item["title"] for item in listing.json()["data"]["items"]] == ["管理层", "股权结构"]
