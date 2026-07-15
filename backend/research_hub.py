"""一期工作台聚合层：资讯雷达、流动性、框架沉淀、数据库样板。"""

from __future__ import annotations

import json
from datetime import datetime
import re

import astock
import data_adapters
import knowledge
import newsradar


def _watch_stock_items() -> list[dict]:
    watchlist = knowledge.load_watchlist()
    stocks = []
    for item in watchlist.get("stocks", []):
        ticker = f"{item.get('code', '')}.{item.get('market', '').upper()}".strip(".")
        stocks.append({
            "ticker": ticker,
            "name": item.get("name") or item.get("code", ""),
            "group": item.get("group", "未分组"),
        })
    return stocks


def _split_ticker(ticker: str) -> tuple[str, str]:
    raw = (ticker or "").strip().upper()
    if "." in raw:
        code, market = raw.split(".", 1)
        return code, market
    return raw, "SZ"


def _report_value(row: dict, *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def _safe_report_id(ticker: str, report_key: str) -> str:
    raw = f"market-report-{ticker}-{report_key}"
    return re.sub(r"[^0-9A-Za-z_.-]+", "-", raw).strip("-")


def _report_key(row: dict) -> str:
    info_code = _report_value(row, "infoCode", "info_code", "INFO_CODE")
    if info_code:
        return info_code
    fallback = "|".join([
        _report_value(row, "publishDate", "PUBLISH_DATE"),
        _report_value(row, "orgSName", "ORG_S_NAME", "orgName"),
        _report_value(row, "title", "TITLE", "reportTitle"),
    ])
    return fallback or "unknown"


def ingest_market_reports(tickers: list[str] | None = None, pages: int = 1, max_reports_per_stock: int = 5) -> dict:
    """把公开市场研报提取为本地附件条目，并按 infoCode 去重。"""
    watch = _watch_stock_items()
    watch_map = {item["ticker"]: item for item in watch}
    target_tickers = tickers or [item["ticker"] for item in watch]
    result = {
        "requested": len(target_tickers),
        "created": 0,
        "skipped": 0,
        "items": [],
        "errors": [],
    }

    for ticker in target_tickers:
        code, market = _split_ticker(ticker)
        normalized_ticker = f"{code}.{market}"
        company = watch_map.get(normalized_ticker, {}).get("name") or code
        try:
            rows = astock.eastmoney_reports(code, max_pages=pages)[:max_reports_per_stock]
        except Exception as exc:
            result["errors"].append({"ticker": normalized_ticker, "message": str(exc)})
            continue

        for row in rows:
            key = _report_key(row)
            entry_id = _safe_report_id(normalized_ticker, key)
            title = _report_value(row, "title", "TITLE", "reportTitle") or f"{company}市场研报"
            org = _report_value(row, "orgSName", "ORG_S_NAME", "orgName")
            publish_date = _report_value(row, "publishDate", "PUBLISH_DATE")[:10]
            rating = _report_value(row, "emRatingName", "EM_RATING_NAME", "rating")
            industry = _report_value(row, "indvInduName", "INDV_INDU_NAME", "industry")
            info_code = _report_value(row, "infoCode", "info_code", "INFO_CODE")
            pdf_url = _report_value(row, "pdfUrl", "pdf_url")
            if not pdf_url and info_code:
                pdf_url = astock.pdf_url(info_code)

            item = {
                "ticker": normalized_ticker,
                "title": title,
                "org": org,
                "date": publish_date,
                "rating": rating,
                "industry": industry,
                "pdfUrl": pdf_url,
                "entry_id": entry_id,
                "status": "skipped",
            }
            if knowledge.get_entry(entry_id):
                result["skipped"] += 1
                result["items"].append(item)
                continue

            content = "\n".join([
                f"eastmoney-report:{key}",
                pdf_url,
                f"机构：{org}" if org else "机构：",
                f"日期：{publish_date}" if publish_date else "日期：",
                f"标题：{title}",
                f"评级：{rating}" if rating else "评级：",
                f"行业：{industry}" if industry else "行业：",
            ]).strip()
            tags = ["市场研报"]
            if org:
                tags.append(org)
            if rating:
                tags.append(rating)
            if industry:
                tags.append(industry)
            knowledge.create_entry({
                "id": entry_id,
                "title": f"市场研报：{title}",
                "type": "attachment_link",
                "content": content,
                "date": publish_date,
                "tags": tags,
                "related_sectors": [industry] if industry else [],
                "related_stocks": [normalized_ticker],
            })
            item["status"] = "created"
            result["created"] += 1
            result["items"].append(item)

    return result


def ingest_premium_note(payload: dict) -> dict:
    title = (payload.get("title") or "").strip()
    content = (payload.get("content") or "").strip()
    sector = (payload.get("sector") or "").strip()
    ticker = (payload.get("ticker") or "").strip().upper()
    source_name = (payload.get("source_name") or "premium_notes_placeholder").strip()
    source_type = (payload.get("source_type") or "expert_transcript").strip()
    note_kind = (payload.get("note_kind") or "research_note").strip()
    if note_kind not in {"research_note", "tracking_comment", "attachment_link"}:
        raise ValueError("note_kind 仅支持 research_note、tracking_comment 或 attachment_link")
    if not title:
        raise ValueError("标题不能为空")
    if not content:
        raise ValueError("内容不能为空")
    if not sector and not ticker:
        raise ValueError("至少要关联一个行业或个股")

    date = (payload.get("date") or datetime.now().strftime("%Y-%m-%d")).strip()
    tags = list(dict.fromkeys([
        "高价值纪要",
        source_name,
        source_type,
        *(payload.get("tags") or []),
    ]))
    body = "\n".join([
        f"premium-note:{source_name}",
        f"kind:{source_type}",
        content,
    ]).strip()
    entry = knowledge.create_entry({
        "title": title,
        "type": note_kind,
        "content": body,
        "date": date,
        "tags": tags,
        "related_sectors": [sector] if sector else [],
        "related_stocks": [ticker] if ticker else [],
        "summary_text": payload.get("summary_text") or "",
    })
    return {
        "entry": entry,
        "scope": "stock" if ticker else "industry",
        "source_name": source_name,
        "source_type": source_type,
    }


def get_research_hub() -> dict:
    radar = newsradar.get_radar(force=False)
    industries = radar.get("industries", []) if isinstance(radar, dict) else []
    provider_status = data_adapters.provider_status()
    global_tech_headlines = sorted(
        [
            {
                "industry_key": industry.get("key", ""),
                "industry_name": industry.get("name", ""),
                "title": item.get("zh") or item.get("title") or "暂无标题",
                "source": item.get("source", ""),
                "time": item.get("time", "—"),
                "url": item.get("url", ""),
                "summary": item.get("summary", ""),
                "ts": item.get("ts", 0),
            }
            for industry in industries
            for item in industry.get("items", [])[:5]
        ],
        key=lambda item: item.get("ts", 0),
        reverse=True,
    )[:10]
    watch = _watch_stock_items()
    sector_entries = knowledge.list_entries(kind="sector_profile")
    weekly_reviews = knowledge.list_entries(kind="weekly_review")
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "fundamental": {
            "source_interfaces": {
                "industry_expert_notes": provider_status["industry_expert_notes"],
                "stock_expert_notes": provider_status["stock_expert_notes"],
            },
            "global_tech_headlines": global_tech_headlines,
            "macro_events": industries[:2],
            "industry_dynamics": industries[:6],
            "stock_dynamics": [
                {
                    "ticker": item["ticker"],
                    "name": item["name"],
                    "highlights": [f"关注列表联动：{item['group']} · 后续接公告与高价值纪要源"],
                }
                for item in watch[:8]
            ],
            "geopolitics": {
                "title": "地缘政治",
                "items": [
                    {"title": "全球风险事件聚合占位", "summary": "一期保留独立区域，后续接更完整事件源。"},
                ],
            },
        },
        "liquidity": {
            "daily_review": {
                "summary": "保留每日复盘位置，前端结合现有市场接口展示全球指数、涨跌分布、行业资金与成交额榜。",
                "etf_placeholder": "国家队 ETF 增减持接口预留",
            },
            "indicators": [
                {"key": "cn_cpi", "label": "中国 CPI", "insight": "关注通胀温和修复与政策空间。"},
                {"key": "us_10y", "label": "美国十年期国债", "insight": "利率中枢变化影响全球风险偏好。"},
            ],
            "commodities": [
                {"key": "gold", "label": "黄金", "insight": "避险与美元利率共同驱动。"},
                {"key": "oil", "label": "原油", "insight": "供给扰动与地缘因素值得跟踪。"},
            ],
        },
        "framework": {
            "sector_focus": sector_entries[:8],
            "stock_focus": watch[:12],
            "weekly_reviews": weekly_reviews[:8],
        },
    }


