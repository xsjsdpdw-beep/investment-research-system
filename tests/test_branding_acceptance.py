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
    assert "dev-frontend.sh" in restart_all
    assert "subprocess.Popen" in restart_all
    assert "start_new_session=True" in restart_all
    assert "api/health" in restart_all
    assert "5899" in restart_all


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
