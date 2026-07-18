import app as app_module
import knowledge
from research_hub import (
    build_hbm_draft_canvas,
    build_hbm_draft_dashboard,
    build_hbm_infographic_tabs,
    build_sector_overview_modules,
    extract_hbm_expression_units,
    is_hbm_sector,
)


def test_is_hbm_sector_matches_hbm_only():
    assert is_hbm_sector("HBM") is True
    assert is_hbm_sector("hbm") is True
    assert is_hbm_sector("HBM存储") is False
    assert is_hbm_sector("光互联") is False


def test_build_hbm_draft_dashboard_returns_five_fixed_tabs():
    sources = [
        {"label": "研报/1", "text": "HBM3E 带宽提升，12hi/16hi 堆叠继续演进。"},
        {"label": "研报/2", "text": "良率、先进封装、扩产节奏仍是核心卡口。"},
        {"label": "研报/3", "text": "海力士、三星、美光主导，A股映射关注设备材料封测。"},
        {"label": "研报/4", "text": "价格、库存、扩产与验证节点共同决定景气温度。"},
    ]

    result = build_hbm_draft_dashboard("HBM", sources)

    assert result["kind"] == "hbm_draft_dashboard"
    assert [tab["key"] for tab in result["tabs"]] == [
        "overview",
        "generation",
        "cost_bottleneck",
        "leaders",
        "cycle_meter",
    ]
    assert [tab["title"] for tab in result["tabs"]] == [
        "总览",
        "技术代际",
        "成本与卡口",
        "产业龙头",
        "周期温度计",
    ]


def test_build_hbm_draft_dashboard_returns_safe_placeholders_when_sources_are_sparse():
    result = build_hbm_draft_dashboard("HBM", [])
    assert result["kind"] == "hbm_draft_dashboard"
    assert len(result["tabs"]) == 5
    assert all("empty_state" in tab for tab in result["tabs"])


def test_build_hbm_draft_canvas_returns_editable_tabs_and_cards():
    schema = build_hbm_draft_canvas(
        "HBM",
        [{"label": "研报/1", "text": "HBM3E 放量、先进封装、海力士、库存周期。"}],
    )

    assert schema["kind"] == "industry_draft_canvas"
    assert schema["tabs"][0]["title"] == "总览"
    assert schema["tabs"][0]["blocks"][0]["type"] == "summary_hero"


def test_extract_hbm_expression_units_collects_steps_nodes_metrics_and_series():
    extracted = extract_hbm_expression_units(
        [
            {
                "label": "HBM 行业概览.md",
                "text": (
                    "工艺流程：Base Die -> TSV -> Hybrid Bonding -> 堆叠封装。"
                    "产业链：上游材料、GPU、封测、HBM 原厂、服务器。"
                    "关键指标：单颗容量 24GB，层数 12/16/24Hi，ASP 持续上行。"
                ),
            }
        ]
    )

    assert extracted["steps"][0]["label"] == "Base Die"
    assert extracted["nodes"][0]["label"] == "上游材料"
    assert extracted["metrics"][0]["label"] == "单颗容量"


def test_extract_hbm_expression_units_filters_market_noise_and_infers_visual_defaults():
    extracted = extract_hbm_expression_units(
        [
            {
                "label": "研报/HBM",
                "text": (
                    "2026 年电子指数下跌 1.66%，跑输沪深 300 指数。"
                    "AI 旺盛需求下，三星、SK 海力士积极扩产 HBM，先进封装、TSV、DRAM 原厂和服务器链路景气度较高。"
                    "HBM3E 层数 12Hi，单颗容量 24GB，带宽 819GB/s，良率爬坡仍是卡口。"
                ),
            }
        ]
    )

    metric_labels = {item["label"] for item in extracted["metrics"]}
    assert {"层数", "单颗容量", "带宽"}.issubset(metric_labels)
    assert "电子指数下跌" not in metric_labels
    assert extracted["steps"][0]["label"] == "DRAM Die"
    assert extracted["nodes"][0]["label"] == "AI 加速器 / GPU"
    assert extracted["series"]