def _intel_kind_label(kind: str) -> str:
    if kind == "industry":
        return "行业动态"
    if kind == "stock":
        return "个股动态"
    raise ValueError("kind 仅支持 industry 或 stock")


def generate_intel_digest(kind: str) -> dict:
    label = _intel_kind_label(kind)
    hub = get_research_hub()
    if kind == "industry":
        rows = []
        for item in hub["fundamental"]["industry_dynamics"][:6]:
            first = item.get("items", [{}])[0] if item.get("items") else {}
            rows.append(f"{item.get('name')}：{first.get('zh') or first.get('title') or '暂无摘要'}")
        summary = "\n".join(rows) or "暂无行业动态，等待资讯雷达更新。"
    else:
        rows = [
            f"{item['name']}({item['ticker']})：{'；'.join(item.get('highlights', []))}"
            for item in hub["fundamental"]["stock_dynamics"][:8]
        ]
        summary = "\n".join(rows) or "暂无个股动态，请先维护关注列表。"
    return {
        "kind": kind,
        "title": f"{label}摘要",
        "summary_text": summary,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def generate_intel_image_artifact(kind: str) -> dict:
    digest = generate_intel_digest(kind)
    request = {
        "kind": kind,
        "title": digest["title"],
        "summary_text": digest["summary_text"],
        "artifact_type": "intel_dynamic_card",
        "skill_interface": "replaceable_local_skill",
        "suggested_skill": "china-stock-note-visual" if kind == "stock" else "china-sector-overview",
        "requested_at": datetime.now().isoformat(timespec="seconds"),
        "status": "prepared",
    }
    knowledge.ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    path = knowledge.ARTIFACT_DIR / f"intel-{kind}-dynamic-card.json"
    path.write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding="utf-8")
    request["path"] = str(path)
    return request


