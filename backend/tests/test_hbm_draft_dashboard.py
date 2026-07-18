import knowledge
from research_hub import build_hbm_draft_dashboard, build_sector_overview_modules, is_hbm_sector


def test_is_hbm_sector_matches_hbm_only():
    assert is_hbm_sector("HBM") is True
    assert is_hbm_sector("hbm") is True
    assert is_hbm_sector("HBM存储") is True
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


def test_build_sector_overview_modules_includes_hbm_dashboard_only_for_hbm(monkeypatch):
    monkeypatch.setattr("research_hub.ingest_sector_reports", lambda sector, **kwargs: {"ingested": 0})
    monkeypatch.setattr(
        "research_hub._sector_sources",
        lambda sector: [{"label": "研报/1", "text": "HBM3E、堆叠层数、扩产、龙头与景气信号。"}],
    )

    hbm = build_sector_overview_modules("HBM")
    cpo = build_sector_overview_modules("光互联")

    assert hbm.get("draft_theme_schema", {}).get("kind") == "hbm_draft_dashboard"
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
