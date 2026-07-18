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


def test_overview_youdao_binding_auto_resets_when_note_is_missing():
    app_py = read("backend/app.py")
    knowledge_py = read("backend/knowledge.py")
    framework = read("frontend/src/pages/Framework.tsx")

    assert "def _should_invalidate_youdao_binding" in app_py
    assert "获取笔记内容失败" in app_py
    assert "knowledge.clear_overview_editor_binding" in app_py
    assert '已检测到有道主笔记失效，当前已回到未绑定状态。' in app_py
    assert "def clear_overview_editor_binding" in knowledge_py
    assert "if (!synced.file_id) toast.error(synced.message" in framework


def test_framework_workspace_uses_framework_wording_instead_of_main_note():
    framework = read("frontend/src/pages/Framework.tsx")

    assert "概览主笔记" not in framework
    assert "主笔记还没有结构化内容" not in framework
    assert "主笔记还没有内容" not in framework
    assert "概览框架" in framework
    assert "这篇框架还没有结构化内容" in framework
    assert "这篇框架还没有内容" in framework


def test_structured_framework_preview_supports_image_zoom_and_inline_editing():
    framework = read("frontend/src/pages/Framework.tsx")
    renderer = read("frontend/src/components/research/StructuredOverviewRenderer.tsx")

    assert "编辑正文" in framework
    assert "保存正文" in framework
    assert "取消编辑" in framework
    assert "setStructuredEditorDrafts" in framework
    assert "saveOverviewStructuredPreview" in framework

    assert "const hideAutoImageTitle" in renderer
    assert 'aria-label="放大查看图片"' in renderer
    assert "setZoomedImage" in renderer
    assert "textarea" in renderer


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


def test_tradingagents_deep_analysis_is_wired_through_settings_stock_page_and_runtime():
    settings = read("frontend/src/pages/Settings.tsx")
    stock_data = read("frontend/src/pages/StockData.tsx")
    ask_ai = read("frontend/src/components/ui/AskAiButton.tsx")
    tradingagents = read("frontend/src/lib/tradingagents.ts")
    app_py = read("backend/app.py")
    runtime = read("backend/tradingagents_runtime.py")
    runtime_tests = read("backend/tests/test_tradingagents_runtime.py")

    assert "TradingAgents 深度分析" in settings
    assert "loadTradingAgentsConfig" in settings
    assert "saveTradingAgentsConfig" in settings
    assert "clearTradingAgentsConfig" in settings
    assert "只能走 API 模式" in settings

    assert 'mode="tradingagents"' in stock_data
    assert 'label="TradingAgents 深度分析"' in stock_data

    assert 'mode?: "chat" | "tradingagents"' in ask_ai
    assert "hasTradingAgentsConfig" in ask_ai
    assert "startTradingAgentsRun" in ask_ai
    assert "streamTradingAgentsRun" in ask_ai
    assert "cancelTradingAgentsRun" in ask_ai
    assert "开始深度分析" in ask_ai

    assert 'const KEY = "vr-tradingagents"' in tradingagents
    assert 'fetch("/api/tradingagents/run"' in tradingagents
    assert 'fetch(`/api/tradingagents/stream/${taskId}`' in tradingagents
    assert 'fetch(`/api/tradingagents/cancel/${taskId}`' in tradingagents

    assert 'class TradingAgentsRunReq(BaseModel):' in app_py
    assert '@app.post("/api/tradingagents/run")' in app_py
    assert '@app.get("/api/tradingagents/stream/{task_id}")' in app_py
    assert '@app.post("/api/tradingagents/cancel/{task_id}")' in app_py

    assert "STAGES = [" in runtime
    assert "仅支持 A 股 6 位代码" in runtime
    assert "TradingAgents 运行时未安装或不可用" in runtime
    assert "TradingAgentsGraph" in runtime

    assert "test_api_stream_replays_result" in runtime_tests
    assert "test_run_task_emits_result_with_fake_runner" in runtime_tests


def test_sidebar_prioritizes_high_frequency_pages():
    workspace = read("frontend/src/lib/workspace.ts")

    calendar = workspace.index('label: "投资日历"')
    memos = workspace.index('label: "投资备忘"')
    watchlist = workspace.index('label: "关注列表"')
    intel = workspace.index('label: "资讯雷达"')
    framework = workspace.index('label: "框架沉淀"')
    database = workspace.index('label: "数据库"')
    settings = workspace.index('label: "接入 AI"')

    assert calendar < memos < watchlist < intel < framework < database < settings


