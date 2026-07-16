"""Vibe-Research 后端 —— A股数据层 HTTP 接口（FastAPI）。

端点全部在 /api 下，前端 vite 代理 /api → localhost:8900。
只读、无状态、按用户传入代码返回客观数据。不预置标的、不建议。

启动：
    uvicorn app:app --host 127.0.0.1 --port 8900
"""

from __future__ import annotations

import json
import os

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

import astock
import chat as chat_layer
import cli_runtime
import data_adapters
import database_modules
import gstock
import knowledge
import learning_factory
import macro_registry
import newsradar
import portfolio as pf
import market
import myreports as mr
import research_hub
import tradingagents_runtime

app = FastAPI(title="投研体系 API", version="0.1.3")

# 每半小时后台刷新持仓数据
pf.start_scheduler(1800)

# CORS：默认放开（本地自托管友好）；公网部署时用 VR_ALLOW_ORIGINS 收紧成白名单。
#   例：VR_ALLOW_ORIGINS="https://myhost"  （逗号分隔多个）
_ORIGINS = [o.strip() for o in os.environ.get("VR_ALLOW_ORIGINS", "*").split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# 可选鉴权：设了 VR_API_KEY 就要求所有 /api/* 带 `Authorization: Bearer <key>`
#   （本地自托管不设=开放；公网部署务必设，否则别人能读你的持仓/调你的后端）。
_API_KEY = os.environ.get("VR_API_KEY", "").strip()


@app.middleware("http")
async def _require_api_key(request: Request, call_next):
    if (
        _API_KEY
        and request.method != "OPTIONS"
        and request.url.path.startswith("/api/")
        and request.url.path != "/api/health"
    ):
        if request.headers.get("authorization", "") != f"Bearer {_API_KEY}":
            return JSONResponse({"detail": "未授权：缺少或错误的 API Key（VR_API_KEY）"}, status_code=401)
    return await call_next(request)

_CODE_RE = r"^\d{6}$"


def _validate(code: str) -> str:
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(400, "代码必须是 6 位数字")
    return code


@app.get("/api/health")
def health():
    return {"ok": True, "service": "investment-research-api", "version": "0.1.3"}


class LLMConfig(BaseModel):
    provider: str = ""       # cli-* = 订阅接入（调本机 CLI）；其余 = API 接入
    baseURL: str = ""        # 订阅接入时留空
    apiKey: str = ""         # 订阅接入时留空
    model: str


class ChatReq(BaseModel):
    messages: list[dict]
    context: str = ""
    llm: LLMConfig


class TradingAgentsConfigIn(BaseModel):
    provider: str
    baseURL: str
    apiKey: str
    deepModel: str
    quickModel: str


class TradingAgentsRunReq(BaseModel):
    code: str
    name: str = ""
    context: str = ""
    config: TradingAgentsConfigIn


class KnowledgeEntryIn(BaseModel):
    title: str
    type: str
    content: str = ""
    date: str = ""
    tags: list[str] = []
    related_sectors: list[str] = []
    related_stocks: list[str] = []
    investment_view: str = ""


class KnowledgeEntryUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    date: str | None = None
    tags: list[str] | None = None
    related_sectors: list[str] | None = None
    related_stocks: list[str] | None = None
    summary_text: str | None = None
    investment_view: str | None = None


class KnowledgeEntryOrderIn(BaseModel):
    kind: str
    ids: list[str] = []


class CalendarEventIn(BaseModel):
    title: str
    date: str
    category: str = "manual"
    importance: str = "medium"
    source: str = "manual"
    notes: str = ""


class WatchlistIn(BaseModel):
    stocks: list[dict] = []
    indicators: list[dict] = []


class MacroRegistryIn(BaseModel):
    title: str = "中国宏观数据库指标注册表"
    groups: list[dict] = []


class MarketReportIngestIn(BaseModel):
    tickers: list[str] | None = None
    pages: int = 1
    max_reports_per_stock: int = 5


class SectorReportIngestIn(BaseModel):
    sector: str
    days: int = 365
    max_pages: int = 5
    max_reports: int = 12


class PremiumNoteIn(BaseModel):
    title: str
    content: str
    sector: str = ""
    ticker: str = ""
    source_name: str = "premium_notes_placeholder"
    source_type: str = "expert_transcript"
    note_kind: str = "research_note"
    date: str = ""
    tags: list[str] = []
    summary_text: str = ""


class SectorOverviewBuildIn(BaseModel):
    sector: str


class StockOverviewBuildIn(BaseModel):
    ticker: str


class LearningPackGenerateIn(BaseModel):
    source_entry_id: str
    title: str | None = None


class DatabaseModuleIn(BaseModel):
    key: str = ""
    label: str
    description: str = ""
    filters: list[dict] = []
    containers: list[dict] = []


class DatabaseModuleOrderIn(BaseModel):
    keys: list[str] = []


class SectorNodeIn(BaseModel):
    id: str = ""
    name: str
    parent_id: str = ""
    description: str = ""
    sort_order: int = 0


class SectorTreeOrderIn(BaseModel):
    ids: list[str] = []


class SectorIndicatorIn(BaseModel):
    id: str = ""
    sector: str
    name: str
    freq: str = "月度"
    chart_kind: str = "line"
    viewpoint: str = ""
    data_source: str = ""
    sort_order: int = 0


class SectorIndicatorOrderIn(BaseModel):
    sector: str
    ids: list[str] = []


class SectorModuleIn(BaseModel):
    id: str = ""
    sector: str
    title: str
    category: str = "自定义"
    content: str = ""
    data_source: str = ""
    sort_order: int = 0


class StockModuleIn(BaseModel):
    id: str = ""
    ticker: str
    title: str
    category: str = "自定义"
    content: str = ""
    data_source: str = ""
    sort_order: int = 0


class SectorModuleOrderIn(BaseModel):
    sector: str
    ids: list[str] = []


class StockModuleOrderIn(BaseModel):
    ticker: str
    ids: list[str] = []


class IntelArtifactIn(BaseModel):
    kind: str


class NewsRadarConfigIn(BaseModel):
    fetch: dict = {}
    redline_keywords: list[str] = []
    industries: list[dict] = []
    sources: list[dict] = []


@app.get("/api/knowledge/entries")
def knowledge_entries(kind: str | None = Query(None), sector: str | None = Query(None), stock: str | None = Query(None)):
    return {"data": knowledge.list_entries(kind=kind, sector=sector, stock=stock)}


@app.put("/api/knowledge/entries/order")
def knowledge_order_save(payload: KnowledgeEntryOrderIn):
    try:
        return {"data": knowledge.save_entry_order(payload.kind, payload.ids)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/knowledge/entries/{entry_id}")
def knowledge_entry(entry_id: str):
    hit = knowledge.get_entry(entry_id)
    if not hit:
        raise HTTPException(404, "条目不存在")
    return {"data": hit}


@app.post("/api/knowledge/entries")
def knowledge_create(payload: KnowledgeEntryIn):
    try:
        return {"data": knowledge.create_entry(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/api/knowledge/entries/{entry_id}")
def knowledge_update(entry_id: str, payload: KnowledgeEntryUpdate):
    try:
        return {"data": knowledge.update_entry(entry_id, payload.model_dump(exclude_none=True))}
    except KeyError:
        raise HTTPException(404, "条目不存在") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/api/knowledge/entries/{entry_id}")
def knowledge_delete(entry_id: str):
    return {"data": {"ok": knowledge.delete_entry(entry_id)}}


@app.get("/api/knowledge/search")
def knowledge_search(q: str = Query("")):
    return {"data": knowledge.search_entries(q)}


@app.post("/api/knowledge/entries/{entry_id}/summary")
def knowledge_summary(entry_id: str):
    try:
        return {"data": knowledge.generate_entry_summary(entry_id)}
    except KeyError:
        raise HTTPException(404, "条目不存在") from None


@app.post("/api/knowledge/entries/{entry_id}/image-artifact")
def knowledge_image_artifact(entry_id: str):
    try:
        return {"data": knowledge.generate_entry_image_artifact(entry_id)}
    except KeyError:
        raise HTTPException(404, "条目不存在") from None


@app.get("/api/calendar/events")
def calendar_events(view: str = Query("upcoming"), importance: str | None = Query(None)):
    return {"data": knowledge.list_calendar_events(view=view, importance=importance)}


@app.post("/api/calendar/events")
def calendar_upsert(payload: CalendarEventIn):
    try:
        return {"data": knowledge.upsert_calendar_event(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/watchlist")
def watchlist_get():
    return {"data": knowledge.load_watchlist()}


@app.put("/api/watchlist")
def watchlist_put(payload: WatchlistIn):
    return {"data": knowledge.save_watchlist(payload.model_dump())}


@app.get("/api/framework/sector-tree")
def framework_sector_tree():
    return {"data": knowledge.load_sector_tree()}


@app.post("/api/framework/sector-tree/nodes")
def framework_sector_tree_node_upsert(payload: SectorNodeIn):
    try:
        return {"data": knowledge.upsert_sector_node(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/api/framework/sector-tree/nodes/{node_id}")
def framework_sector_tree_node_delete(node_id: str):
    try:
        return {"data": knowledge.delete_sector_node(node_id)}
    except KeyError:
        raise HTTPException(404, "行业节点不存在") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/api/framework/sector-tree/order")
def framework_sector_tree_order_save(payload: SectorTreeOrderIn):
    return {"data": knowledge.save_sector_tree_order(payload.ids)}


@app.get("/api/framework/sector-indicators")
def framework_sector_indicators(sector: str | None = Query(None)):
    return {"data": knowledge.list_sector_indicators(sector=sector)}


@app.post("/api/framework/sector-indicators")
def framework_sector_indicator_upsert(payload: SectorIndicatorIn):
    try:
        return {"data": knowledge.upsert_sector_indicator(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/api/framework/sector-indicators/order")
def framework_sector_indicator_order(payload: SectorIndicatorOrderIn):
    try:
        return {"data": knowledge.reorder_sector_indicators(payload.sector, payload.ids)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/framework/sector-modules")
def framework_sector_modules(sector: str | None = Query(None)):
    return {"data": knowledge.list_sector_modules(sector=sector)}


@app.post("/api/framework/sector-modules")
def framework_sector_module_upsert(payload: SectorModuleIn):
    try:
        return {"data": knowledge.upsert_sector_module(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/api/framework/sector-modules/order")
def framework_sector_module_order(payload: SectorModuleOrderIn):
    try:
        return {"data": knowledge.reorder_sector_modules(payload.sector, payload.ids)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/framework/stock-modules")
def framework_stock_modules(ticker: str | None = Query(None)):
    return {"data": knowledge.list_stock_modules(ticker=ticker)}


@app.post("/api/framework/stock-modules")
def framework_stock_module_upsert(payload: StockModuleIn):
    try:
        return {"data": knowledge.upsert_stock_module(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/api/framework/stock-modules/order")
def framework_stock_module_order(payload: StockModuleOrderIn):
    try:
        return {"data": knowledge.reorder_stock_modules(payload.ticker, payload.ids)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/research/hub")
def research_hub_data():
    return {"data": research_hub.get_research_hub()}


@app.get("/api/research/stock-center")
def research_stock_center(ticker: str = Query(..., min_length=6, max_length=16)):
    return {"data": research_hub.get_stock_center(ticker)}


@app.post("/api/research/market-reports/ingest")
def research_market_reports_ingest(payload: MarketReportIngestIn):
    pages = min(max(payload.pages, 1), 5)
    max_reports = min(max(payload.max_reports_per_stock, 1), 50)
    return {"data": research_hub.ingest_market_reports(payload.tickers, pages=pages, max_reports_per_stock=max_reports)}


@app.post("/api/research/sector-reports/ingest")
def research_sector_reports_ingest(payload: SectorReportIngestIn):
    days = min(max(payload.days, 30), 1825)
    pages = min(max(payload.max_pages, 1), 10)
    max_reports = min(max(payload.max_reports, 1), 50)
    try:
        return {"data": research_hub.ingest_sector_reports(payload.sector, days=days, max_pages=pages, max_reports=max_reports)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/research/premium-notes")
def research_premium_notes_ingest(payload: PremiumNoteIn):
    try:
        return {"data": research_hub.ingest_premium_note(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/research/sector-overview/build")
def research_sector_overview_build(payload: SectorOverviewBuildIn):
    try:
        return {"data": research_hub.build_sector_overview_modules(payload.sector)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/research/stock-overview/build")
def research_stock_overview_build(payload: StockOverviewBuildIn):
    try:
        return {"data": research_hub.build_stock_overview_modules(payload.ticker)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/research/intel-digest")
def research_intel_digest(payload: IntelArtifactIn):
    try:
        return {"data": research_hub.generate_intel_digest(payload.kind)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/research/intel-image-artifact")
def research_intel_image_artifact(payload: IntelArtifactIn):
    try:
        return {"data": research_hub.generate_intel_image_artifact(payload.kind)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/research/news-sources-config")
def research_news_sources_config():
    return {"data": newsradar.load_sources_config()}


@app.put("/api/research/news-sources-config")
def research_news_sources_config_save(payload: NewsRadarConfigIn):
    try:
        return {"data": newsradar.save_sources_config(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/learning/packs/generate")
def learning_pack_generate(payload: LearningPackGenerateIn):
    try:
        return {"data": learning_factory.generate_learning_pack(payload.source_entry_id, payload.title)}
    except KeyError:
        raise HTTPException(404, "源资料不存在") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/learning/packs/{entry_id}/interactive-html")
def learning_pack_interactive_html_generate(entry_id: str):
    try:
        return {"data": learning_factory.generate_interactive_html(entry_id)}
    except KeyError:
        raise HTTPException(404, "学习包不存在") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/learning/packs/{entry_id}/interactive-html")
def learning_pack_interactive_html(entry_id: str):
    try:
        path = learning_factory.interactive_html_path(entry_id)
        return FileResponse(path, media_type="text/html; charset=utf-8", filename=path.name)
    except KeyError:
        raise HTTPException(404, "学习包不存在") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/database/providers")
def database_provider_status():
    return {"data": data_adapters.provider_status()}


@app.get("/api/database/modules")
def database_modules_registry():
    return {"data": database_modules.database_modules()}


@app.post("/api/database/modules/custom")
def database_custom_module_upsert(payload: DatabaseModuleIn):
    try:
        return {"data": database_modules.upsert_custom_module(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/api/database/modules/order")
def database_modules_order_save(payload: DatabaseModuleOrderIn):
    return {"data": database_modules.save_module_order(payload.keys)}


@app.get("/api/database/china-macro-overview")
def database_china_macro_overview():
    return {"data": research_hub.get_china_macro_overview()}


@app.get("/api/database/china-macro-registry")
def database_china_macro_registry():
    return {"data": macro_registry.china_macro_registry()}


@app.put("/api/database/china-macro-registry")
def database_china_macro_registry_save(payload: MacroRegistryIn):
    try:
        return {"data": macro_registry.save_china_macro_registry(payload.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/chat")
def chat(req: ChatReq):
    """系统 AI 对话，**流式** NDJSON（每行一个事件 {type: tool|delta|done|error}）。

    - API 接入：OpenAI 兼容 function-calling，边流答案边推工具调用事件。
    - 订阅接入（provider=cli-*）：调本机已登录的 CLI，stdout 边出边流（数据靠 context）。
    配置错误（缺 key / 未装 CLI）走 HTTP 400；运行时错误走流内 error 事件。用户配置随请求传入，后端不持久化。
    """
    if not req.messages:
        raise HTTPException(400, "messages 不能为空")
    if not req.llm.model:
        raise HTTPException(400, "缺少模型配置，请先在「接入 AI」里选择")

    is_cli = req.llm.provider.startswith("cli-")
    if is_cli:
        kind = req.llm.provider[4:]
        if not cli_runtime.detect_cli(kind):
            raise HTTPException(400, f"未检测到「{kind}」对应的本机命令。请先安装并登录该 CLI，或改用「API 接入」。")
    elif not req.llm.apiKey or not req.llm.baseURL:
        raise HTTPException(400, "缺少 Base URL 或 API Key，请先在「接入 AI」里填写")

    cfg = req.llm.model_dump()

    def gen():
        try:
            events = (chat_layer.run_chat_cli_stream if is_cli else chat_layer.run_chat_stream)(cfg, req.messages, req.context)
            for ev in events:
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        except Exception as e:  # noqa: BLE001 — 运行时错误以流内事件上报，不中断连接
            yield json.dumps({"type": "error", "message": f"对话失败：{e}"}, ensure_ascii=False) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.post("/api/tradingagents/run")
def tradingagents_run(req: TradingAgentsRunReq):
    try:
        task_id = tradingagents_runtime.start_task(
            req.code,
            req.name,
            req.context,
            req.config.model_dump(),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"taskId": task_id}


@app.get("/api/tradingagents/stream/{task_id}")
def tradingagents_stream(task_id: str):
    def gen():
        try:
            for ev in tradingagents_runtime.stream_events(task_id):
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        except KeyError:
            yield json.dumps({"type": "error", "taskId": task_id, "message": "任务不存在"}, ensure_ascii=False) + "\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.post("/api/tradingagents/cancel/{task_id}")
def tradingagents_cancel(task_id: str):
    try:
        return tradingagents_runtime.cancel_task(task_id)
    except KeyError:
        raise HTTPException(404, "任务不存在") from None


class HoldingIn(BaseModel):
    code: str
    shares: float
    cost: float


@app.get("/api/portfolio")
def portfolio_get():
    """持仓 + 实时盈亏（浮动盈亏红涨绿跌）。"""
    try:
        return {"data": pf.get_portfolio()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"持仓读取异常：{e}") from e


@app.post("/api/portfolio/holding")
def portfolio_add(h: HoldingIn):
    """加一笔持仓（同代码按加权平均成本合并）。存本地，不上传。"""
    code = (h.code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(400, "代码必须是 6 位数字")
    if h.shares <= 0:
        raise HTTPException(400, "数量必须大于 0")
    # 成本价不限正负：融券 / 返息 / 摊薄后为负成本等情形按结果计算，用户想怎么输就怎么输。
    return {"data": pf.add_holding(code, h.shares, h.cost)}


@app.delete("/api/portfolio/holding")
def portfolio_remove(code: str = Query(...)):
    return {"data": pf.remove_holding(code.strip())}


# ---- 我的研报（用户上传自己的研报，存本地、不上传、不进开源仓库）----

class ReportIn(BaseModel):
    name: str
    content_b64: str


@app.get("/api/myreports")
def myreports_list():
    return {"data": mr.list_reports()}


@app.post("/api/myreports")
def myreports_upload(r: ReportIn):
    """上传一份研报（base64）→ 存本地 + 按文件名自动打行业标签。"""
    try:
        return {"data": mr.save_report(r.name, r.content_b64)}
    except mr.ReportError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/myreports/file/{rid}")
def myreports_file(rid: str):
    """下载/预览某份研报原文件。"""
    hit = mr.report_path(rid)
    if not hit:
        raise HTTPException(404, "研报不存在")
    path, name = hit
    return FileResponse(str(path), filename=name)


@app.delete("/api/myreports/{rid}")
def myreports_delete(rid: str):
    return {"data": {"ok": mr.delete_report(rid)}}


class CloseIn(BaseModel):
    code: str
    date: str
    price: float
    shares: float
    cost: float


@app.post("/api/portfolio/close")
def portfolio_close(c: CloseIn):
    """记一笔已清仓（已实现盈亏）。存本地。"""
    code = (c.code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(400, "代码必须是 6 位数字")
    if c.price <= 0 or c.shares <= 0:
        raise HTTPException(400, "清仓价与股数必须大于 0")
    # 买入成本不限正负（同持仓录入）：按 (清仓价 - 成本) × 股数 的结果计算已实现盈亏。
    date = (c.date or "").strip()
    if not date:
        raise HTTPException(400, "请填清仓日期")
    from datetime import datetime
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "清仓日期格式应为 YYYY-MM-DD") from None
    return {"data": pf.close_position(code, date, c.price, c.shares, c.cost)}


@app.delete("/api/portfolio/close")
def portfolio_close_remove(index: int = Query(...)):
    return {"data": pf.remove_closed(index)}


@app.post("/api/portfolio/refresh")
def portfolio_refresh():
    """手动刷新：立即重拉行情算盈亏。"""
    try:
        return {"data": pf.get_portfolio()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"刷新失败：{e}") from e


@app.get("/api/radar")
def radar():
    """投研资讯：12 赛道公开 RSS 资讯（读缓存，无缓存返回赛道骨架）。"""
    try:
        return {"data": newsradar.get_radar(force=False)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"投研资讯异常：{e}") from e


@app.post("/api/radar/refresh")
def radar_refresh():
    """强制重抓全部 RSS 源（耗时约 20-40s），更新缓存。"""
    try:
        return {"data": newsradar.fetch_radar()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"投研资讯刷新失败：{e}") from e


@app.get("/api/market/overview")
def market_overview():
    """市场情绪 + 板块资金流（板块/大盘级，全站共享缓存 5 分钟）。"""
    try:
        return {"data": market.get_overview()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"市场总览异常：{e}") from e


@app.get("/api/market/emotion")
def market_emotion():
    """短线情绪：连板梯队 / 最高连板 / 炸板率 / 封板率 / 晋级率 / 涨跌停家数。

    含连板梯队个股清单（code/name/连板数等）——2026-07-05 起如实展示客观公开榜单（东财同款），
    只呈现事实，不附推荐/评分/预测/买卖时机。全站共享缓存 5 分钟。
    """
    try:
        return {"data": market.get_short_term_emotion()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"短线情绪异常：{e}") from e


@app.get("/api/market/turnover-top")
def market_turnover_top():
    """全市场成交额榜 Top20（客观公开榜单数据，非推荐/非预测/不评分）。全站共享缓存 5 分钟。"""
    try:
        return {"data": market.get_turnover_top()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"成交额榜异常：{e}") from e


@app.get("/api/global/indices")
def global_indices():
    """全球指数快照（道指 / 标普500 / 纳斯达克 / 恒生 / 恒生科技）—— A 股看隔夜外围脸色。缓存 5 分钟。"""
    try:
        return {"data": market.get_global_indices()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"全球指数异常：{e}") from e


@app.get("/api/global/stock")
def global_stock(symbol: str = Query(..., min_length=1, max_length=16)):
    """美股 / 港股个股聚合：行情 + 关键财务指标（东财域内源）。symbol 如 AAPL / BABA / 00700。"""
    try:
        data = gstock.us_hk_stock(symbol.strip())
        if not data:
            raise HTTPException(404, f"未找到美股/港股代码「{symbol}」")
        return {"data": data}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"美港股查询异常：{e}") from e


@app.get("/api/indices")
def indices():
    """A股大盘指数实时行情（上证/深证成指/创业板指/沪深300）。仅标准库。"""
    try:
        return {"data": astock.index_quote()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"指数行情异常：{e}") from e


@app.get("/api/quote")
def quote(codes: str = Query(..., description="逗号分隔的 6 位代码")):
    """实时行情：现价/涨跌/PE/PB/市值/换手/涨跌停。仅标准库，永远可用。"""
    lst = [c.strip() for c in codes.split(",") if c.strip()]
    if not lst or any(not c.isdigit() or len(c) != 6 for c in lst):
        raise HTTPException(400, "codes 必须是逗号分隔的 6 位数字")
    try:
        return {"data": astock.tencent_quote(lst)}
    except Exception as e:  # noqa: BLE001 — 边界统一兜底
        raise HTTPException(502, f"行情源异常：{e}") from e


import time as _time
_PCT_CACHE: dict = {}


@app.get("/api/valuation/percentile")
def valuation_percentile(code: str = Query(...)):
    """PE-TTM / PB 历史分位（近5年）。全站缓存 30 分钟/代码（历史序列日频、变化慢）。"""
    code = _validate(code)
    hit = _PCT_CACHE.get(code)
    if hit and _time.time() - hit[0] < 1800:
        return {"data": hit[1]}
    try:
        data = astock.valuation_percentile(code)
        _PCT_CACHE[code] = (_time.time(), data)
        return {"data": data}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"估值分位异常：{e}") from e


_ANN_CACHE: dict = {}


@app.get("/api/announcements")
def announcements(code: str = Query(...)):
    """个股近期公告（东财，仅 requests）。缓存 15 分钟/代码。"""
    code = _validate(code)
    hit = _ANN_CACHE.get(code)
    if hit and _time.time() - hit[0] < 900:
        return {"data": hit[1]}
    try:
        data = astock.announcements(code)
        _ANN_CACHE[code] = (_time.time(), data)
        return {"data": data}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"公告源异常：{e}") from e


_FIN_CACHE: dict = {}


@app.get("/api/financials")
def financials(code: str = Query(...)):
    """财务关键指标（同花顺财务摘要，最新报告期）。缓存 30 分钟/代码。"""
    code = _validate(code)
    hit = _FIN_CACHE.get(code)
    if hit and _time.time() - hit[0] < 1800:
        return {"data": hit[1]}
    try:
        data = astock.financials(code)
        _FIN_CACHE[code] = (_time.time(), data)
        return {"data": data}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"财务摘要异常：{e}") from e


@app.get("/api/valuation")
def valuation(code: str = Query(...)):
    """完整估值：行情 + 一致预期 + 前向PE/PEG/消化年数。"""
    code = _validate(code)
    try:
        return {"data": astock.full_valuation(code)}
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"估值计算异常：{e}") from e


@app.get("/api/reports")
def reports(code: str = Query(...), pages: int = Query(2, ge=1, le=5)):
    """个股研报列表（东财，含 PDF 链接）。仅需 requests。"""
    code = _validate(code)
    try:
        rows = astock.eastmoney_reports(code, max_pages=pages)
        for r in rows:
            r["pdfUrl"] = astock.pdf_url(r.get("infoCode", "")) if r.get("infoCode") else None
        return {"data": rows}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"研报源异常：{e}") from e


@app.get("/api/news")
def news(code: str = Query(...), limit: int = Query(20, ge=1, le=50)):
    """个股新闻（东财，需 akshare）。"""
    code = _validate(code)
    try:
        return {"data": astock.stock_news(code, limit=limit)}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"新闻源异常：{e}") from e


@app.get("/api/info")
def info(code: str = Query(...)):
    """个股基本面：行业/股本/上市时间（需 akshare）。"""
    code = _validate(code)
    try:
        return {"data": astock.individual_info(code)}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"基本面源异常：{e}") from e


@app.get("/api/disclosure")
def disclosure(code: str = Query(...)):
    """巨潮公告列表（需 akshare）。"""
    code = _validate(code)
    try:
        return {"data": astock.disclosure(code)}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"公告源异常：{e}") from e


@app.get("/api/kline")
def kline(code: str = Query(...), category: int = Query(4), offset: int = Query(60, ge=1, le=800)):
    """K线（需 mootdx）。category 4=日 5=周 6=月 11=60分钟。"""
    code = _validate(code)
    try:
        return {"data": astock.kline(code, category=category, offset=offset)}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"K线源异常：{e}") from e


@app.get("/api/finance")
def finance(code: str = Query(...)):
    """季报财务快照（需 mootdx）。"""
    code = _validate(code)
    try:
        return {"data": astock.finance(code)}
    except astock.DependencyMissing as e:
        raise HTTPException(501, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"财务源异常：{e}") from e


# ---------------------------------------------------------------------------
# 资金面 / 筹码 / 信号（东财数据中心，v3.3 并入）—— 均为「用户查的那只股」的公开数据。
# 东财有 1s 限流，这些多为日/季级静态数据，统一走 30 分钟缓存，进一步降低被封风险。
# ---------------------------------------------------------------------------

_DC_CACHE: dict = {}  # key=(endpoint, code) -> (ts, data)


def _cached(endpoint: str, code: str, ttl: int, fetch):
    key = (endpoint, code)
    hit = _DC_CACHE.get(key)
    if hit and _time.time() - hit[0] < ttl:
        return hit[1]
    data = fetch()
    _DC_CACHE[key] = (_time.time(), data)
    return data


@app.get("/api/margin")
def margin(code: str = Query(...)):
    """融资融券明细（东财，日级）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("margin", code, 1800, lambda: astock.margin_trading(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"融资融券异常：{e}") from e


@app.get("/api/block-trade")
def block_trade(code: str = Query(...)):
    """大宗交易（东财）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("block", code, 1800, lambda: astock.block_trade(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"大宗交易异常：{e}") from e


@app.get("/api/holders")
def holders(code: str = Query(...)):
    """股东户数变化（东财，季度级）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("holders", code, 1800, lambda: astock.holder_num_change(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"股东户数异常：{e}") from e


@app.get("/api/dividend")
def dividend(code: str = Query(...)):
    """分红送转历史（东财）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("dividend", code, 1800, lambda: astock.dividend_history(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"分红送转异常：{e}") from e


@app.get("/api/fund-flow")
def fund_flow(code: str = Query(...)):
    """个股资金流（东财 push2his，120 日主力净流入）。缓存 15 分钟。
    注：push2his 对部分大陆住宅 IP 有间歇风控，可能返回空（非代码问题）。"""
    code = _validate(code)
    try:
        return {"data": _cached("fundflow", code, 900, lambda: astock.stock_fund_flow_120d(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"资金流异常：{e}") from e


@app.get("/api/dragon-tiger")
def dragon_tiger(code: str = Query(...)):
    """龙虎榜：该股近期上榜记录 + 买卖席位 + 机构净买（东财）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("dt", code, 1800, lambda: astock.dragon_tiger_board(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"龙虎榜异常：{e}") from e


@app.get("/api/lockup")
def lockup(code: str = Query(...)):
    """限售解禁日历：历史解禁 + 未来 90 天待解禁（东财）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("lockup", code, 1800, lambda: astock.lockup_expiry(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"解禁日历异常：{e}") from e


@app.get("/api/blocks")
def blocks(code: str = Query(...)):
    """个股所属板块/概念归属（东财 slist）。缓存 30 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("blocks", code, 1800, lambda: astock.concept_blocks(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"板块归属异常：{e}") from e


@app.get("/api/hot-concepts")
def hot_concepts(code: str = Query(...)):
    """个股当下被市场归到哪些概念在炒（东财热门概念命中）。缓存 15 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("hotcon", code, 900, lambda: astock.hot_concepts(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"热门概念异常：{e}") from e


@app.get("/api/investor-qa")
def investor_qa(code: str = Query(...)):
    """互动易问答（巨潮）：投资者提问 + 公司回复。缓存 15 分钟。"""
    code = _validate(code)
    try:
        return {"data": _cached("irm", code, 900, lambda: astock.investor_qa(code))}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"互动易异常：{e}") from e


@app.get("/api/industry")
def industry(top: int = Query(20, ge=5, le=50)):
    """全行业涨跌幅排名（东财行业板块，板块级、零个股名单）。缓存 5 分钟。"""
    key = ("industry", str(top))
    hit = _DC_CACHE.get(key)
    if hit and _time.time() - hit[0] < 300:
        return {"data": hit[1]}
    try:
        data = astock.industry_comparison(top_n=top)
        _DC_CACHE[key] = (_time.time(), data)
        return {"data": data}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"行业排名异常：{e}") from e