def test_build_hbm_infographic_tabs_outputs_flow_chain_range_and_chart_blocks():
    tabs = build_hbm_infographic_tabs(
        "HBM",
        {
            "claims": [{"text": "HBM 供需维持紧平衡"}],
            "metrics": [{"label": "层数", "value": "12-24Hi"}],
            "comparisons": [{"name": "HBM2E", "value": "上一代"}, {"name": "HBM3E", "value": "当前主流"}],
            "steps": [{"label": "TSV"}, {"label": "Hybrid Bonding"}],
            "nodes": [{"label": "GPU"}, {"label": "HBM 原厂"}, {"label": "服务器"}],
            "series": [{"name": "位宽", "points": [{"label": "HBM2E", "value": 1}, {"label": "HBM3E", "value": 2}]}],
            "rows": [{"cells": ["环节", "代表"], "kind": "header"}, {"cells": ["封测", "日月光"]}],
            "drivers": [],
            "risks": [],
            "milestones": [],
        },
    )

    overview = tabs[0]["blocks"]
    assert any(block["type"] == "flow_map" for block in overview)
    assert any(block["type"] == "industry_chain" for block in overview)
    assert any(block["type"] == "chart_spec" for block in overview)


def test_build_hbm_draft_canvas_supplies_visual_defaults_for_report_style_sources():
    schema = build_hbm_draft_canvas(
        "HBM",
        [
            {
                "label": "研报/HBM",
                "text": "AI 服务器需求拉动 HBM 放量，SK 海力士、三星、美光扩产，先进封装、TSV、良率和库存周期是核心变量。",
            }
        ],
    )
    blocks = {block["id"]: block for tab in schema["tabs"] for block in tab["blocks"]}

    assert blocks["overview-flow"]["spec"]["steps"]
    assert blocks["overview-chain"]["spec"]["nodes"]
    assert blocks["overview-chart"]["spec"]["series"]
    assert blocks["generation-table"]["spec"]["rows"][0]["kind"] == "header"


def test_build_hbm_draft_dashboard_populates_tab_specific_content():
    result = build_hbm_draft_dashboard(
        "HBM",
        [
            {"label": "研报/1", "text": "HBM3E 带宽提升，12hi 堆叠继续演进，先进封装重要性上升。"},
            {"label": "研报/2", "text": "良率、产能、设备与封装仍是核心卡口，价格和库存决定周期温度。"},
            {"label": "研报/3", "text": "海力士、三星、美光维持龙头格局，A股映射聚焦设备、材料与封测。"},
        ],
    )
    tabs = {tab["key"]: tab for tab in result["tabs"]}
    assert tabs["overview"]["summary"]
    assert tabs["generation"]["panels"]
    assert tabs["cost_bottleneck"]["panels"]
    assert tabs["leaders"]["panels"]
    assert tabs["cycle_meter"]["metrics"]


def test_build_hbm_draft_dashboard_adds_structured_generation_and_bottleneck_fields():
    result = build_hbm_draft_dashboard(
        "HBM",
        [
            {"label": "研报/1", "text": "HBM2E 向 HBM3 过渡，HBM3E 加速放量，12hi/16hi 堆叠升级。"},
            {"label": "研报/2", "text": "良率、设备、先进封装与材料成本仍是主要卡口。"},
        ],
    )
    tabs = {tab["key"]: tab for tab in result["tabs"]}
    generation = tabs["generation"]
    bottleneck = tabs["cost_bottleneck"]

    assert generation["generation_steps"]
    assert generation["generation_steps"][0]["label"] == "HBM2E"
    assert generation["generation_steps"][2]["label"] == "HBM3E"
    assert bottleneck["cost_stack"]
    assert bottleneck["cost_stack"][0]["label"]
    assert bottleneck["cost_stack"][0]["weight"] > 0