def test_daily_review_exposes_quick_links_to_core_workflows():
    router = read("frontend/src/router.tsx")
    workspace = read("frontend/src/lib/workspace.ts")

    assert 'path: "/", element: <Navigate to="/calendar" replace />' in router
    assert 'path: "/daily-review", element: <Navigate to="/intel" replace />' in router
    assert 'path: "/portfolio", element: <Navigate to="/framework" replace />' in router
    assert 'path: "/stock-data", element: <Navigate to="/framework" replace />' in router
    assert 'path: "/notes", element: <Navigate to="/memos" replace />' in router
    assert 'to: "/watchlist"' in workspace
    assert 'to: "/intel"' in workspace
    assert 'to: "/framework"' in workspace
    assert 'to: "/database"' in workspace
    assert "投资日历" in workspace
    assert "投资备忘" in workspace
    assert "关注列表" in workspace
    assert "框架沉淀" in workspace


def test_local_startup_helpers_exist_and_point_to_workspace_commands():
    backend_helper = read("scripts/dev-backend.sh")
    frontend_helper = read("scripts/dev-frontend.sh")

    assert "#!/bin/sh" in backend_helper
    assert "backend/.venv/bin/python" in backend_helper
    assert "uvicorn app:app --host 127.0.0.1 --port 8900" in backend_helper

    assert "#!/bin/sh" in frontend_helper
    assert "codex-primary-runtime/dependencies/node/bin" in frontend_helper
    assert "frontend/node_modules/.bin/vite" in frontend_helper
    assert "--host 127.0.0.1 --port 5899" in frontend_helper


def test_local_docs_point_to_startup_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/dev-backend.sh" in readme
    assert "scripts/dev-frontend.sh" in readme
    assert "Repository-local startup helpers" in local_notes


def test_local_verification_helpers_exist_and_point_to_workspace_commands():
    acceptance = read("scripts/check-acceptance.sh")
    frontend = read("scripts/check-frontend-build.sh")
    backend = read("scripts/check-backend.sh")
    all_checks = read("scripts/check-all.sh")

    assert "#!/bin/sh" in acceptance
    assert "pytest tests/test_branding_acceptance.py -q" in acceptance

    assert "#!/bin/sh" in frontend
    assert "codex-primary-runtime/dependencies/node/bin" in frontend
    assert "run build" in frontend

    assert "#!/bin/sh" in backend
    assert '.venv/bin/pytest' in backend
    assert '-m "not live"' in backend

    assert "#!/bin/sh" in all_checks
    assert "scripts/check-acceptance.sh" in all_checks
    assert "scripts/check-frontend-build.sh" in all_checks
    assert "scripts/check-backend.sh" in all_checks


def test_local_docs_point_to_verification_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/check-acceptance.sh" in readme
    assert "scripts/check-frontend-build.sh" in readme
    assert "scripts/check-backend.sh" in readme
    assert "scripts/check-all.sh" in readme
    assert "Repository-local verification helpers" in local_notes


def test_local_initialization_helpers_exist_and_point_to_workspace_commands():
    backend = read("scripts/init-backend.sh")
    frontend = read("scripts/init-frontend.sh")
    all_init = read("scripts/init-all.sh")

    assert "#!/bin/sh" in backend
    assert "codex-primary-runtime/dependencies/python/bin/python3" in backend
    assert "requirements.txt" in backend
    assert "requirements-dev.txt" in backend

    assert "#!/bin/sh" in frontend
    assert "codex-primary-runtime/dependencies/node/bin" in frontend
    assert "install" in frontend
    assert "approve-builds --all" in frontend

    assert "#!/bin/sh" in all_init
    assert "scripts/init-backend.sh" in all_init
    assert "scripts/init-frontend.sh" in all_init


def test_local_docs_point_to_initialization_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/init-backend.sh" in readme
    assert "scripts/init-frontend.sh" in readme
    assert "scripts/init-all.sh" in readme
    assert "Repository-local initialization helpers" in local_notes