def get_stock_center(ticker: str) -> dict:
    code, market = _split_ticker(ticker)
    watch = next((item for item in _watch_stock_items() if item["ticker"] == f"{code}.{market}"), None)
    company_name = watch["name"] if watch else code
    try:
        public_info = astock.individual_info(code)
    except Exception:
        public_info = {}
    try:
        announcements = astock.announcements(code)[:10]
    except Exception:
        announcements = []
    try:
        news = astock.stock_news(code, limit=10)
    except Exception:
        news = []

    all_notes = knowledge.list_entries(stock=f"{code}.{market}")
    return {
        "ticker": f"{code}.{market}",
        "company": {
            "name": company_name,
            "group": watch["group"] if watch else "未分组",
        },
        "public_info": public_info,
        "announcements": announcements,
        "news": news,
        "research_notes": [item for item in all_notes if item.get("type") == "research_note"][:10],
        "tracking_comments": [item for item in all_notes if item.get("type") == "tracking_comment"][:10],
        "attachments": [item for item in all_notes if item.get("type") == "attachment_link"][:10],
    }


def get_china_macro_overview() -> dict:
    columns = ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]
    providers = data_adapters.provider_status()
    return {
        "provider": providers["china_macro_overview"]["active_provider"],
        "provider_status": providers,
        "overview_rows": [
            {"label": "GDP(%)", "freq": "当季", "values": ["5.0", "-", "-", "5.2", "-", "-"]},
            {"label": "工业增加值(%)", "freq": "当月", "values": ["5.4", "5.8", "5.9", "6.0", "6.1", "6.3"]},
            {"label": "社零(%)", "freq": "当月", "values": ["3.7", "4.0", "4.2", "4.5", "4.8", "5.0"]},
            {"label": "CPI(%)", "freq": "当月", "values": ["0.1", "0.0", "-0.1", "0.2", "0.1", "0.1"]},
        ],
        "heatmap": {
            "title": "核心指标结构",
            "columns": columns,
            "rows": [
                {"label": "社融存量同比", "values": [8.3, 8.2, 8.2, 7.9, 7.8, 7.7]},
                {"label": "人民币贷款", "values": [6.3, 6.1, 6.1, 5.8, 5.6, 5.5]},
                {"label": "政府债券", "values": [17.1, 17.3, 16.6, 15.9, 15.6, 15.1]},
            ],
        },
        "trend": {
            "title": "核心项走势",
            "x": ["2025-01", "2025-03", "2025-05", "2025-07", "2025-09", "2025-11", "2026-01", "2026-03", "2026-05"],
            "series": [
                {"name": "CPI当月同比", "values": [0.3, 0.1, -0.2, 0.2, 0.4, 0.1, -0.1, 0.6, 1.0]},
                {"name": "CPI食品当月同比", "values": [1.1, -0.5, -1.8, -2.6, -1.0, -0.2, 0.1, 1.4, 1.7]},
                {"name": "CPI非食品当月同比", "values": [0.0, 0.2, 0.4, 0.5, 0.7, 0.8, 0.6, 0.9, 1.2]},
            ],
        },
        "commentary": "一期以中国宏观总览样板页为主，后续可将指标替换为 iFind 实时数据。",
    }