def test_build_hbm_draft_dashboard_adds_structured_overview_and_leader_fields():
    result = build_hbm_draft_dashboard(
        "HBM",
        [
            {"label": "研报/1", "text": "AI GPU、先进封装、HBM 与服务器是当前主链路。"},
            {"label": "研报/2", "text": "海力士、三星、美光维持龙头格局，A股映射集中在设备材料封测。"},
        ],
    )
    tabs = {tab["key"]: tab for tab in result["tabs"]}
    overview = tabs["overview"]
    leaders = tabs["leaders"]

    assert overview["chain_nodes"]
    assert overview["chain_nodes"][0]["label"] == "AI GPU"
    assert overview["chain_nodes"][0]["tag"]
    assert leaders["leader_cards"]
    assert leaders["leader_cards"][0]["name"] == "海力士"
    assert leaders["leader_cards"][0]["segment"]
    assert leaders["leader_cards"][0]["mapping"]


def test_build_sector_overview_modules_includes_hbm_dashboard_only_for_hbm(monkeypatch):
    monkeypatch.setattr("research_hub.ingest_sector_reports", lambda sector, **kwargs: {"ingested": 0})
    monkeypatch.setattr(
        "research_hub._sector_sources",
        lambda sector: [{"label": "研报/1", "text": "HBM3E、堆叠层数、扩产、龙头与景气信号。"}],
    )

    hbm = build_sector_overview_modules("HBM")
    cpo = build_sector_overview_modules("光互联")

    assert hbm.get("draft_theme_schema", {}).get("kind") == "industry_draft_canvas"
    assert cpo.get("draft_theme_schema") in (None, {})


def test_save_overview_draft_theme_schema_round_trips():
    scope_id = "HBM-test-draft-theme"
    saved = knowledge.save_overview_draft_theme_schema(
        "sector",
        scope_id,
        {"kind": "hbm_draft_dashboard", "tabs": [{"key": "overview", "title": "总览"}]},
    )

    assert saved["draft_theme_schema"]["kind"] == "hbm_draft_dashboard"
    reloaded = knowledge.get_overview_workbench("sector", scope_id)
    assert reloaded["draft_theme_schema"]["tabs"][0]["key"] == "overview"


def test_validated_overview_workbench_backfills_hbm_dashboard_schema(monkeypatch):
    scope_id = "HBM-test-backfill-theme"
    knowledge.save_overview_draft(
        "sector",
        scope_id,
        {
            "summary": "HBM 初稿原文",
            "sources": [{"label": "研报/1", "text": "HBM3E、先进封装、海力士、库存周期。"}],
            "modules": [],
            "keywords": [],
        },
    )
    knowledge.save_overview_draft_theme_schema("sector", scope_id, {})
    monkeypatch.setattr(
        "research_hub._sector_sources",
        lambda sector: [{"label": "研报/1", "text": "HBM3E、先进封装、海力士、库存周期。"}],
    )
    monkeypatch.setattr("research_hub.is_hbm_sector", lambda sector: sector == scope_id)

    result = app_module._validated_overview_workbench("sector", scope_id)

    assert result["draft_theme_schema"]["kind"] == "industry_draft_canvas"
    reloaded = knowledge.get_overview_workbench("sector", scope_id)
    assert reloaded["draft_theme_schema"]["tabs"][0]["id"] == "tab-overview"


def test_validated_overview_workbench_rebuilds_legacy_hbm_canvas_with_real_sources(monkeypatch):
    scope_id = "HBM-test-rebuild-legacy-canvas"
    knowledge.save_overview_draft(
        "sector",
        scope_id,
        {
            "summary": "",
            "sources": [
                {"label": "东财公开行业研报接口", "text": ""},
                {"label": "AlphaEngine 行业专家纪要接口", "text": ""},
            ],
            "modules": [],
            "keywords": [],
        },
    )
    knowledge.save_overview_draft_theme_schema(
        "sector",
        scope_id,
        {
            "kind": "industry_draft_canvas",
            "version": "v1",
            "scope": "HBM",
            "tabs": [
                {
                    "id": "tab-generation",
                    "title": "技术代际",
                    "cards": [
                        {
                            "id": "generation-hero",
                            "type": "summary_hero",
                            "content": {"headline": "旧文字卡"},
                        }
                    ],
                }
            ],
        },
    )
    monkeypatch.setattr(
        "research_hub._sector_sources",
        lambda sector: [
            {
                "label": "研报/HBM",
                "text": (
                    "工艺流程：Base Die -> TSV -> Hybrid Bonding -> 堆叠封装。\n"
                    "产业链：GPU、DRAM 原厂、先进封装、服务器。\n"
                    "关键指标：单颗容量 24GB，层数 12Hi，带宽 819GB/s。\n"
                    "| 代际 | 层数 |\n| HBM3E | 12Hi |\n"
                    "HBM2E 向 HBM3E 过渡，AI 需求、扩产、良率和库存决定周期温度。"
                ),
            }
        ],
    )
    monkeypatch.setattr("research_hub.is_hbm_sector", lambda sector: sector == scope_id)

    result = app_module._validated_overview_workbench("sector", scope_id)
    tabs = result["draft_theme_schema"]["tabs"]
    block_types = {block["type"] for tab in tabs for block in tab.get("blocks", [])}

    assert result["draft_theme_schema"]["version"] == "v2"
    assert {"flow_map", "industry_chain", "chart_spec", "comparison_table"}.issubset(block_types)
    assert tabs[0]["blocks"][2]["spec"]["steps"][0]["label"] == "Base Die"