def test_local_service_lifecycle_helpers_exist_and_point_to_workspace_commands():
    stop_backend = read("scripts/stop-backend.sh")
    stop_frontend = read("scripts/stop-frontend.sh")
    stop_all = read("scripts/stop-all.sh")
    restart_all = read("scripts/restart-all.sh")

    assert "#!/bin/sh" in stop_backend
    assert "8900" in stop_backend
    assert "lsof" in stop_backend

    assert "#!/bin/sh" in stop_frontend
    assert "5899" in stop_frontend
    assert "lsof" in stop_frontend

    assert "#!/bin/sh" in stop_all
    assert "scripts/stop-backend.sh" in stop_all
    assert "scripts/stop-frontend.sh" in stop_all

    assert "#!/bin/sh" in restart_all
    assert "scripts/stop-all.sh" in restart_all
    assert "dev-backend.sh" in restart_all


def test_vertical_left_nav_supports_drag_sort_and_is_used_by_core_pages():
    section_tabs = read("frontend/src/components/ui/SectionTabs.tsx")
    layout = read("frontend/src/components/layout/Layout.tsx")
    intel = read("frontend/src/pages/Intel.tsx")
    framework = read("frontend/src/pages/Framework.tsx")
    database = read("frontend/src/pages/Database.tsx")
    watchlist = read("frontend/src/pages/Watchlist.tsx")

    assert "draggableStorageKey" in section_tabs
    assert "GripVertical" in section_tabs
    assert 'orientation === "vertical"' in section_tabs
    assert 'orientation = "horizontal"' in section_tabs

    assert "sidebar-children-order:" in layout
    assert "GripVertical" in layout
    assert 'draggableStorageKey="intel-fundamental-view-order"' in intel
    assert 'draggableStorageKey="intel-liquidity-view-order"' in intel
    assert 'draggableStorageKey="intel-event-probability-view-order"' in intel
    assert 'draggableStorageKey="framework-sector-view-order"' in framework
    assert 'draggableStorageKey="framework-stock-view-order"' in framework
    assert 'draggableStorageKey="framework-learning-view-order"' in framework
    assert 'draggableStorageKey="database-china-macro-view-order"' in database
    assert 'draggableStorageKey="watchlist-stock-group-order"' in watchlist
    assert 'draggableStorageKey="watchlist-indicator-category-order"' in watchlist
    assert 'draggableStorageKey="framework-sector-center-tabs"' in framework
    assert 'draggableStorageKey="framework-stock-center-tabs"' in framework
    assert 'draggableStorageKey="framework-weekly-year-order"' in framework
    assert 'draggableStorageKey="framework-learning-object-order"' in framework


def test_intel_event_probability_shell_is_registered():
    workspace = read("frontend/src/lib/workspace.ts")
    intel = read("frontend/src/pages/Intel.tsx")
    api_types = read("frontend/src/lib/api.ts")

    assert '{ key: "event-probability", label: "事件概率" }' in workspace
    assert 'draggableStorageKey="intel-event-probability-view-order"' in intel
    assert "const EVENT_PROBABILITY_VIEW_TABS = [" in intel
    assert "event_probability:" in api_types


def test_workspace_intel_children_include_event_probability():
    workspace = read("frontend/src/lib/workspace.ts")

    assert '{ key: "event-probability", label: "事件概率" }' in workspace
    assert '{ key: "event-probability", label: "事件概率", description: "事件观察、催化清单、数据接口" }' in workspace


def test_local_docs_point_to_service_lifecycle_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/stop-backend.sh" in readme
    assert "scripts/stop-frontend.sh" in readme
    assert "scripts/stop-all.sh" in readme
    assert "scripts/restart-all.sh" in readme
    assert "Repository-local service lifecycle helpers" in local_notes


def test_local_service_status_helpers_exist_and_point_to_workspace_commands():
    status_backend = read("scripts/status-backend.sh")
    status_frontend = read("scripts/status-frontend.sh")
    status_all = read("scripts/status-all.sh")

    assert "#!/bin/sh" in status_backend
    assert "8900" in status_backend
    assert "api/health" in status_backend
    assert "lsof" in status_backend

    assert "#!/bin/sh" in status_frontend
    assert "5899" in status_frontend
    assert "lsof" in status_frontend

    assert "#!/bin/sh" in status_all
    assert "scripts/status-backend.sh" in status_all
    assert "scripts/status-frontend.sh" in status_all


