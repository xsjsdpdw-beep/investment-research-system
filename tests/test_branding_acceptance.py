from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_frontend_runtime_branding_uses_local_product_name():
    html = read("frontend/index.html")
    layout = read("frontend/src/components/layout/Layout.tsx")
    disclaimer = read("frontend/src/components/ui/Disclaimer.tsx")
    settings = read("frontend/src/pages/Settings.tsx")
    stock_data = read("frontend/src/pages/StockData.tsx")

    assert "<title>投研体系 · 个人 AI 投研系统（A股/美股/港股）</title>" in html
    assert "投研体系: Your Personal Trading Research Agent" in html
    assert "Vibe-<span" not in layout
    assert "投研体系" in layout
    assert "APP_CONFIG.upstreamLabel" in layout
    assert "投研体系 只客观呈现公开数据与榜单" in disclaimer
    assert "投研体系 是一个中立的信息整理与 AI 接入工具" in disclaimer
    assert "投研体系 后端会用它以你的订阅额度作答" in settings
    assert "投研体系 不预置任何标的、不做推荐" in stock_data


def test_backend_runtime_identity_uses_local_product_name():
    app_py = read("backend/app.py")
    chat_py = read("backend/chat.py")

    assert 'FastAPI(title="投研体系 API", version="0.1.3")' in app_py
    assert '"service": "investment-research-api"' in app_py
    assert "你是 投研体系 里的投研助理" in chat_py


def test_frontend_config_constants_are_centralized():
    config = read("frontend/src/lib/app-config.ts")
    layout = read("frontend/src/components/layout/Layout.tsx")
    dark_mode = read("frontend/src/hooks/useDarkMode.ts")
    api = read("frontend/src/lib/api.ts")
    llm = read("frontend/src/lib/llm.ts")

    assert 'productName: "投研体系"' in config
    assert 'productTitle: "投研体系 · 个人 AI 投研系统（A股/美股/港股）"' in config
    assert 'productSubtitle: "个人 AI 投研系统 · A股/美股/港股"' in config
    assert 'upstreamRepoUrl: "https://github.com/simonlin1212/Vibe-Research"' in config
    assert 'upstreamLabel: "上游项目 · Vibe-Research"' in config
    assert "backendPort: 8900" in config
    assert 'sidebar: "vr-sidebar"' in config
    assert 'theme: "vr-theme"' in config

    assert "APP_CONFIG" in layout
    assert "APP_STORAGE_KEYS.sidebar" in layout
    assert "APP_STORAGE_KEYS.theme" in dark_mode
    assert "APP_CONFIG.backendPort" in api
    assert "APP_CONFIG.backendPort" in llm


def test_data_storage_map_documents_current_storage_layout():
    storage_map = read("docs/data-storage-map.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "# Data Storage Map" in storage_map
    assert "~/.vibe-research/portfolio.json" in storage_map
    assert "~/.vibe-research/myreports/" in storage_map
    assert "VR_DATA_DIR" in storage_map
    assert "VR_REPORTS_DIR" in storage_map
    assert "vr-watchlist" in storage_map
    assert "vr-notes" in storage_map
    assert "vr-llm" in storage_map
    assert "vr-access-key" in storage_map
    assert "vr-theme" in storage_map
    assert "vr-sidebar" in storage_map
    assert "backend-managed files" in storage_map
    assert "browser-managed local data" in storage_map
    assert "A data storage map is now documented" in local_notes


def test_ai_settings_logic_is_centralized():
    helper = read("frontend/src/lib/ai-config.ts")
    settings = read("frontend/src/pages/Settings.tsx")
    llm = read("frontend/src/lib/llm.ts")

    assert "getDefaultApiModel" in helper
    assert "getProviderByModelId" in helper
    assert "getInitialAiSettings" in helper
    assert "firstApi =" not in settings
    assert "const providerOf" not in settings
    assert "getInitialAiSettings" in settings
    assert "getProviderByModelId" in settings
    assert "LlmConfig" in llm
    assert "provider:" in llm
    assert "baseURL:" in llm
    assert "apiKey:" in llm
    assert "model:" in llm


def test_sidebar_prioritizes_high_frequency_pages():
    layout = read("frontend/src/components/layout/Layout.tsx")

    daily = layout.index('label: "每日复盘"')
    watchlist = layout.index('label: "自选股"')
    portfolio = layout.index('label: "我的持仓"')
    stock_data = layout.index('label: "个股数据"')
    notes = layout.index('label: "研究记录"')
    intel = layout.index('label: "资讯雷达"')
    sectors = layout.index('label: "板块中心"')
    reports = layout.index('label: "我的研报"')
    settings = layout.index('label: "接入 AI"')

    assert daily < watchlist < portfolio < stock_data < notes < intel < sectors < reports < settings


def test_daily_review_exposes_quick_links_to_core_workflows():
    daily_review = read("frontend/src/pages/DailyReview.tsx")
    router = read("frontend/src/router.tsx")

    assert 'path: "/", element: <Navigate to="/daily-review" replace />' in router
    assert "const QUICK_LINKS = [" in daily_review
    assert "快捷入口" in daily_review
    assert 'to: "/watchlist"' in daily_review
    assert 'to: "/portfolio"' in daily_review
    assert 'to: "/stock-data"' in daily_review
    assert 'to: "/notes"' in daily_review
    assert "自选股" in daily_review
    assert "我的持仓" in daily_review
    assert "个股数据" in daily_review
    assert "研究记录" in daily_review