def test_validated_overview_workbench_uses_youdao_note_content_when_sources_missing(monkeypatch):
    scope_id = "HBM-test-youdao-theme"
    knowledge.save_overview_draft("sector", scope_id, {"summary": "", "sources": [], "modules": [], "keywords": []})
    knowledge.save_overview_draft_theme_schema("sector", scope_id, {})
    knowledge.save_overview_editor_binding(
        "sector",
        scope_id,
        {
            "provider": "youdao",
            "file_id": "fake-note-id",
            "title": "HBM 行业概览.md",
            "parent_id": "",
            "content": "",
            "preview": "",
            "updated_at": "",
            "last_synced_at": "",
            "structured_parser_version": "",
        },
    )
    monkeypatch.setattr("research_hub.is_hbm_sector", lambda sector: sector == scope_id)
    monkeypatch.setattr("research_hub._sector_report_keywords", lambda sector: ["HBM", "HBM3E", "海力士", "封装", "库存", "服务器"])
    monkeypatch.setattr("research_hub._sector_sources", lambda sector: [])
    monkeypatch.setattr(
        "youdao_sync.read_note",
        lambda file_id: {"content": "HBM3E 正在加速放量，先进封装与海力士扩产节奏、库存周期和服务器需求共同决定景气位置。"},
    )
    monkeypatch.setattr(
        "research_ingest.extract_youdao_note_to_blocks",
        lambda file_id, title: ([], []),
    )

    result = app_module._validated_overview_workbench("sector", scope_id)

    assert result["draft_theme_schema"]["kind"] == "industry_draft_canvas"
    assert result["draft_theme_schema"]["tabs"][0]["blocks"][0]["sources"][0] == "HBM 行业概览.md"


def test_validated_overview_workbench_still_backfills_hbm_schema_when_youdao_binding_is_invalid(monkeypatch):
    scope_id = "HBM-test-invalid-binding-theme"
    knowledge.save_overview_draft("sector", scope_id, {"summary": "", "sources": [], "modules": [], "keywords": []})
    knowledge.save_overview_draft_theme_schema("sector", scope_id, {})
    knowledge.save_overview_editor_binding(
        "sector",
        scope_id,
        {
            "provider": "youdao",
            "file_id": "missing-note-id",
            "title": "HBM 行业概览.md",
            "parent_id": "",
            "content": "",
            "preview": "",
            "updated_at": "",
            "last_synced_at": "",
            "structured_parser_version": "",
        },
    )
    monkeypatch.setattr("research_hub.is_hbm_sector", lambda sector: sector == scope_id)
    monkeypatch.setattr("research_hub._sector_sources", lambda sector: [])

    def _raise_missing(_file_id):
        raise app_module.youdao_sync.YoudaoSyncError("获取笔记内容失败：not found")

    monkeypatch.setattr("youdao_sync.read_note", _raise_missing)

    result = app_module._validated_overview_workbench("sector", scope_id)

    assert result["draft_theme_schema"]["kind"] == "industry_draft_canvas"
    assert result["editor_binding"]["file_id"] == ""