def test_local_docs_point_to_service_status_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/status-backend.sh" in readme
    assert "scripts/status-frontend.sh" in readme
    assert "scripts/status-all.sh" in readme
    assert "Repository-local service status helpers" in local_notes


def test_local_log_helpers_exist_and_point_to_workspace_commands():
    log_backend = read("scripts/log-backend.sh")
    log_frontend = read("scripts/log-frontend.sh")
    log_all = read("scripts/log-all.sh")

    assert "#!/bin/sh" in log_backend
    assert "/tmp/vibe-research-backend.log" in log_backend
    assert "tail" in log_backend

    assert "#!/bin/sh" in log_frontend
    assert "/tmp/vibe-research-frontend.log" in log_frontend
    assert "tail" in log_frontend

    assert "#!/bin/sh" in log_all
    assert "scripts/log-backend.sh" in log_all
    assert "scripts/log-frontend.sh" in log_all


def test_local_docs_point_to_log_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/log-backend.sh" in readme
    assert "scripts/log-frontend.sh" in readme
    assert "scripts/log-all.sh" in readme
    assert "Repository-local log helpers" in local_notes


def test_local_doctor_helpers_exist_and_point_to_workspace_commands():
    doctor_backend = read("scripts/doctor-backend.sh")
    doctor_frontend = read("scripts/doctor-frontend.sh")
    doctor_all = read("scripts/doctor-all.sh")

    assert "#!/bin/sh" in doctor_backend
    assert "codex-primary-runtime/dependencies/python/bin/python3" in doctor_backend
    assert "backend/.venv" in doctor_backend
    assert "8900" in doctor_backend
    assert "/tmp/vibe-research-backend.log" in doctor_backend

    assert "#!/bin/sh" in doctor_frontend
    assert "codex-primary-runtime/dependencies/node/bin" in doctor_frontend
    assert "fallback/pnpm" in doctor_frontend
    assert "frontend/node_modules" in doctor_frontend
    assert "5899" in doctor_frontend
    assert "/tmp/vibe-research-frontend.log" in doctor_frontend

    assert "#!/bin/sh" in doctor_all
    assert "scripts/doctor-backend.sh" in doctor_all
    assert "scripts/doctor-frontend.sh" in doctor_all


def test_local_docs_point_to_doctor_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/doctor-backend.sh" in readme
    assert "scripts/doctor-frontend.sh" in readme
    assert "scripts/doctor-all.sh" in readme
    assert "Repository-local doctor helpers" in local_notes


def test_local_cleanup_helpers_exist_and_point_to_workspace_commands():
    clean_backend = read("scripts/clean-backend.sh")
    clean_frontend = read("scripts/clean-frontend.sh")
    clean_all = read("scripts/clean-all.sh")

    assert "#!/bin/sh" in clean_backend
    assert "stop-backend.sh" in clean_backend
    assert "/tmp/vibe-research-backend.log" in clean_backend
    assert "rm -f" in clean_backend

    assert "#!/bin/sh" in clean_frontend
    assert "stop-frontend.sh" in clean_frontend
    assert "/tmp/vibe-research-frontend.log" in clean_frontend
    assert "rm -f" in clean_frontend

    assert "#!/bin/sh" in clean_all
    assert "scripts/clean-backend.sh" in clean_all
    assert "scripts/clean-frontend.sh" in clean_all


def test_local_docs_point_to_cleanup_helpers():
    readme = read("README.md")
    local_notes = read("docs/local-adoption-notes.md")

    assert "scripts/clean-backend.sh" in readme
    assert "scripts/clean-frontend.sh" in readme
    assert "scripts/clean-all.sh" in readme
    assert "Repository-local cleanup helpers" in local_notes


def test_intel_fundamental_includes_hiring_radar_as_last_module():
    intel = read("frontend/src/pages/Intel.tsx")
    api = read("frontend/src/lib/api.ts")
    hub = read("backend/research_hub.py")

    assert 'label: "招聘雷达"' in intel
    assert 'key: "hiring"' in intel
    assert 'label: "地缘政治"' in intel
    assert intel.index('label: "地缘政治"') < intel.index('label: "招聘雷达"')

    assert '"tech" | "macro" | "industry" | "stock" | "geopolitics" | "hiring"' in api
    assert "hiring_radar" in api
    assert 'return "招聘雷达"' in hub
