"""一期工作台聚合层：投研资讯、流动性、框架沉淀、数据库样板。"""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import date, datetime, timezone
import os
from pathlib import Path
import re
from typing import Any

import alphaengine
import astock
import data_adapters
import hiringradar
import knowledge
import myreports
import newsradar


MODULE_ORDER = ("tech", "macro", "industry", "stock", "geopolitics", "hiring")
AUTO_OVERVIEW_SOURCE = "auto_overview_builder"
MARKET_REPORT_DIR = Path(os.environ.get("VR_DATA_DIR") or Path.home() / ".vibe-research") / "market_reports"
DECISION_COCKPIT_STATE_FILE = Path(os.environ.get("VR_DATA_DIR") or Path.home() / ".vibe-research") / "decision_cockpit" / "state.json"
DECISION_QUESTION_STATUSES = {"待验证", "验证中", "已解决", "已失效"}
FRAMEWORK_REVISION_STATES = {"待审", "已批准", "已废弃"}
MAX_REPORT_TEXT_CHARS = 8000
MAX_REPORT_PDF_PAGES = 8
HBM_DRAFT_TABS = (
    ("overview", "总览"),
    ("generation", "技术代际"),
    ("cost_bottleneck", "成本与卡口"),
    ("leaders", "产业龙头"),
    ("cycle_meter", "周期温度计"),
)

SECTOR_OVERVIEW_TEMPLATES = (
    ("市场规模与需求", ("市场规模", "需求", "销量", "景气", "渗透率", "空间", "总量", "增速")),
    ("产业链与关键环节", ("产业链", "环节", "上游", "中游", "下游", "链条", "价值量", "卡点")),
    ("技术路线与产品迭代", ("技术路线", "工艺", "迭代", "产品", "规格", "性能", "良率", "制程")),
    ("竞争格局与龙头", ("竞争格局", "市占率", "龙头", "份额", "CR", "格局", "壁垒")),
    ("核心公司与A股映射", ("公司", "标的", "龙头", "A股", "上市公司", "受益", "映射", "建议关注")),
    ("商业模式与盈利驱动", ("商业模式", "盈利", "毛利率", "净利率", "价格", "成本", "利润", "弹性")),
    ("供需、价格与库存周期", ("供给", "需求", "价格", "涨价", "降价", "库存", "周期", "缺口")),
    ("政策、地缘与产业安全", ("政策", "国产替代", "制裁", "出口管制", "地缘", "安全", "自主可控")),
    ("海外映射与全球龙头", ("海外", "全球", "Samsung", "SK", "Micron", "英伟达", "台积电", "海外龙头")),
    ("核心跟踪变量", ("指标", "跟踪", "订单", "产能", "价格", "库存", "开工", "销量")),
    ("催化事件与验证节点", ("催化", "事件", "财报", "电话会", "发布", "IPO", "扩产", "验证")),
    ("估值、预期与市场分歧", ("估值", "PE", "PB", "预期", "分歧", "一致预期", "交易", "股价")),
    ("风险与变化", ("风险", "压力", "扰动", "政策", "波动", "拐点", "变化", "预期差")),
    ("资料索引与更新计划", ("研报", "纪要", "附件", "资料", "来源", "更新", "索引")),
)

STOCK_OVERVIEW_TEMPLATES = (
    ("公司定位与业务结构", ("业务", "产品", "定位", "收入", "结构", "客户", "商业模式")),
    ("行业位置与竞争格局", ("竞争格局", "份额", "龙头", "壁垒", "优势", "同业", "行业位置")),
    ("产品、技术与产能", ("产品", "技术", "工艺", "产能", "良率", "规格", "迭代", "研发")),
    ("客户结构与订单验证", ("客户", "订单", "验证", "导入", "定点", "出货", "渠道", "合同")),
    ("财务质量与盈利驱动", ("收入", "利润", "毛利率", "费用", "现金流", "ROE", "盈利", "弹性")),
    ("管理层、股权与资本动作", ("股权", "管理层", "回购", "激励", "增持", "减持", "资本动作")),
    ("跟踪指标与催化", ("订单", "产能", "销量", "财报", "电话会", "催化", "指引", "指标")),
    ("估值、预期与交易结构", ("估值", "PE", "PB", "市值", "预期", "一致预期", "持仓", "交易")),
    ("风险与观点更新", ("风险", "压力", "波动", "扰动", "预期差", "看多", "看空", "中性")),
    ("资料索引与更新计划", ("研报", "纪要", "附件", "资料", "来源", "更新", "索引")),
)


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


def _sanitize_filename(value: str) -> str:
    clean = re.sub(r'[\\/:*?"<>|\s]+', "_", value or "").strip("_")
    return clean[:120] or "report"


def _download_report_pdf(pdf_url: str, entry_id: str, title: str) -> tuple[str, str]:
    if not pdf_url:
        return "", "missing_url"
    MARKET_REPORT_DIR.mkdir(parents=True, exist_ok=True)
    target = MARKET_REPORT_DIR / f"{_sanitize_filename(entry_id)}_{_sanitize_filename(title)}.pdf"
    if target.exists() and target.stat().st_size > 1024:
        return str(target), "cached"
    try:
        resp = astock.em_get(pdf_url, headers={"Referer": "https://data.eastmoney.com/"}, timeout=60)
        content = getattr(resp, "content", b"")
        if getattr(resp, "status_code", 0) == 200 and len(content) > 1024:
            target.write_bytes(content)
            return str(target), "downloaded"
        return "", f"http_{getattr(resp, 'status_code', 0)}"
    except Exception as exc:
        return "", f"download_failed:{exc}"


def _extract_pdf_text(pdf_path: str, max_pages: int = MAX_REPORT_PDF_PAGES) -> tuple[str, str]:
    if not pdf_path:
        return "", "no_pdf"
    try:
        from pypdf import PdfReader
    except Exception as exc:
        return "", f"pypdf_missing:{exc}"
    try:
        reader = PdfReader(pdf_path)
        pages = []
        for page in reader.pages[:max_pages]:
            text = page.extract_text() or ""
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                pages.append(text)
        extracted = "\n".join(pages).strip()[:MAX_REPORT_TEXT_CHARS]
        if not extracted:
            return "", "empty_text"
        return extracted, f"extracted_{min(len(reader.pages), max_pages)}p"
    except Exception as exc:
        return "", f"extract_failed:{exc}"


def _report_learning_block(pdf_url: str, entry_id: str, title: str) -> dict:
    pdf_path, download_status = _download_report_pdf(pdf_url, entry_id, title)
    text, extract_status = _extract_pdf_text(pdf_path)
    return {
        "pdf_path": pdf_path,
        "download_status": download_status,
        "text": text,
        "extract_status": extract_status,
    }


def _sector_report_keywords(sector: str) -> list[str]:
    sector = (sector or "").strip()
    low = sector.lower()
    presets = {
        "hbm": ["HBM", "存储", "DRAM", "先进封装", "AI存储"],
        "hbm存储": ["HBM", "存储", "DRAM", "先进封装", "AI存储"],
        "光互联": ["光互联", "硅光", "CPO", "光模块", "光芯片"],
        "ai算力": ["AI算力", "算力", "GPU", "服务器", "液冷"],
        "半导体": ["半导体", "芯片", "晶圆", "封测"],
    }
    if low in presets:
        return presets[low]
    tokens = [item for item in re.split(r"[\s,，/、|]+", sector) if item]
    return list(dict.fromkeys([sector, *tokens]))


def _sector_relevance_score(sector: str, text: str) -> int:
    text_low = (text or "").lower()
    sector_low = (sector or "").lower()
    if sector_low in {"hbm", "hbm存储"}:
        weights = {
            "hbm": 12,
            "dram": 8,
            "长鑫": 7,
            "海力士": 7,
            "美光": 7,
            "先进封装": 6,
            "ai存储": 6,
            "存储芯片": 5,
            "存储": 1,
        }
    elif sector == "光互联":
        weights = {"光互联": 12, "硅光": 10, "cpo": 9, "光模块": 7, "光芯片": 7, "光通信": 5}
    else:
        weights = {keyword.lower(): 3 for keyword in _sector_report_keywords(sector)}
        weights[sector_low] = 8
    score = 0
    for keyword, weight in weights.items():
        score += text_low.count(keyword.lower()) * weight
    return score


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _load_decision_cockpit_state() -> dict[str, Any]:
    if not DECISION_COCKPIT_STATE_FILE.exists():
        return {"question_status": {}, "framework_revision_status": {}, "updated_at": ""}
    try:
        data = json.loads(DECISION_COCKPIT_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"question_status": {}, "framework_revision_status": {}, "updated_at": ""}
    if not isinstance(data, dict):
        return {"question_status": {}, "framework_revision_status": {}, "updated_at": ""}
    data.setdefault("question_status", {})
    data.setdefault("framework_revision_status", {})
    data.setdefault("updated_at", "")
    return data


def _save_decision_cockpit_state(data: dict[str, Any]) -> None:
    DECISION_COCKPIT_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = _utc_now_iso()
    tmp = DECISION_COCKPIT_STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DECISION_COCKPIT_STATE_FILE)


def _decision_question_key(applies_to: str, question: str) -> str:
    return f"{(applies_to or '').strip()}::{(question or '').strip()}"


def _framework_revision_key(engine: str, title: str) -> str:
    return f"{(engine or '').strip()}::{(title or '').strip()}"


def update_decision_question_status(applies_to: str, question: str, status: str, resolution_impact: str = "") -> dict[str, Any]:
    applies_to = (applies_to or "").strip()
    question = (question or "").strip()
    status = (status or "").strip()
    if not applies_to:
        raise ValueError("applies_to 不能为空")
    if not question:
        raise ValueError("question 不能为空")
    if status not in DECISION_QUESTION_STATUSES:
        raise ValueError("status 仅支持 待验证、验证中、已解决、已失效")
    state = _load_decision_cockpit_state()
    row = {
        "applies_to": applies_to,
        "question": question,
        "status": status,
        "resolution_impact": (resolution_impact or "").strip(),
        "updated_at": _utc_now_iso(),
    }
    state["question_status"][_decision_question_key(applies_to, question)] = row
    _save_decision_cockpit_state(state)
    return row


def update_framework_revision_status(engine: str, title: str, approval_state: str, review_note: str = "") -> dict[str, Any]:
    engine = (engine or "").strip()
    title = (title or "").strip()
    approval_state = (approval_state or "").strip()
    if engine not in {"sector_engine", "stock_engine"}:
        raise ValueError("engine 仅支持 sector_engine 或 stock_engine")
    if not title:
        raise ValueError("title 不能为空")
    if approval_state not in FRAMEWORK_REVISION_STATES:
        raise ValueError("approval_state 仅支持 待审、已批准、已废弃")
    state = _load_decision_cockpit_state()
    row = {
        "engine": engine,
        "title": title,
        "approval_state": approval_state,
        "review_note": (review_note or "").strip(),
        "updated_at": _utc_now_iso(),
    }
    state["framework_revision_status"][_framework_revision_key(engine, title)] = row
    _save_decision_cockpit_state(state)
    return row


def is_hbm_sector(sector: str) -> bool:
    normalized = (sector or "").strip().lower()
    return normalized in {"hbm", "hbm存储"}


def ingest_sector_reports(sector: str, days: int = 365, max_pages: int = 5, max_reports: int = 12) -> dict:
    """把公开行业研报提取为本地附件条目，供行业概览持续学习。"""
    sector = (sector or "").strip()
    if not sector:
        raise ValueError("行业不能为空")
    keywords = _sector_report_keywords(sector)
    result = {
        "sector": sector,
        "keywords": keywords,
        "created": 0,
        "skipped": 0,
        "items": [],
        "errors": [],
    }
    try:
        rows = astock.eastmoney_industry_reports(keywords=keywords, days=days, max_pages=max_pages)
        rows = sorted(
            rows,
            key=lambda row: (
                _sector_relevance_score(sector, " ".join([
                    _report_value(row, "title", "TITLE", "reportTitle"),
                    _report_value(row, "industryName", "industry", "INDUSTRY_NAME"),
                ])),
                _report_value(row, "publishDate", "PUBLISH_DATE"),
            ),
            reverse=True,
        )[:max_reports]
    except Exception as exc:
        result["errors"].append({"sector": sector, "message": str(exc)})
        return result

    for row in rows:
        key = _report_key(row)
        entry_id = _safe_report_id(f"sector-{sector}", key)
        title = _report_value(row, "title", "TITLE", "reportTitle") or f"{sector}行业研报"
        org = _report_value(row, "orgSName", "ORG_S_NAME", "orgName")
        publish_date = _report_value(row, "publishDate", "PUBLISH_DATE")[:10]
        rating = _report_value(row, "emRatingName", "EM_RATING_NAME", "rating")
        industry = _report_value(row, "industryName", "industry", "INDUSTRY_NAME")
        info_code = _report_value(row, "infoCode", "info_code", "INFO_CODE")
        pdf_url = _report_value(row, "pdfUrl", "pdf_url")
        if not pdf_url and info_code:
            pdf_url = astock.pdf_url(info_code)
        item = {
            "sector": sector,
            "title": title,
            "org": org,
            "date": publish_date,
            "rating": rating,
            "industry": industry,
            "pdfUrl": pdf_url,
            "entry_id": entry_id,
            "status": "skipped",
            "download_status": "",
            "extract_status": "",
        }
        learning = _report_learning_block(pdf_url, entry_id, title)
        item["download_status"] = learning["download_status"]
        item["extract_status"] = learning["extract_status"]
        if knowledge.get_entry(entry_id):
            existing = knowledge.get_entry(entry_id)
            if existing and "## PDF正文摘录" not in (existing.get("content") or "") and learning["text"]:
                refreshed_content = "\n".join([
                    existing.get("content") or "",
                    "",
                    f"PDF本地路径：{learning['pdf_path']}",
                    f"PDF下载状态：{learning['download_status']}",
                    f"PDF抽取状态：{learning['extract_status']}",
                    "",
                    "## PDF正文摘录",
                    learning["text"],
                ]).strip()
                knowledge.update_entry(entry_id, {"content": refreshed_content})
            result["skipped"] += 1
            result["items"].append(item)
            continue

        content = "\n".join([
            f"eastmoney-industry-report:{key}",
            pdf_url,
            f"机构：{org}" if org else "机构：",
            f"日期：{publish_date}" if publish_date else "日期：",
            f"标题：{title}",
            f"行业：{industry}" if industry else f"行业：{sector}",
            f"评级：{rating}" if rating else "评级：",
            f"关键词：{'、'.join(keywords)}",
            f"PDF本地路径：{learning['pdf_path']}",
            f"PDF下载状态：{learning['download_status']}",
            f"PDF抽取状态：{learning['extract_status']}",
            "",
            "## PDF正文摘录",
            learning["text"] or "PDF正文暂未抽取成功，仍保留链接供后续重试或手动投喂。",
        ]).strip()
        tags = ["行业研报", sector, *keywords]
        if org:
            tags.append(org)
        if industry:
            tags.append(industry)
        knowledge.create_entry({
            "id": entry_id,
            "title": f"行业研报：{title}",
            "type": "attachment_link",
            "content": content,
            "date": publish_date,
            "tags": list(dict.fromkeys(tags)),
            "related_sectors": [sector],
            "related_stocks": [],
        })
        item["status"] = "created"
        result["created"] += 1
        result["items"].append(item)

    return result


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


def _safe_entry_id(prefix: str, value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_.-]+", "-", (value or "").strip()).strip("-")
    return f"{prefix}-{slug or 'item'}"


def ingest_alphaengine_notes(payload: dict) -> dict:
    sector = (payload.get("sector") or "").strip()
    ticker = (payload.get("ticker") or "").strip().upper()
    query = (payload.get("query") or "").strip() or sector or ticker
    if not query:
        raise ValueError("AlphaEngine 查询词不能为空")
    if not sector and not ticker:
        raise ValueError("AlphaEngine 至少要关联一个行业或个股")

    limit = min(max(int(payload.get("limit") or 3), 1), 10)
    page_size = min(max(int(payload.get("page_size") or limit), 1), 20)
    max_pages = min(max(int(payload.get("max_pages") or 1), 1), 3)
    note_kind = (payload.get("note_kind") or "research_note").strip() or "research_note"
    source_type = (payload.get("source_type") or "expert_transcript").strip() or "expert_transcript"
    source_name = (payload.get("source_name") or "alphaengine").strip() or "alphaengine"

    records = alphaengine.search_notes(query, page_size=page_size, max_pages=max_pages)[:limit]
    scope = "stock" if ticker else "industry"
    target = ticker or sector
    created: list[dict[str, Any]] = []
    for item in records:
        publish_time = str(item.get("publish_time") or "").strip()
        publish_date = publish_time[:10] if publish_time else datetime.now().strftime("%Y-%m-%d")
        title = (item.get("title") or "").strip() or f"{query} AlphaEngine 纪要"
        summary = (item.get("summary") or "").strip()
        body = "\n".join(
            part for part in [
                f"premium-note:{source_name}",
                f"kind:{source_type}",
                f"查询词：{query}",
                f"发布时间：{publish_time}" if publish_time else "",
                f"机构：{item.get('institution')}" if item.get("institution") else "",
                f"类型：{item.get('document_type')}" if item.get("document_type") else "",
                f"公司：{item.get('companies')}" if item.get("companies") else "",
                "",
                summary,
            ] if part
        ).strip()
        created.append(
            ingest_premium_note(
                {
                    "id": _safe_entry_id(f"alphaengine-{scope}-{target}", str(item.get("id") or title)),
                    "title": title,
                    "content": body,
                    "sector": sector,
                    "ticker": ticker,
                    "source_name": source_name,
                    "source_type": source_type,
                    "note_kind": note_kind,
                    "date": publish_date,
                    "tags": [str(item.get("document_type") or "专家纪要"), query],
                    "summary_text": summary,
                }
            )["entry"]
        )
    return {
        "scope": scope,
        "target": target,
        "query": query,
        "source_name": source_name,
        "source_type": source_type,
        "created": len(created),
        "items": created,
    }


def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_.-]+", "-", value).strip("-")
    return slug or "overview"


def _entry_text(entry: dict) -> str:
    return " ".join([
        str(entry.get("summary_text") or ""),
        str(entry.get("content") or ""),
        str(entry.get("content_preview") or ""),
    ]).strip()


def _module_text(module: dict) -> str:
    return " ".join([
        str(module.get("category") or ""),
        str(module.get("title") or ""),
        str(module.get("content") or ""),
    ]).strip()


def _source_lines(sources: list[dict], keywords: tuple[str, ...], fallback: str, limit: int = 5) -> list[str]:
    matched = []
    for source in sources:
        text = source.get("text", "")
        label = source.get("label", "资料")
        if not text:
            continue
        lowered_text = text.lower()
        lowered_label = label.lower()
        hit_keyword = next((keyword for keyword in keywords if keyword.lower() in lowered_text or keyword.lower() in lowered_label), "")
        if keywords and not hit_keyword:
            continue
        if hit_keyword and hit_keyword.lower() in lowered_text:
            pos = lowered_text.find(hit_keyword.lower())
            start = max(pos - 90, 0)
            excerpt = text[start:start + 360]
        else:
            excerpt = text[:360]
        matched.append(f"- {label}：{excerpt}")
        if len(matched) >= limit:
            break
    if matched:
        return matched
    return [fallback]


def _source_index(sources: list[dict], limit: int = 10) -> list[str]:
    if not sources:
        return ["- 暂无资料索引，后续可上传研报、粘贴纪要或新增附件。"]
    rows = []
    for item in sources[:limit]:
        label = str(item.get("label", "资料"))
        label = re.sub(r"^(attachment_link|research_note|tracking_comment|sector_profile|stock_profile)/", "", label)
        rows.append(f"- {label}")
    return rows


def _clean_source_label(label: str) -> str:
    label = str(label or "资料")
    return re.sub(r"^(attachment_link|research_note|tracking_comment|sector_profile|stock_profile)/", "", label)


def _clean_research_text(text: str) -> str:
    text = text or ""
    if "## PDF正文摘录" in text:
        text = text.split("## PDF正文摘录", 1)[1]
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"(eastmoney-[\w-]+|PDF本地路径|PDF下载状态|PDF抽取状态|机构：|日期：|标题：|行业：|评级：|关键词：)[^\n]*", " ", text)
    text = re.sub(r"[•◆●]", "。", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _split_research_sentences(text: str) -> list[str]:
    cleaned = _clean_research_text(text)
    chunks = re.split(r"[。；;！？]\s*", cleaned)
    sentences = []
    for chunk in chunks:
        item = chunk.strip(" -—:：，,")
        if len(item) < 18:
            continue
        if any(noise in item for noise in ("免责声明", "风险提示详见", "请务必阅读", "评级说明", "证券研究报告")):
            continue
        sentences.append(item[:260])
    return sentences


def _ranked_research_points(sources: list[dict], keywords: tuple[str, ...], limit: int = 5, context: str = "") -> list[dict]:
    risk_keywords = ("风险", "不及预期", "低于预期", "免责声明", "请务必阅读", "评级说明")
    is_risk_module = any(keyword in keywords for keyword in ("风险", "压力", "扰动", "预期差"))
    noisy_keywords = ("资料来源", "相关研究", "图表", "敬请参阅", "证券研究所", "最后一页")
    points = []
    lowered_keywords = [keyword.lower() for keyword in keywords]
    for source in sources:
        label = _clean_source_label(source.get("label", "资料"))
        for sentence in _split_research_sentences(source.get("text", "")):
            if any(noise in sentence for noise in noisy_keywords):
                continue
            if not is_risk_module and any(noise in sentence for noise in risk_keywords):
                continue
            lowered = sentence.lower()
            score = sum(lowered.count(keyword) for keyword in lowered_keywords)
            score += min(_sector_relevance_score(context, sentence), 20) if context else 0
            if not lowered_keywords:
                score = 1
            if score <= 0:
                continue
            points.append({"label": label, "text": sentence, "score": score})
    deduped = []
    seen = set()
    for point in sorted(points, key=lambda item: item["score"], reverse=True):
        key = point["text"][:80]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(point)
        if len(deduped) >= limit:
            break
    return deduped


def _module_guidance(title: str, scope: str) -> tuple[str, str]:
    guidance = {
        "市场规模与需求": ("围绕需求来源、景气周期、增长空间和放量节奏形成判断。", "后续重点补总量口径、同比增速、下游需求拆分和可验证数据。"),
        "产业链与关键环节": ("梳理上中下游、价值量分布、关键瓶颈和国产替代环节。", "后续重点补产业链公司清单、关键材料/设备/制造环节和价值量变化。"),
        "技术路线与产品迭代": ("提炼技术代际、工艺路线、产品规格、性能指标和良率变化。", "后续重点跟踪新产品发布时间、客户验证、良率和量产节奏。"),
        "竞争格局与龙头": ("提炼龙头公司、份额变化、竞争壁垒和潜在新进入者。", "后续重点补 CR3/CR5、价格策略、扩产计划和龙头财报验证。"),
        "核心公司与A股映射": ("把产业链环节映射到 A 股和海外核心公司，形成可跟踪标的池。", "后续重点补核心公司业务占比、弹性排序和估值对比。"),
        "商业模式与盈利驱动": ("拆解价格、成本、规模、产能利用率和产品结构对盈利的影响。", "后续重点补毛利率、ASP、成本曲线和利润弹性测算。"),
        "供需、价格与库存周期": ("判断当前处在供需周期的哪个位置，以及价格和库存的边际方向。", "后续重点跟踪涨价函、渠道库存、原厂 Capex 和交期变化。"),
        "政策、地缘与产业安全": ("识别政策支持、出口管制、国产替代和产业安全约束。", "后续重点跟踪政策节点、制裁清单、国产替代进度和供应链风险。"),
        "海外映射与全球龙头": ("用海外龙头、海外股价和全球产业趋势验证国内逻辑。", "后续重点跟踪海外龙头财报、Capex、技术路线和订单表述。"),
        "核心跟踪变量": ("沉淀最能验证行业逻辑的高频指标和领先指标。", "后续重点把指标做成可更新图表，而不是只保留文字。"),
        "催化事件与验证节点": ("提炼未来可能改变市场预期的公告、财报、电话会、扩产和产品节点。", "后续重点把催化按日期放入投资日历并持续复盘兑现情况。"),
        "估值、预期与市场分歧": ("沉淀市场已经交易了什么、分歧在哪里、赔率和胜率如何。", "后续重点补估值区间、一致预期、机构持仓和股价阶段。"),
        "风险与变化": ("识别会推翻原有判断的风险、边际变化和反证信号。", "后续重点记录看多/看空观点变化，方便回测判断准确率。"),
        "资料索引与更新计划": ("整理当前资料基座，明确下一步最缺的资料和数据。", "后续重点补缺失资料、上传深度报告、接入专家纪要和公开数据接口。"),
    }
    stock_guidance = {
        "公司定位与业务结构": ("说明公司靠什么业务赚钱，收入结构和核心产品是什么。", "后续重点补业务占比、客户结构和分产品盈利能力。"),
        "行业位置与竞争格局": ("说明公司在产业链和同业中的位置、优势和壁垒。", "后续重点补份额、对标公司和竞争变化。"),
        "产品、技术与产能": ("说明产品代际、技术路线、产能瓶颈和量产节奏。", "后续重点补产能、良率、验证进度和新产品发布。"),
        "客户结构与订单验证": ("说明客户质量、订单可见度、导入进度和渠道反馈。", "后续重点补大客户、订单、出货和电话会验证。"),
        "财务质量与盈利驱动": ("说明收入利润、毛利率、现金流和利润弹性。", "后续重点补财务模型、季度跟踪和预期差。"),
        "管理层、股权与资本动作": ("说明管理层、股权结构、激励、回购和资本运作。", "后续重点补股权变动、激励目标和回购执行。"),
        "跟踪指标与催化": ("说明公司层面最关键的跟踪指标和未来催化。", "后续重点把指标图表化并接入投资日历。"),
        "估值、预期与交易结构": ("说明市场预期、估值位置和交易拥挤度。", "后续重点补一致预期、估值区间和机构持仓。"),
        "风险与观点更新": ("说明会改变投资判断的风险和观点迭代。", "后续重点记录每次点评的看多/中性/看空结论。"),
        "资料索引与更新计划": ("整理当前资料基座和下一步补充方向。", "后续重点补研报、纪要、公告和模型。"),
    }
    return (stock_guidance if scope == "stock" else guidance).get(title, ("基于已有资料提炼该模块的核心判断。", "后续继续补充资料并更新该模块。"))


def _compose_overview_content(title: str, keywords: tuple[str, ...], sources: list[dict], scope: str) -> str:
    context = sources[0].get("context", "") if sources else ""
    points = _ranked_research_points(sources, keywords, limit=7, context=context)
    conclusion, follow_up = _module_guidance(title, scope)
    if not points:
        return "\n".join([
            "## 核心结论",
            "- 当前资料中还没有足够高相关内容支撑更具体判断，需要继续补充研报、纪要、公告或手动观点。",
            "",
            "## 关键证据",
            "- 暂无可用证据。",
            "",
            "## 跟踪重点",
            f"- {follow_up}",
            "",
            "## 来源",
            *_source_index(sources, limit=6),
        ])
    conclusion_lines = [f"- {point['text']}" for point in points[:3]]
    evidence_lines = [f"- {point['text']}（来源：{point['label']}）" for point in points[3:7]]
    if not evidence_lines:
        evidence_lines = [f"- {points[0]['text']}（来源：{points[0]['label']}）"]
    return "\n".join([
        "## 核心结论",
        *conclusion_lines,
        "",
        "## 关键证据",
        *evidence_lines,
        "",
        "## 跟踪重点",
        f"- {conclusion}",
        f"- {follow_up}",
        "",
        "## 来源",
        *_source_index(sources, limit=6),
    ])


def _sector_sources(sector: str) -> list[dict]:
    sources: list[dict] = []
    for listed_entry in knowledge.list_entries(sector=sector):
        entry = knowledge.get_entry(listed_entry.get("id", "")) or listed_entry
        text = _entry_text(entry)
        if text:
            sources.append({"label": f"{entry.get('type', '条目')}/{entry.get('title', '')}", "text": text, "context": sector})
    for module in knowledge.list_sector_modules(sector=sector).get("items", []):
        if module.get("data_source") == AUTO_OVERVIEW_SOURCE:
            continue
        text = _module_text(module)
        if text:
            sources.append({"label": f"自定义模块/{module.get('title', '')}", "text": text, "context": sector})
    for indicator in knowledge.list_sector_indicators(sector=sector).get("items", []):
        text = " ".join([
            str(indicator.get("name") or ""),
            str(indicator.get("freq") or ""),
            str(indicator.get("viewpoint") or ""),
            str(indicator.get("data_source") or ""),
        ]).strip()
        if text:
            sources.append({"label": f"跟踪指标/{indicator.get('name', '')}", "text": text, "context": sector})
    for report in myreports.list_reports():
        industry = str(report.get("industry") or "")
        name = str(report.get("name") or "")
        if industry == sector or sector in name or sector in industry:
            sources.append({"label": f"本地研报/{name}", "text": f"本地上传研报：{name}；分类行业：{industry}。后续全文/OCR 解析会从这里进入行业概览。", "context": sector})
    return sorted(sources, key=lambda item: _sector_relevance_score(sector, f"{item.get('label', '')} {item.get('text', '')}"), reverse=True)


def build_hbm_draft_dashboard(sector: str, sources: list[dict]) -> dict:
    keywords = tuple(_sector_report_keywords(sector))
    ranked = _ranked_research_points(sources, keywords, limit=24, context=sector)
    source_labels = [item.get("label", "") for item in ranked[:3] if item.get("label")]
    tab_keywords = {
        "overview": ("hbm", "存储", "dram", "ai存储", "景气", "需求", "供给"),
        "generation": ("hbm2e", "hbm3", "hbm3e", "带宽", "12hi", "16hi", "堆叠", "封装"),
        "cost_bottleneck": ("良率", "产能", "设备", "封装", "材料", "成本", "卡口", "capex"),
        "leaders": ("海力士", "三星", "美光", "龙头", "份额", "a股", "映射", "封测"),
        "cycle_meter": ("价格", "库存", "扩产", "验证", "周期", "景气", "涨价"),
    }

    def pick_points(key: str, fallback_start: int) -> list[dict]:
        picked = [
            point for point in ranked
            if any(keyword.lower() in point.get("text", "").lower() for keyword in tab_keywords[key])
        ]
        if picked:
            return picked[:4]
        return ranked[fallback_start:fallback_start + 3]

    def metrics_for_tab(key: str, points: list[dict]) -> list[dict]:
        if key == "overview":
            return [
                {"label": "景气", "value": "高关注"},
                {"label": "供给", "value": "偏紧" if any("供给" in p.get("text", "") or "产能" in p.get("text", "") for p in points) else "跟踪中"},
                {"label": "主线", "value": "AI 存储"},
            ]
        if key == "generation":
            return [
                {"label": "当前代际", "value": "HBM3 / 3E"},
                {"label": "层数", "value": "12hi/16hi"},
                {"label": "核心变量", "value": "带宽与封装"},
            ]
        if key == "cost_bottleneck":
            return [
                {"label": "核心卡口", "value": "良率"},
                {"label": "扩产约束", "value": "设备/封装"},
            ]
        if key == "leaders":
            return [
                {"label": "海外龙头", "value": "海力士/三星/美光"},
                {"label": "本地映射", "value": "设备/材料/封测"},
            ]
        return [
            {"label": "周期温度", "value": "高位跟踪"},
            {"label": "领先信号", "value": "价格/库存/扩产"},
        ]

    def panels_for_tab(key: str, points: list[dict]) -> list[dict]:
        if not points:
            return []
        if key == "overview":
            return [{"title": "当前主矛盾", "items": [point.get("text", "") for point in points[:3]]}]
        if key == "generation":
            return [
                {"title": "代际演进", "items": [point.get("text", "") for point in points[:2]]},
                {"title": "升级信号", "items": [point.get("text", "") for point in points[2:4]] or [points[0].get("text", "")]},
            ]
        if key == "cost_bottleneck":
            return [
                {"title": "成本与卡口", "items": [point.get("text", "") for point in points[:3]]},
            ]
        if key == "leaders":
            return [
                {"title": "全球龙头", "items": [point.get("text", "") for point in points[:2]]},
                {"title": "A股映射", "items": [point.get("text", "") for point in points[2:4]] or [points[0].get("text", "")]},
            ]
        return [
            {"title": "周期信号", "items": [point.get("text", "") for point in points[:3]]},
        ]

    def generation_steps(points: list[dict]) -> list[dict]:
        text = " ".join(point.get("text", "") for point in points).lower()
        return [
            {"label": "HBM2E", "caption": "成熟导入", "active": "hbm2e" in text},
            {"label": "HBM3", "caption": "向高带宽过渡", "active": "hbm3" in text or "hbm3e" in text},
            {"label": "HBM3E", "caption": "当前主升级代际", "active": "hbm3e" in text},
            {"label": "Next", "caption": "16hi / 更高带宽", "active": "16hi" in text or "更高带宽" in text or "下一代" in text},
        ]

    def cost_stack(points: list[dict]) -> list[dict]:
        text = " ".join(point.get("text", "") for point in points)
        stack = [
            {"label": "先进封装", "weight": 34 if "封装" in text else 28, "note": "封装与堆叠能力"},
            {"label": "设备", "weight": 26 if "设备" in text else 22, "note": "扩产设备与交付节奏"},
            {"label": "良率", "weight": 22 if "良率" in text else 18, "note": "量产良率决定成本斜率"},
            {"label": "材料", "weight": 18 if "材料" in text else 14, "note": "材料与基板约束"},
        ]
        return stack

    def chain_nodes(points: list[dict]) -> list[dict]:
        text = " ".join(point.get("text", "") for point in points)
        chain = [
            {
                "label": "AI GPU" if "gpu" in text.lower() or "ai gpu" in text.lower() else "AI 需求",
                "tag": "需求源头",
                "emphasis": "算力拉动",
            },
            {
                "label": "先进封装" if "封装" in text else "封装",
                "tag": "制造卡位",
                "emphasis": "封装升级",
            },
            {
                "label": "HBM",
                "tag": "核心器件",
                "emphasis": "带宽瓶颈",
            },
            {
                "label": "服务器" if "服务器" in text else "算力板卡",
                "tag": "终端承接",
                "emphasis": "整机兑现",
            },
        ]
        return chain

    def leader_cards(points: list[dict]) -> list[dict]:
        text = " ".join(point.get("text", "") for point in points)
        cards = []
        for name, role, edge, segment, mapping in [
            ("海力士", "存储龙头", "HBM3E 领先", "原厂", "存储颗粒"),
            ("三星", "综合巨头", "产能与客户覆盖", "原厂", "高端客户验证"),
            ("美光", "追赶者", "高端份额追赶", "原厂", "高端份额追赶"),
        ]:
            cards.append({
                "name": name,
                "role": role,
                "edge": edge if name in text else edge,
                "segment": segment,
                "mapping": mapping,
            })
        return cards

    tabs = []
    for index, (key, title) in enumerate(HBM_DRAFT_TABS):
        points = pick_points(key, index * 2)
        summary = [point.get("text", "") for point in points[:3] if point.get("text")]
        tab = {
            "key": key,
            "title": title,
            "headline": summary[0] if summary else "",
            "summary": summary,
            "metrics": metrics_for_tab(key, points),
            "panels": panels_for_tab(key, points),
            "sources": source_labels,
            "empty_state": "资料不足，等待更多 HBM 资料进入当前栏目。",
        }
        if key == "generation":
            tab["generation_steps"] = generation_steps(points)
        if key == "cost_bottleneck":
            tab["cost_stack"] = cost_stack(points)
        if key == "overview":
            tab["chain_nodes"] = chain_nodes(points)
        if key == "leaders":
            tab["leader_cards"] = leader_cards(points)
        tabs.append(tab)
    return {
        "kind": "hbm_draft_dashboard",
        "scope": sector,
        "tabs": tabs,
        "generated_at": _utc_now_iso(),
    }


def map_legacy_hbm_dashboard_to_canvas(schema: dict[str, Any]) -> dict[str, Any]:
    tabs = []
    for index, tab in enumerate(schema.get("tabs") or []):
        if not isinstance(tab, dict):
            continue
        key = str(tab.get("key") or f"tab-{index}")
        title = str(tab.get("title") or "未命名栏目")
        cards: list[dict[str, Any]] = [
            {
                "id": f"{key}-hero",
                "type": "summary_hero",
                "title": title,
                "layout": "hero",
                "content": {
                    "headline": str(tab.get("headline") or ""),
                    "bullets": [str(item) for item in (tab.get("summary") or []) if str(item).strip()],
                    "tags": [str(metric.get("value") or "") for metric in (tab.get("metrics") or []) if str(metric.get("value") or "").strip()],
                },
                "sources": [str(item) for item in (tab.get("sources") or []) if str(item).strip()],
            }
        ]
        if tab.get("metrics"):
            cards.append(
                {
                    "id": f"{key}-metrics",
                    "type": "metric_grid",
                    "title": "关键指标",
                    "layout": "grid",
                    "content": {
                        "items": [
                            {
                                "label": str(metric.get("label") or ""),
                                "value": str(metric.get("value") or ""),
                                "note": str(metric.get("tone") or ""),
                            }
                            for metric in (tab.get("metrics") or [])
                            if isinstance(metric, dict)
                        ]
                    },
                }
            )
        if tab.get("generation_steps"):
            cards.append(
                {
                    "id": f"{key}-timeline",
                    "type": "timeline",
                    "title": "技术代际",
                    "layout": "timeline",
                    "content": {"steps": deepcopy(tab.get("generation_steps") or [])},
                }
            )
        if tab.get("cost_stack"):
            cards.append(
                {
                    "id": f"{key}-range",
                    "type": "range_band",
                    "title": "成本与卡口",
                    "layout": "band",
                    "content": {
                        "current_label": "核心约束",
                        "current_value": str((tab.get("metrics") or [{}])[0].get("value") or ""),
                        "segments": deepcopy(tab.get("cost_stack") or []),
                    },
                }
            )
        if tab.get("leader_cards"):
            cards.append(
                {
                    "id": f"{key}-comparison",
                    "type": "comparison_cards",
                    "title": "龙头对比",
                    "layout": "comparison",
                    "content": {"items": deepcopy(tab.get("leader_cards") or [])},
                }
            )
        tabs.append({"id": f"tab-{key}", "title": title, "cards": cards})
    return {
        "kind": "industry_draft_canvas",
        "version": "v1",
        "scope": str(schema.get("scope") or "HBM"),
        "tabs": tabs,
        "meta": {
            "generated_at": str(schema.get("generated_at") or _utc_now_iso()),
            "source_mode": "auto",
        },
    }


def _hbm_sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"[。！？；;\n]+", text) if item.strip()]


def _hbm_labeled_items(text: str, heading: str, separator: str) -> list[dict[str, str]]:
    match = re.search(rf"{heading}\s*[:：]\s*([^。！？；;\n]+)", text, re.IGNORECASE)
    if not match:
        return []
    return [
        {"label": item.strip()}
        for item in re.split(separator, match.group(1))
        if item.strip()
    ]


def _is_hbm_theme(text: str) -> bool:
    text_low = text.lower()
    return any(token in text_low for token in ("hbm", "dram", "高带宽内存", "ai 存储", "ai存储"))


def _infer_hbm_flow_steps(text: str) -> list[dict[str, str]]:
    if not (_is_hbm_theme(text) or any(token.lower() in text.lower() for token in ("tsv", "先进封装", "混合键合", "hybrid bonding"))):
        return []
    return [
        {"label": "DRAM Die", "caption": "多层 DRAM 晶圆/裸片准备"},
        {"label": "TSV", "caption": "硅通孔形成垂直互连"},
        {"label": "Hybrid Bonding", "caption": "混合键合提升堆叠密度"},
        {"label": "Stacking", "caption": "多层堆叠形成高带宽内存"},
        {"label": "Advanced Packaging", "caption": "与 GPU/基板完成先进封装"},
    ]


def _infer_hbm_chain_nodes(text: str) -> list[dict[str, str]]:
    if not _is_hbm_theme(text):
        return []
    nodes = [
        {"label": "AI 加速器 / GPU", "detail": "英伟达、AMD、云厂商需求拉动"},
        {"label": "HBM / DRAM 原厂", "detail": "SK 海力士、三星、美光及国产替代链条"},
        {"label": "先进封装", "detail": "TSV、混合键合、CoWoS/封测产能"},
        {"label": "设备与材料", "detail": "刻蚀、沉积、测试、基板与关键材料"},
        {"label": "服务器 / AIDC", "detail": "AI 服务器和数据中心放量承接"},
    ]
    return nodes


def _infer_hbm_metrics(text: str) -> list[dict[str, str]]:
    if not _is_hbm_theme(text):
        return []
    return [
        {"label": "代际层数", "value": "8-24Hi"},
        {"label": "核心工艺", "value": "TSV/混合键合"},
        {"label": "需求主线", "value": "AI服务器"},
    ]


def _extract_hbm_metrics(text: str) -> list[dict[str, str]]:
    metrics = []
    seen = set()
    metric_patterns = [
        ("单颗容量", r"(?:单颗)?容量\s*(\d+(?:\.\d+)?\s*(?:GB|TB))"),
        ("层数", r"层数\s*(\d+(?:\.\d+)?\s*(?:Hi|hi))"),
        ("堆叠层数", r"(\d+(?:\.\d+)?\s*(?:Hi|hi))\s*(?:堆叠|stack)"),
        ("带宽", r"带宽\s*(\d+(?:\.\d+)?\s*(?:GB/s|Gb/s|Gbps|TB/s))"),
        ("位宽", r"位宽\s*(\d+(?:\.\d+)?\s*(?:bit|Bit|x))"),
        ("良率", r"良率\s*(\d+(?:\.\d+)?\s*%)"),
        ("ASP", r"ASP\s*(?:提升|增长|上涨|约)?\s*(\d+(?:\.\d+)?\s*%)"),
    ]
    for sentence in _hbm_sentences(text):
        if not any(token.lower() in sentence.lower() for token in ("hbm", "容量", "层数", "堆叠", "带宽", "位宽", "ASP", "良率")):
            continue
        for label, pattern in metric_patterns:
            match = re.search(pattern, sentence, re.IGNORECASE)
            if not match:
                continue
            value = re.sub(r"\s+", "", match.group(1))
            if label and value and label not in seen:
                metrics.append({"label": label, "value": value})
                seen.add(label)
    return metrics


def _extract_hbm_comparisons(text: str) -> list[dict[str, str]]:
    names = []
    for name in re.findall(r"\bHBM\d(?:E)?\b", text, re.IGNORECASE):
        normalized = name.upper()
        if normalized not in names:
            names.append(normalized)
    return [
        {"name": name, "value": "当前主流" if index == len(names) - 1 else "上一代"}
        for index, name in enumerate(names)
    ]


def _extract_hbm_series(metrics: list[dict[str, str]]) -> list[dict[str, Any]]:
    points = []
    for metric in metrics:
        match = re.search(r"\d+(?:\.\d+)?", metric.get("value", ""))
        if match:
            points.append({"label": metric["label"], "value": float(match.group())})
    return [{"name": "关键指标", "points": points}] if len(points) >= 2 else []


def _infer_hbm_series(text: str) -> list[dict[str, Any]]:
    if not _is_hbm_theme(text):
        return []
    return [
        {
            "name": "代际层数",
            "points": [
                {"label": "HBM2E", "value": 8},
                {"label": "HBM3", "value": 12},
                {"label": "HBM3E", "value": 16},
                {"label": "HBM4", "value": 24},
            ],
        }
    ]


def _extract_hbm_rows(text: str) -> list[dict[str, Any]]:
    rows = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) >= 2 and all(cells):
            rows.append({"cells": cells, "kind": "header" if not rows else "row"})
    return rows


def _infer_hbm_rows(text: str) -> list[dict[str, Any]]:
    if not _is_hbm_theme(text):
        return []
    return [
        {"cells": ["维度", "当前观察", "含义"], "kind": "header"},
        {"cells": ["技术代际", "HBM3E -> HBM4", "层数、带宽、功耗继续升级"], "kind": "row"},
        {"cells": ["制造卡口", "TSV / 混合键合 / 良率", "决定放量节奏和成本曲线"], "kind": "row"},
        {"cells": ["需求主线", "AI 服务器 / GPU", "决定景气持续时间"], "kind": "row"},
    ]


def _extract_hbm_keyword_sentences(text: str, keywords: tuple[str, ...]) -> list[dict[str, str]]:
    return [{"text": sentence} for sentence in _hbm_sentences(text) if any(keyword in sentence for keyword in keywords)]


def extract_hbm_expression_units(sources: list[dict[str, Any]]) -> dict[str, Any]:
    text = "\n".join(str(item.get("text") or "") for item in sources if isinstance(item, dict))
    metrics = _extract_hbm_metrics(text) or _infer_hbm_metrics(text)
    steps = _hbm_labeled_items(text, "工艺流程", r"\s*(?:->|→|—|－)\s*") or _infer_hbm_flow_steps(text)
    nodes = _hbm_labeled_items(text, "产业链", r"\s*[、，,]\s*") or _infer_hbm_chain_nodes(text)
    series = _extract_hbm_series(metrics) or _infer_hbm_series(text)
    rows = _extract_hbm_rows(text) or _infer_hbm_rows(text)
    return {
        "claims": [{"text": sentence} for sentence in _hbm_sentences(text)[:8]],
        "metrics": metrics,
        "comparisons": _extract_hbm_comparisons(text),
        "steps": steps,
        "nodes": nodes,
        "series": series,
        "rows": rows,
        "drivers": _extract_hbm_keyword_sentences(text, ("需求", "供给", "扩产", "价格", "带宽", "AI")),
        "risks": _extract_hbm_keyword_sentences(text, ("风险", "卡口", "良率", "库存", "约束")),
        "milestones": _extract_hbm_keyword_sentences(text, ("HBM2", "HBM3", "HBM4", "代际", "验证", "导入")),
        "sources": [str(item.get("label") or "") for item in sources if isinstance(item, dict) and item.get("label")],
    }


def _hbm_block(block_id: str, block_type: str, title: str, spec: dict[str, Any], sources: list[str]) -> dict[str, Any]:
    return {
        "id": block_id,
        "type": block_type,
        "title": title,
        "spec": spec,
        "sources": sources,
        "style_variant": "dark-report",
    }


def make_summary_hero_block(claims: list[dict], metrics: list[dict], sources: list[str]) -> dict[str, Any]:
    return _hbm_block(
        "overview-hero", "summary_hero", "HBM 总览",
        {
            "headline": str((claims or [{}])[0].get("text") or "HBM 资料待补充"),
            "bullets": [str(item.get("text") or "") for item in claims[:3] if item.get("text")],
            "tags": [str(item.get("value") or "") for item in metrics[:3] if item.get("value")],
        },
        sources,
    )


def _hbm_metric_weight(metric: dict) -> float:
    match = re.search(r"\d+(?:\.\d+)?", str(metric.get("value") or ""))
    return float(match.group()) if match else 1


def make_range_band_block(metrics: list[dict], sources: list[str]) -> dict[str, Any]:
    segments = [
        {
            "label": str(metric.get("label") or ""),
            "weight": _hbm_metric_weight(metric),
            "note": str(metric.get("value") or ""),
        }
        for metric in metrics
    ]
    return _hbm_block(
        "overview-range", "range_band", "关键指标区间",
        {"segments": segments, "current_label": "核心指标", "current_value": str((metrics or [{}])[0].get("value") or "跟踪中")},
        sources,
    )


def make_flow_map_block(steps: list[dict], sources: list[str]) -> dict[str, Any]:
    return _hbm_block("overview-flow", "flow_map", "工艺流程", {"steps": steps}, sources)


def make_industry_chain_block(nodes: list[dict], sources: list[str]) -> dict[str, Any]:
    return _hbm_block("overview-chain", "industry_chain", "产业链", {"nodes": nodes}, sources)


def make_chart_spec_block(series: list[dict], sources: list[str]) -> dict[str, Any]:
    return _hbm_block("overview-chart", "chart_spec", "指标趋势", {"chart_type": "bar", "series": series}, sources)


def build_hbm_infographic_tabs(sector: str, extracted: dict[str, Any]) -> list[dict[str, Any]]:
    sources = [str(item) for item in extracted.get("sources", []) if str(item).strip()]
    claims = extracted.get("claims") or []
    metrics = extracted.get("metrics") or []
    comparisons = extracted.get("comparisons") or []
    steps = extracted.get("steps") or []
    nodes = extracted.get("nodes") or []
    series = extracted.get("series") or []
    rows = extracted.get("rows") or []
    milestones = extracted.get("milestones") or []
    drivers = extracted.get("drivers") or []
    risks = extracted.get("risks") or []
    return [
        {
            "id": "tab-overview", "title": "总览", "blocks": [
                make_summary_hero_block(claims, metrics, sources),
                make_range_band_block(metrics, sources),
                make_flow_map_block(steps, sources),
                make_industry_chain_block(nodes, sources),
                make_chart_spec_block(series, sources),
            ],
        },
        {
            "id": "tab-generation", "title": "技术代际", "blocks": [
                _hbm_block(
                    "generation-timeline", "timeline", "代际演进",
                    {"steps": [{"label": item.get("text", ""), "caption": "", "active": True} for item in milestones]},
                    sources,
                ),
                _hbm_block(
                    "generation-comparison", "comparison_cards", "代际对比",
                    {"items": [{"name": item.get("name", ""), "headline": item.get("value", "")} for item in comparisons]},
                    sources,
                ),
                _hbm_block("generation-table", "comparison_table", "规格对照", {"rows": rows}, sources),
            ],
        },
        {
            "id": "tab-cost-bottleneck", "title": "成本与卡口", "blocks": [
                _hbm_block("cost-metrics", "metric_grid", "核心约束", {"items": metrics}, sources),
                _hbm_block("cost-evidence", "evidence_table", "卡口证据", {"rows": risks}, sources),
            ],
        },
        {
            "id": "tab-leaders", "title": "产业龙头", "blocks": [
                _hbm_block(
                    "leaders-comparison", "comparison_cards", "主要厂商",
                    {"items": [{"name": item.get("name", ""), "headline": item.get("value", "")} for item in comparisons]},
                    sources,
                ),
                _hbm_block("leaders-chain", "industry_chain", "产业链位置", {"nodes": nodes}, sources),
            ],
        },
        {
            "id": "tab-cycle-meter", "title": "周期温度计", "blocks": [
                _hbm_block(
                    "cycle-hero", "summary_hero", "景气驱动",
                    {"bullets": [item.get("text", "") for item in drivers]},
                    sources,
                ),
                _hbm_block("cycle-chart", "chart_spec", "跟踪指标", {"chart_type": "line", "series": series}, sources),
            ],
        },
    ]


def build_hbm_draft_canvas(sector: str, sources: list[dict]) -> dict[str, Any]:
    extracted = extract_hbm_expression_units(sources)
    return {
        "kind": "industry_draft_canvas",
        "version": "v2",
        "scope": sector,
        "tabs": build_hbm_infographic_tabs(sector, extracted),
        "meta": {"generated_at": _utc_now_iso(), "source_mode": "auto"},
    }


def build_sector_overview_modules(sector: str) -> dict:
    """把行业相关资料沉淀为固定框架模块，供行业概览持续迭代。"""
    sector = (sector or "").strip()
    if not sector:
        raise ValueError("行业不能为空")
    report_ingest = ingest_sector_reports(sector, max_pages=3, max_reports=8)
    sources = _sector_sources(sector)
    modules = []
    for index, (title, keywords) in enumerate(SECTOR_OVERVIEW_TEMPLATES):
        content = _compose_overview_content(title, keywords, sources, "sector")
        modules.append(knowledge.upsert_sector_module({
            "id": f"overview-{_safe_slug(sector)}-{_safe_slug(title)}",
            "sector": sector,
            "title": title,
            "category": "行业概览",
            "content": content,
            "data_source": AUTO_OVERVIEW_SOURCE,
            "sort_order": index,
        }))
    result = {
        "scope": "sector",
        "target": sector,
        "sources_count": len(sources),
        "report_ingest": report_ingest,
        "modules": modules,
    }
    if is_hbm_sector(sector):
        result["draft_theme_schema"] = build_hbm_draft_canvas(sector, sources)
    return result


def _stock_sources(ticker: str) -> list[dict]:
    sources: list[dict] = []
    center = get_stock_center(ticker)
    for key, value in center.get("public_info", {}).items():
        if value:
            sources.append({"label": f"公开信息/{key}", "text": str(value)})
    for entry in [
        *center.get("research_notes", []),
        *center.get("tracking_comments", []),
        *center.get("attachments", []),
    ]:
        entry = knowledge.get_entry(entry.get("id", "")) or entry
        text = _entry_text(entry)
        if text:
            sources.append({"label": f"{entry.get('type', '条目')}/{entry.get('title', '')}", "text": text})
    for item in center.get("announcements", [])[:8]:
        sources.append({"label": f"公告/{item.get('date', '')}", "text": f"{item.get('title', '')} {item.get('type', '')}".strip()})
    for item in center.get("news", [])[:8]:
        sources.append({"label": f"新闻/{item.get('文章来源', '')}", "text": str(item.get("新闻标题") or "")})
    for module in knowledge.list_stock_modules(ticker=ticker).get("items", []):
        if module.get("data_source") == AUTO_OVERVIEW_SOURCE:
            continue
        text = _module_text(module)
        if text:
            sources.append({"label": f"自定义模块/{module.get('title', '')}", "text": text})
    return sources


def build_stock_overview_modules(ticker: str) -> dict:
    """把个股公开信息、纪要、点评和附件沉淀为公司概览模块。"""
    ticker = (ticker or "").strip().upper()
    if not ticker:
        raise ValueError("个股不能为空")
    sources = _stock_sources(ticker)
    modules = []
    for index, (title, keywords) in enumerate(STOCK_OVERVIEW_TEMPLATES):
        content = _compose_overview_content(title, keywords, sources, "stock")
        modules.append(knowledge.upsert_stock_module({
            "id": f"overview-{_safe_slug(ticker)}-{_safe_slug(title)}",
            "ticker": ticker,
            "title": title,
            "category": "公司概览",
            "content": content,
            "data_source": AUTO_OVERVIEW_SOURCE,
            "sort_order": index,
        }))
    return {
        "scope": "stock",
        "target": ticker,
        "sources_count": len(sources),
        "modules": modules,
    }


def _module_groups(radar: dict | None, cfg: dict, module: str) -> list[dict]:
    industries = radar.get("industries", []) if isinstance(radar, dict) else []
    industry_map = {item.get("key", ""): item for item in industries}
    groups = []
    for item in cfg.get("industries", []):
        if item.get("module") != module:
            continue
        live = industry_map.get(item["key"], {})
        groups.append({
            "key": item["key"],
            "name": item["name"],
            "accent": item["accent"],
            "module": module,
            "total": live.get("total", 0),
            "items": live.get("items", []),
        })
    return groups


def _watchlist_stock_feed(watch: list[dict]) -> list[dict]:
    items = []
    for item in watch[:8]:
        code, market = _split_ticker(item["ticker"])
        highlights: list[str] = []
        try:
            announcements = astock.announcements(code)[:2]
        except Exception:
            announcements = []
        try:
            news = astock.stock_news(code, limit=2)
        except Exception:
            news = []
        if announcements:
            highlights.append(f"公告：{announcements[0].get('title', '最新公告')}")
        if news:
            highlights.append(f"新闻：{news[0].get('新闻标题', '最新新闻')}")
        items.append({
            "ticker": item["ticker"],
            "name": item["name"],
            "group": item["group"],
            "highlights": highlights or [f"关注列表联动：{item['group']}"],
        })
    return items


def _flatten_group_items(groups: list[dict], limit_per_group: int = 3, total_limit: int = 10) -> list[dict]:
    rows = sorted(
        [
            {
                "industry_key": group.get("key", ""),
                "industry_name": group.get("name", ""),
                "title": item.get("zh") or item.get("title") or "暂无标题",
                "source": item.get("source", ""),
                "time": item.get("time", "—"),
                "url": item.get("url", ""),
                "summary": item.get("summary", ""),
                "ts": item.get("ts", 0),
            }
            for group in groups
            for item in group.get("items", [])[:limit_per_group]
        ],
        key=lambda item: item.get("ts", 0),
        reverse=True,
    )
    return rows[:total_limit]


def _event_probability_status(event_day: str | None) -> str:
    if not event_day:
        return "watching"
    try:
        days = (date.fromisoformat(event_day) - datetime.now().date()).days
    except ValueError:
        return "watching"
    if days <= 7:
        return "active"
    if days <= 30:
        return "watching"
    return "planned"


def _event_probability_assessment(category: str, status: str, text: str) -> tuple[str, str]:
    text = str(text or "")
    if category == "宏观窗口":
        if status == "active":
            return "高", "事件已进入近端交易窗口，市场预期最容易在这段时间被重新定价。"
        if status == "watching":
            return "中高", "事件进入重点观察区间，建议持续跟踪官方日历和预期差。"
        return "中", "事件仍在远期窗口，先保留观察位，等待时间逼近后再提高权重。"
    if category == "行业催化":
        if any(keyword in text for keyword in ("政策", "窗口", "催化", "验证", "销量", "订单")):
            return "中高", "行业层面已出现可验证催化线索，后续重点看数据和政策是否兑现。"
        return "中", "行业催化线索已出现，但还需要更多公开数据确认其持续性。"
    if category == "个股催化":
        if any(keyword in text for keyword in ("公告", "财报", "订单", "电话会")):
            return "中高", "公司层面已有公开催化信号，适合继续跟踪后续公告和基本面验证。"
        return "中", "公司层面已有边际变化线索，但仍需要更多公开验证。"
    return "中", "先保留观察位，等待更多公开信息确认。"


def _event_probability_trigger_window(status: str) -> str:
    if status == "active":
        return "近端窗口"
    if status == "watching":
        return "观察窗口"
    return "远期窗口"


def _event_probability_rank_score(category: str, status: str, probability_label: str) -> int:
    score = {"active": 90, "watching": 60, "planned": 30}.get(status, 30)
    score += {"高": 10, "中高": 7, "中": 4}.get(probability_label, 0)
    score += {"个股催化": 3, "行业催化": 2, "宏观窗口": 1}.get(category, 0)
    return score


def _event_probability_rank_breakdown(category: str, status: str, probability_label: str) -> dict:
    return {
        "status_score": {"active": 90, "watching": 60, "planned": 30}.get(status, 30),
        "probability_score": {"高": 10, "中高": 7, "中": 4}.get(probability_label, 0),
        "category_score": {"个股催化": 3, "行业催化": 2, "宏观窗口": 1}.get(category, 0),
    }


def _event_probability_rank_reason(category: str, status: str, probability_label: str) -> str:
    status_label = _event_probability_trigger_window(status)
    return f"因处于{status_label}、概率判断为{probability_label}，且属于{category}，所以优先级靠前。"


def _decorate_event_probability_item(item: dict) -> dict:
    category = str(item.get("category", ""))
    status = str(item.get("status", ""))
    probability_label = str(item.get("probability_label", ""))
    rank_score = _event_probability_rank_score(
        category,
        status,
        probability_label,
    )
    return {
        **item,
        "trigger_window": _event_probability_trigger_window(status),
        "rank_score": rank_score,
        "rank_breakdown": _event_probability_rank_breakdown(category, status, probability_label),
        "rank_reason": _event_probability_rank_reason(category, status, probability_label),
    }


def _macro_priority_events(limit: int = 4) -> list[dict]:
    events = []
    for item in knowledge.list_calendar_events(view="upcoming"):
        if item.get("category") != "macro":
            continue
        title = item.get("title", "").strip()
        if not title:
            continue
        event_day = item.get("date", "")
        source = item.get("source", "公开事件日历")
        notes = item.get("notes", "").strip()
        status = _event_probability_status(event_day)
        note = f"{event_day} · {source}" + (f" · {notes}" if notes else "")
        probability_label, judgment = _event_probability_assessment("宏观窗口", status, note)
        events.append(_decorate_event_probability_item({
            "key": item.get("id") or f"macro-{_safe_slug(title)}-{event_day}",
            "title": title,
            "category": "宏观窗口",
            "status": status,
            "note": note,
            "probability_label": probability_label,
            "judgment": judgment,
        }))
        if len(events) >= limit:
            break
    return events


def _stock_catalyst_priority_events(stock_watch_feed: list[dict], limit: int = 4) -> list[dict]:
    events = []
    for item in stock_watch_feed:
        highlights = [text for text in item.get("highlights", []) if text and not text.startswith("关注列表联动")]
        if not highlights:
            continue
        label = item.get("name") or item.get("ticker", "")
        group = item.get("group", "未分组")
        note = f"{group} · {'；'.join(highlights[:2])}"
        probability_label, judgment = _event_probability_assessment("个股催化", "active", note)
        events.append(_decorate_event_probability_item({
            "key": f"stock-catalyst-{_safe_slug(item.get('ticker', label))}",
            "title": f"{label} 催化跟踪",
            "category": "个股催化",
            "status": "active",
            "note": note,
            "probability_label": probability_label,
            "judgment": judgment,
        }))
        if len(events) >= limit:
            break
    return events


def _industry_catalyst_priority_events(stock_watch_feed: list[dict], sector_entries: list[dict], weekly_reviews: list[dict], limit: int = 3) -> list[dict]:
    groups = []
    seen = set()
    for item in stock_watch_feed:
        group = str(item.get("group", "")).strip()
        if group and group not in seen:
            seen.add(group)
            groups.append(group)
    events = []
    for group in groups:
        sources = []
        for entry in [*sector_entries, *weekly_reviews]:
            if group not in (entry.get("related_sectors") or []):
                continue
            full_entry = knowledge.get_entry(entry.get("id", "")) if entry.get("id") else None
            sources.append({
                "label": entry.get("title", group),
                "text": (full_entry or {}).get("content") or entry.get("content", "") or entry.get("content_preview", ""),
                "context": group,
            })
        points = _ranked_research_points(
            sources,
            ("催化", "验证", "订单", "销量", "财报", "电话会", "政策", "窗口"),
            limit=2,
            context=group,
        )
        if not points:
            continue
        note = f"{group} · {'；'.join(point['text'] for point in points[:2])}"
        probability_label, judgment = _event_probability_assessment("行业催化", "watching", note)
        events.append(_decorate_event_probability_item({
            "key": f"industry-catalyst-{_safe_slug(group)}",
            "title": f"{group} 行业催化跟踪",
            "category": "行业催化",
            "status": "watching",
            "note": note,
            "probability_label": probability_label,
            "judgment": judgment,
        }))
        if len(events) >= limit:
            break
    return events


def _event_probability_priority_events(stock_watch_feed: list[dict], sector_entries: list[dict], weekly_reviews: list[dict]) -> list[dict]:
    rows = _macro_priority_events()
    rows.extend(_industry_catalyst_priority_events(stock_watch_feed, sector_entries, weekly_reviews))
    rows.extend(_stock_catalyst_priority_events(stock_watch_feed))
    rows = sorted(rows, key=lambda item: (-int(item.get("rank_score", 0)), str(item.get("title", ""))))
    for index, item in enumerate(rows, start=1):
        item["rank_order"] = index
    return rows[:8]


def _event_probability_summary(priority_events: list[dict]) -> dict:
    macro_count = sum(1 for item in priority_events if item.get("category") == "宏观窗口")
    industry_count = sum(1 for item in priority_events if item.get("category") == "行业催化")
    stock_count = sum(1 for item in priority_events if item.get("category") == "个股催化")
    description = (
        f"当前已接入混合事件流：宏观窗口 {macro_count} 条、行业催化 {industry_count} 条、"
        f"个股催化 {stock_count} 条。后续在此基础上继续补主观概率与情景判断。"
    )
    return {
        "title": "事件概率体系入口",
        "description": description,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _event_probability_scenario_snapshot(priority_events: list[dict]) -> dict:
    active_events = [item for item in priority_events if item.get("status") == "active"]
    watching_events = [item for item in priority_events if item.get("status") == "watching"]
    macro_event = next((item for item in priority_events if item.get("category") == "宏观窗口"), None)
    stock_event = next((item for item in priority_events if item.get("category") == "个股催化"), None)
    industry_event = next((item for item in priority_events if item.get("category") == "行业催化"), None)
    base_signal = "、".join(item["category"] for item in priority_events[:3]) if priority_events else "暂无重点事件"
    return {
        "base_case": {
            "label": "基准情景",
            "summary": f"当前以 {base_signal} 的并行跟踪为主，先观察公开事件是否按预期推进。",
        },
        "upside_case": {
            "label": "上行情景",
            "summary": (
                f"若 {stock_event['title']} 或 {industry_event['title'] if industry_event else '行业催化'} 继续得到订单、销量或政策验证，"
                "市场预期有继续上修空间。"
            ) if stock_event else "若个股和行业催化继续被验证，可逐步上修相关判断。",
        },
        "downside_case": {
            "label": "下行情景",
            "summary": (
                f"若 {macro_event['title']} 临近前预期差走弱，或观察中的 {len(watching_events)} 条事件迟迟未兑现，"
                "需要降低对短期催化的权重。"
            ) if macro_event else "若关键事件迟迟未兑现，需要降低对短期催化的权重。",
        },
        "active_count": len(active_events),
        "watching_count": len(watching_events),
    }


def _event_probability_modules(priority_events: list[dict]) -> list[dict]:
    categories = {item.get("category") for item in priority_events}
    return [
        {
            "key": "macro-probability",
            "label": "宏观事件概率",
            "description": "承接政策窗口、会议节点和跨市场宏观事件的跟踪框架。",
            "status": "active" if "宏观窗口" in categories else "planned",
        },
        {
            "key": "industry-catalyst",
            "label": "行业催化事件",
            "description": "承接关键行业催化、供需拐点和政策催化的观察模板。",
            "status": "active" if "行业催化" in categories else "planned",
        },
        {
            "key": "scenario-dashboard",
            "label": "情景判断面板",
            "description": "承接后续自建情景树、主观概率和跟踪结论的可视化入口。",
            "status": "watching" if priority_events else "planned",
        },
    ]


def _event_probability_sources(priority_events: list[dict], sector_entries: list[dict], stock_watch_feed: list[dict]) -> list[dict]:
    categories = {item.get("category") for item in priority_events}
    macro_events = [item for item in priority_events if item.get("category") == "宏观窗口"]
    industry_events = [item for item in priority_events if item.get("category") == "行业催化"]
    stock_events = [item for item in priority_events if item.get("category") == "个股催化"]
    return [
        {
            "key": "macro-calendar-live",
            "label": "公开宏观事件日历",
            "provider": "calendar_auto_feed",
            "status": "active" if "宏观窗口" in categories else "planned",
            "note": "直接复用当前投资日历里的自动宏观窗口事件。",
            "coverage_count": len(macro_events),
            "latest_signal": macro_events[0]["title"] if macro_events else "",
        },
        {
            "key": "industry-catalyst-knowledge",
            "label": "行业催化知识条目",
            "provider": "knowledge_sector_entries",
            "status": "active" if sector_entries else "planned",
            "note": "复用行业卡片与周度复盘里的催化、验证、政策与销量线索。",
            "coverage_count": len(industry_events),
            "latest_signal": industry_events[0]["title"] if industry_events else "",
        },
        {
            "key": "stock-catalyst-watchlist",
            "label": "关注列表个股催化",
            "provider": "watchlist_news_and_filings",
            "status": "active" if stock_watch_feed else "planned",
            "note": "复用关注列表个股的公告与新闻高亮，形成公司层面的催化跟踪。",
            "coverage_count": len(stock_events),
            "latest_signal": stock_events[0]["title"] if stock_events else "",
        },
    ]


def get_research_hub() -> dict:
    radar = newsradar.get_radar(force=False)
    cfg = newsradar.load_sources_config()
    hiring = hiringradar.get_hiring_radar(force=False)
    tech_groups = _module_groups(radar, cfg, "tech")
    macro_groups = _module_groups(radar, cfg, "macro")
    industry_groups = _module_groups(radar, cfg, "industry")
    stock_groups = _module_groups(radar, cfg, "stock")
    geopolitics_groups = _module_groups(radar, cfg, "geopolitics")
    provider_status = data_adapters.provider_status()
    watch = _watch_stock_items()
    stock_watch_feed = _watchlist_stock_feed(watch)
    sector_entries = knowledge.list_entries(kind="sector_profile")
    weekly_reviews = knowledge.list_entries(kind="weekly_review")
    priority_events = _event_probability_priority_events(stock_watch_feed, sector_entries, weekly_reviews)
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "event_probability": {
            "summary": _event_probability_summary(priority_events),
            "scenario_snapshot": _event_probability_scenario_snapshot(priority_events),
            "planned_modules": _event_probability_modules(priority_events),
            "priority_events": priority_events,
            "source_interfaces": _event_probability_sources(priority_events, sector_entries, stock_watch_feed),
        },
        "fundamental": {
            "source_interfaces": {
                "industry_expert_notes": provider_status["industry_expert_notes"],
                "stock_expert_notes": provider_status["stock_expert_notes"],
            },
            "global_tech_headlines": _flatten_group_items(tech_groups),
            "macro_events": macro_groups,
            "industry_dynamics": industry_groups,
            "stock_topics": stock_groups,
            "stock_dynamics": stock_watch_feed,
            "geopolitics": {
                "title": "地缘政治",
                "groups": geopolitics_groups,
                "items": _flatten_group_items(geopolitics_groups, limit_per_group=2, total_limit=12),
            },
            "hiring_radar": hiring,
            "news_source_config": cfg,
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


def _decision_factor_node(
    node_id: str,
    label: str,
    node_type: str,
    *,
    description: str = "",
    parent_id: str = "",
    thesis_role: str = "验证项",
    judgment: str = "待确认",
    impact_on_thesis: str = "待观察",
    evidence_refs: list[str] | None = None,
    next_watchpoint: str = "",
    indicator_rows: list[dict[str, Any]] | None = None,
    sort_order: int = 0,
) -> dict[str, Any]:
    return {
        "node_id": node_id,
        "node_type": node_type,
        "label": label,
        "description": description,
        "parent_id": parent_id,
        "thesis_role": thesis_role,
        "judgment": judgment,
        "impact_on_thesis": impact_on_thesis,
        "evidence_refs": evidence_refs or [],
        "next_watchpoint": next_watchpoint,
        "indicator_rows": indicator_rows or [],
        "sort_order": sort_order,
    }


def _decision_indicator_row(
    label: str,
    current_value: str,
    conclusion: str,
    *,
    frequency: str = "",
    danger_line: str = "",
    safety_line: str = "",
    previous_value: str = "",
    trend: str = "",
    data_source: str = "",
) -> dict[str, str]:
    return {
        "label": label,
        "frequency": frequency,
        "danger_line": danger_line,
        "safety_line": safety_line,
        "current_value": current_value,
        "previous_value": previous_value,
        "trend": trend,
        "conclusion": conclusion,
        "data_source": data_source,
    }


def _decision_question(
    question: str,
    applies_to: str,
    priority: str,
    uncertainty_type: str,
    why_it_matters: str,
    validation_path: str,
    source_targets: list[str],
    due_window: str,
    status: str,
    resolution_impact: str,
) -> dict[str, Any]:
    return {
        "question": question,
        "applies_to": applies_to,
        "priority": priority,
        "uncertainty_type": uncertainty_type,
        "why_it_matters": why_it_matters,
        "validation_path": validation_path,
        "source_targets": source_targets,
        "due_window": due_window,
        "status": status,
        "resolution_impact": resolution_impact,
    }


def _apply_decision_question_state(payload: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    overrides = state.get("question_status", {})
    if not isinstance(overrides, dict):
        return payload
    for engine_key in ("strategy_engine", "sector_engine", "stock_engine"):
        engine = payload.get(engine_key)
        if not isinstance(engine, dict):
            continue
        for question in engine.get("open_questions", []) or []:
            key = _decision_question_key(str(question.get("applies_to") or ""), str(question.get("question") or ""))
            override = overrides.get(key)
            if not isinstance(override, dict):
                continue
            question["status"] = override.get("status") or question.get("status", "待验证")
            if override.get("resolution_impact"):
                question["resolution_impact"] = override["resolution_impact"]
    return payload


def _apply_framework_revision_state(payload: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    overrides = state.get("framework_revision_status", {})
    if not isinstance(overrides, dict):
        return payload
    for engine_key in ("sector_engine", "stock_engine"):
        engine = payload.get(engine_key)
        if not isinstance(engine, dict):
            continue
        for proposal in engine.get("framework_revision_queue", []) or []:
            proposal.setdefault("approval_state", "待审")
            proposal.setdefault("review_note", "")
            key = _framework_revision_key(engine_key, str(proposal.get("title") or ""))
            override = overrides.get(key)
            if not isinstance(override, dict):
                continue
            proposal["approval_state"] = override.get("approval_state") or proposal["approval_state"]
            proposal["review_note"] = override.get("review_note") or proposal["review_note"]
    return payload


def _decision_history(
    title: str,
    trigger: str,
    old_conclusion: str,
    new_conclusion: str,
    logic_change: str,
    applies_to: str,
) -> dict[str, str]:
    return {
        "title": title,
        "trigger": trigger,
        "old_conclusion": old_conclusion,
        "new_conclusion": new_conclusion,
        "logic_change": logic_change,
        "applies_to": applies_to,
        "changed_at": _utc_now_iso(),
        "approval_state": "live",
    }


def _group_watch_sectors(watch_stocks: list[dict[str, Any]], sector_entries: list[dict[str, Any]]) -> list[str]:
    rows: list[str] = []
    for item in watch_stocks:
        group = str(item.get("group") or "").strip()
        if group:
            rows.append(group)
    for entry in sector_entries:
        for sector in entry.get("related_sectors", []) or []:
            if sector:
                rows.append(str(sector).strip())
    deduped: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if row and row not in seen:
            deduped.append(row)
            seen.add(row)
    return deduped[:8]


def _strategy_layer(
    key: str,
    label: str,
    status: str,
    logic_state: str,
    summary: str,
    evidence: list[str],
    watchpoints: list[str],
    decision_implication: str,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "status": status,
        "logic_state": logic_state,
        "summary": summary,
        "evidence": evidence,
        "watchpoints": watchpoints,
        "decision_implication": decision_implication,
    }


def _strategy_institution_viewpoints(sectors: list[str]) -> list[dict[str, str]]:
    entries = []
    for kind in ("research_note", "attachment_link", "weekly_review", "memo"):
        entries.extend(knowledge.list_entries(kind=kind)[:8])
    viewpoints = []
    seen: set[str] = set()
    for entry in entries:
        title = str(entry.get("title") or "未命名观点")
        if title in seen:
            continue
        seen.add(title)
        related_sectors = entry.get("related_sectors") or []
        mapped_layer = "中观框架" if related_sectors else "宏观框架"
        text = " ".join([str(entry.get("summary_text") or ""), str(entry.get("content_preview") or ""), str(entry.get("content") or "")]).strip()
        stance = "偏多" if any(keyword in text for keyword in ("积极", "增长", "上修", "改善", "受益")) else "待确认"
        entry_url = str(entry.get("url") or entry.get("source_url") or "")
        if not entry_url and entry.get("id"):
            entry_url = f"/framework?source={entry.get('id')}"
        viewpoints.append({
            "source": str(entry.get("type") or "knowledge"),
            "title": title,
            "stance": stance,
            "mapped_layer": mapped_layer,
            "summary": (str(entry.get("summary_text") or entry.get("content_preview") or entry.get("content") or "观点待补充")[:140]),
            "evidence_date": str(entry.get("date") or ""),
            "url": entry_url,
        })
        if len(viewpoints) >= 5:
            break
    if viewpoints:
        return viewpoints
    return [{
        "source": "institution_ingest_placeholder",
        "title": "主流机构观点待接入",
        "stance": "待确认",
        "mapped_layer": "宏观框架",
        "summary": "后续每日爬取券商策略、海外投行、行业研报和宏观数据库更新，并映射到宏观/中观/微观框架节点。",
        "evidence_date": _utc_now_iso()[:10],
        "url": "https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/guide-to-the-markets/",
    }]


def _strategy_framework_sources() -> list[dict[str, str]]:
    return [
        {
            "source_type": "user_fed",
            "institution": "用户投喂框架",
            "framework": "吸收你提供的投资哲学、研究规范、图片、笔记和后续手动标注的优秀框架。",
            "logic": "把用户认可的框架沉淀为高优先级规则，先审后生效，并用于校准机构框架的适用性。",
            "information_inputs": ["用户PDF", "图片/思维导图", "手动标签", "复盘修正"],
            "url": "",
        },
        {
            "source_type": "institution_extracted",
            "institution": "BlackRock Investment Institute",
            "framework": "市场新范式、AI abundance/scarcity、利率中枢、组合再思考",
            "logic": "先判断宏观 regime 和长期资本约束，再寻找被新范式强化的稀缺资产与产业链。",
            "information_inputs": ["全球增长", "通胀和利率", "AI资本开支", "能源和资源约束"],
            "url": "https://www.blackrock.com/corporate/insights/blackrock-investment-institute/publications/outlook",
        },
        {
            "source_type": "institution_extracted",
            "institution": "J.P. Morgan Asset Management",
            "framework": "Guide to the Markets：宏观、利率、盈利、估值、风格和资产配置图谱",
            "logic": "用宏观、盈利、估值、资金和风格图谱做交叉验证，避免单一叙事驱动配置。",
            "information_inputs": ["PMI/就业/通胀", "利率", "盈利预期", "估值分位", "风格表现"],
            "url": "https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/guide-to-the-markets/",
        },
        {
            "source_type": "institution_extracted",
            "institution": "Goldman Sachs Asset Management",
            "framework": "宏观复杂性、央行政策、贸易秩序、AI与组合再平衡",
            "logic": "在政策、贸易和技术变化中识别确定性增长与组合再平衡方向。",
            "information_inputs": ["央行政策", "贸易秩序", "AI扩散", "盈利修正", "资产相关性"],
            "url": "https://am.gs.com/cms-assets/gsam-app/documents/insights/en/2025/Investment-Outlook-2026.pdf?view=true",
        },
        {
            "source_type": "institution_extracted",
            "institution": "Morgan Stanley Research",
            "framework": "Tech Diffusion、Future of Energy、Multipolar World、Societal Shifts",
            "logic": "用跨年度主题识别产业扩散阶段，再映射到行业景气和资产价格。",
            "information_inputs": ["科技扩散", "能源需求", "地缘格局", "人口和消费结构"],
            "url": "https://www.morganstanley.com/insights/articles/investment-outlook-shaping-markets-2026",
        },
        {
            "source_type": "institution_extracted",
            "institution": "中信证券策略",
            "framework": "全球需求视角、低波市、制造业定价权、出海、AI商业化",
            "logic": "从全球需求和中国企业出海竞争力重估A股盈利天花板，寻找低波慢牛中的结构主线。",
            "information_inputs": ["全球营收敞口", "出海订单", "利润率", "AI商业化", "低波市特征"],
            "url": "https://www.cls.cn/detail/2196689",
        },
        {
            "source_type": "analyst_tracked",
            "institution": "招商证券策略框架",
            "framework": "张夏团队：主线识别、宏观时代主题、中观结构转型、微观产业趋势与渗透率S曲线",
            "logic": "从时代主题到产业趋势，再用渗透率S曲线和景气验证判断主线持续性。",
            "information_inputs": ["时代主题", "产业渗透率", "景气指标", "政策催化", "估值阶段"],
            "url": "https://wallstreetcn.com/articles/3773831",
        },
        {
            "source_type": "analyst_tracked",
            "institution": "国金证券牟一凌",
            "framework": "定期策略跟踪：宏观环境、资产定价、产业趋势、风格轮动和风险补偿。",
            "logic": "跟踪宏观和资产定价变化，寻找风格轮动中的高赔率结构机会。",
            "information_inputs": ["宏观数据", "利率和信用", "资金流", "估值和风险溢价", "行业景气"],
            "url": "https://www.gjzq.com.cn/",
        },
    ]


def _strategy_sector_opportunity_map(preferred_directions: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "sector": "AI应用/算力/半导体",
            "stance": "看多",
            "x": 82,
            "y": 78,
            "heat": 92,
            "framework_driver": "技术扩散 + AI商业化 + 产业趋势渗透率",
            "why": "海外和国内主流策略都把AI扩散/商业化作为跨年度主线，需用订单、Capex、盈利兑现继续验证。",
            "source_refs": ["BlackRock", "Morgan Stanley", "Goldman Sachs", "中信证券", "招商证券"],
        },
        {
            "sector": "电力设备/能源基础设施",
            "stance": "看多",
            "x": 72,
            "y": 70,
            "heat": 84,
            "framework_driver": "AI电力约束 + 能源转型 + 稀缺资源",
            "why": "AI和再工业化提高电力、能源和基础设施约束的重要性，适合作为中观景气和资本开支主线。",
            "source_refs": ["BlackRock", "Morgan Stanley"],
        },
        {
            "sector": "高端制造/出海链",
            "stance": "看多",
            "x": 78,
            "y": 62,
            "heat": 80,
            "framework_driver": "全球需求重估 + 中国制造竞争力 + 利润天花板抬升",
            "why": "国内策略强调A股基本面要从全球营收敞口和出海竞争力重新定价，不应只看本土需求。",
            "source_refs": ["中信证券", "国泰海通"],
        },
        {
            "sector": "资源品/传统制造提质",
            "stance": "关注",
            "x": 58,
            "y": 58,
            "heat": 64,
            "framework_driver": "定价权 + 供给约束 + 稀缺性",
            "why": "资源和传统制造若能把份额优势转化为定价权和利润率，需要纳入全市场机会池。",
            "source_refs": ["中信证券", "BlackRock"],
        },
        {
            "sector": "大金融/券商",
            "stance": "关注",
            "x": 54,
            "y": 50,
            "heat": 58,
            "framework_driver": "资本市场改革 + 风险偏好 + 交易活跃度",
            "why": "若市场进入低波慢牛或转型牛，金融和券商可能受益于交易活跃、资本市场改革和权益中枢上移。",
            "source_refs": ["国泰海通", "中信建投观点汇总"],
        },
        {
            "sector": "创新药/医疗科技",
            "stance": "观察",
            "x": 44,
            "y": 66,
            "heat": 52,
            "framework_driver": "Societal Shifts + 产业创新 + 出海",
            "why": "适合作为技术和社会结构变化的卫星方向，但需要管线、出海授权和商业化数据验证。",
            "source_refs": ["Morgan Stanley", "国泰海通"],
        },
        {
            "sector": "当前关注池映射",
            "stance": "组合校验",
            "x": 62,
            "y": 42,
            "heat": 48,
            "framework_driver": "把你的持仓/关注放到全市场框架里验顺逆风",
            "why": f"当前关注行业仅作为映射层：{('、'.join(preferred_directions[:3]) or '待映射')}，不作为策略框架本身的来源。",
            "source_refs": ["portfolio_alignment"],
        },
    ]


def _strategy_engine_payload(hub: dict[str, Any], watch_stocks: list[dict[str, Any]], holdings: list[dict[str, Any]], sectors: list[str]) -> dict[str, Any]:
    macro_count = sum(len(group.get("items", [])) for group in hub["fundamental"]["macro_events"])
    tech_count = len(hub["fundamental"]["global_tech_headlines"])
    event_rows = hub["event_probability"]["priority_events"]
    active_events = [item for item in event_rows if item.get("status") == "active"]
    overall_wind = "中性偏多" if active_events else "中性"
    preferred_directions = sectors[:3] or ["高景气行业", "政策受益方向"]
    avoid_directions = ["高估值脆弱方向", "验证不足的短线叙事"]
    tailwind_positions = [f"{item.get('name')}({item.get('ticker')})" for item in watch_stocks if item.get("group") in preferred_directions][:6]
    holding_codes = {str(item.get("code") or "") for item in holdings}
    headwind_positions = [
        f"{item.get('name')}({item.get('ticker')})"
        for item in watch_stocks
        if item.get("group") not in preferred_directions and str(item.get("ticker", "")).split(".")[0] in holding_codes
    ][:6]
    factor_tree = [
        _decision_factor_node(
            "strategy-root",
            "策略框架",
            "pillar",
            description="信息驱动预期，预期驱动估值，估值驱动供求，供求驱动股价。",
            thesis_role="核心驱动",
            judgment=overall_wind,
            impact_on_thesis="支持",
            next_watchpoint="继续跟踪宏观窗口、流动性边际和风格拥挤度。",
            sort_order=0,
        ),
        _decision_factor_node(
            "strategy-macro",
            "宏观与政策预期",
            "factor",
            parent_id="strategy-root",
            thesis_role="核心驱动",
            judgment="中性",
            impact_on_thesis="待观察",
            evidence_refs=["Intel/宏观事件", "Database/中国宏观数据库"],
            next_watchpoint="关注下一批宏观数据和政策表述。",
            indicator_rows=[
                _decision_indicator_row("宏观事件条数", str(macro_count), "有持续跟踪", frequency="日度", data_source="research_hub"),
                _decision_indicator_row("事件概率活跃事件", str(len(active_events)), "活跃事件越多越需重算", frequency="日度", data_source="event_probability"),
            ],
            sort_order=1,
        ),
        _decision_factor_node(
            "strategy-liquidity",
            "流动性与风险偏好",
            "factor",
            parent_id="strategy-root",
            thesis_role="核心驱动",
            judgment="中性偏多" if tech_count >= 1 else "中性",
            impact_on_thesis="支持",
            evidence_refs=["Intel/流动性", "DailyReview/大盘复盘"],
            next_watchpoint="继续跟踪全球利率中枢和风格拥挤。",
            indicator_rows=[
                _decision_indicator_row("科技头条数量", str(tech_count), "风险偏好仍在", frequency="日度", data_source="newsradar"),
                _decision_indicator_row("重点行业数量", str(len(preferred_directions)), "有结构性主线", frequency="日度", data_source="framework"),
            ],
            sort_order=2,
        ),
    ]
    strategy_framework = [
        _strategy_layer(
            "macro",
            "宏观框架",
            "中性",
            "待确认",
            "增长、通胀、政策与海外利率共同决定组合风险预算。",
            [f"宏观事件 {macro_count} 条", f"活跃事件概率 {len(active_events)} 个"],
            ["下一批宏观数据", "政策会议和海外利率窗口"],
            "宏观未明显转弱前，策略层可维持结构性进攻，但避免总仓位过度激进。",
        ),
        _strategy_layer(
            "meso",
            "中观框架",
            "中性偏多" if preferred_directions else "待确认",
            "强化" if preferred_directions else "待确认",
            "行业景气、产业趋势和政策方向决定当前可重点跟踪的主线。",
            preferred_directions or ["重点行业仍待筛选"],
            ["行业数据、研报框架、产业链订单与价格变化"],
            f"优先把研究资源放在 {('、'.join(preferred_directions) or '高景气主线')}，并持续和个股层联动。",
        ),
        _strategy_layer(
            "micro",
            "微观框架",
            "待确认",
            "待确认",
            "公司订单、盈利、管理层和估值兑现决定行业逻辑能否落到持仓收益。",
            tailwind_positions or ["持仓顺风证据仍待补强"],
            ["持仓公司跟踪点评", "公告、财报、调研和盈利预期变化"],
            "个股动作必须继承行业判断，同时用公司自身数据验证是否存在强阿尔法或证伪。",
        ),
        _strategy_layer(
            "liquidity_valuation",
            "资金与估值框架",
            "中性偏热" if tech_count >= 1 else "中性",
            "部分强化",
            "流动性、风险偏好、估值分位和交易拥挤度决定胜率之外的赔率。",
            [f"科技头条 {tech_count} 条", "估值和拥挤度需要继续接入高频数据"],
            ["成交额、风格拥挤、外资和卖方预期变化"],
            "若资金温度继续升高但基本面证据不足，应提高止盈和验证要求。",
        ),
    ]
    recommendation_matrix = {
        "increase": preferred_directions[:3] or ["已有证据强化的行业"],
        "reduce": avoid_directions,
        "observe": ["宏观变量切换", "风格拥挤度", "行业到个股的传导强度"],
        "do_not_buy": ["只有主题叙事、缺少因子验证的方向"],
    }
    sector_opportunity_map = _strategy_sector_opportunity_map(preferred_directions)
    bullish_sectors = [item["sector"] for item in sector_opportunity_map if item["stance"] == "看多"][:3]
    current_strategy_view = {
        "framework_basis": "source_backed_full_market",
        "market_style": "成长占优但需防拥挤" if tech_count >= 1 else "均衡偏结构",
        "bullish_sectors": bullish_sectors,
        "why": [
            "主流机构框架共同指向：AI扩散/商业化、能源与电力约束、全球制造竞争力是当前全市场优先主线。",
            f"宏观层活跃事件 {len(active_events)} 个，尚未触发明显防守切换。",
            "资金与估值层提示风险偏好仍在，但高估值方向必须用行业和个股因子继续验证，不能只买主题。",
        ],
        "positioning_advice": "围绕顺风行业做组合倾斜，但不追只有主题、缺少因子验证的方向。",
    }
    return {
        "summary": {
            "title": "策略引擎",
            "one_line_view": f"当前策略层判断为{overall_wind}，优先围绕 {('、'.join(preferred_directions) or '重点主线')} 做配置，避免验证不足的高估值叙事。",
            "updated_at": _utc_now_iso(),
        },
        "market_temperature": {
            "macro_judgment": "中性",
            "index_judgment": "中性偏多",
            "style_judgment": "成长占优但需防拥挤",
            "overall_wind": overall_wind,
        },
        "factor_tree": factor_tree,
        "current_strategy_view": current_strategy_view,
        "framework_sources": _strategy_framework_sources(),
        "sector_opportunity_map": sector_opportunity_map,
        "strategy_framework": strategy_framework,
        "institution_viewpoints": _strategy_institution_viewpoints(sectors),
        "daily_iteration": {
            "refresh_cadence": "每日盘前/盘后更新",
            "source_scope": ["券商策略报告", "海外投行观点", "行业研报", "宏观数据库", "DailyReview", "Intel"],
            "mapping_rule": "新信息先映射到宏观/中观/微观/资金估值框架，再判断强化、削弱、证伪或推翻。",
            "next_refresh": "下一次资讯刷新后自动重算策略框架。",
        },
        "recommendation_matrix": recommendation_matrix,
        "allocation_view": {
            "should_focus": f"优先聚焦 {('、'.join(preferred_directions) or '已跟踪主线')}",
            "should_avoid": "避免只靠短期情绪驱动、缺少中长期验证的方向。",
            "preferred_directions": preferred_directions,
            "avoid_directions": avoid_directions,
        },
        "portfolio_alignment": {
            "is_tailwind": bool(tailwind_positions),
            "alignment_summary": "当前持仓和关注池已有部分顺风方向，但仍需靠行业和个股层继续验证。",
            "tailwind_positions": tailwind_positions,
            "headwind_positions": headwind_positions,
        },
        "risks": [
            "若宏观预期转弱但市场仍高估值，策略层需要快速下修。",
            "若风格过度拥挤，行业与个股层要把交易风险和逻辑风险拆开看。",
        ],
        "next_watchpoints": [
            "下一批宏观数据和政策窗口",
            "流动性与风险偏好的边际变化",
        ],
        "open_questions": [
            _decision_question(
                "当前最重要的宏观变量究竟是增长预期还是流动性预期？",
                "strategy",
                "高",
                "市场分歧",
                "会影响策略层对高估值主线的容忍度。",
                "继续跟踪宏观数据、政策表述和市场风格反馈。",
                ["中国宏观数据库", "宏观策略框架", "DailyReview"],
                "未来1-2周",
                "待验证",
                "可能导致策略层从中性偏多转为均衡或防守。",
            ),
        ],
        "history": [
            _decision_history("策略层初始判断", "V1 驾驶舱首次生成", "待形成", overall_wind, "建立初始框架", "strategy"),
        ],
    }


def _sector_card_payload(sector: str) -> dict[str, Any]:
    indicators = knowledge.list_sector_indicators(sector=sector).get("items", [])
    modules = knowledge.list_sector_modules(sector=sector).get("items", [])
    entries = knowledge.list_entries(sector=sector)
    factor_tree = [
        _decision_factor_node(
            f"{sector}-root",
            f"{sector}框架",
            "pillar",
            description="行业判断由框架树持续驱动，需求决定方向，供给决定弹性。",
            thesis_role="核心驱动",
            judgment="中性偏多" if entries else "待确认",
            impact_on_thesis="支持" if entries else "待观察",
            next_watchpoint="继续补关键景气、供需、价格和政策验证。",
            sort_order=0,
        ),
        _decision_factor_node(
            f"{sector}-commodity",
            "商品/产业属性",
            "factor",
            parent_id=f"{sector}-root",
            thesis_role="核心驱动",
            judgment="中性偏多" if indicators else "待确认",
            impact_on_thesis="支持" if indicators else "待观察",
            evidence_refs=[item.get("name", "") for item in indicators[:3]],
            next_watchpoint="跟踪需求方向、供给弹性和库存变化。",
            indicator_rows=[
                _decision_indicator_row(
                    item.get("name", "未命名指标"),
                    item.get("viewpoint", "待更新")[:24] or "待更新",
                    "已纳入跟踪",
                    frequency=item.get("freq", ""),
                    data_source=item.get("data_source", ""),
                )
                for item in indicators[:3]
            ],
            sort_order=1,
        ),
        _decision_factor_node(
            f"{sector}-policy",
            "政策/交易结构",
            "factor",
            parent_id=f"{sector}-root",
            thesis_role="风险约束",
            judgment="待观察",
            impact_on_thesis="待观察",
            evidence_refs=[item.get("title", "") for item in entries[:2]],
            next_watchpoint="跟踪政策表述、市场拥挤和关键催化验证。",
            indicator_rows=[
                _decision_indicator_row("框架模块数", str(len(modules)), "框架可继续补强", frequency="不定期", data_source="framework"),
                _decision_indicator_row("相关条目数", str(len(entries)), "已有基础沉淀", frequency="不定期", data_source="knowledge"),
            ],
            sort_order=2,
        ),
    ]
    action = "focus" if indicators or entries else "watch"
    return {
        "sector": sector,
        "one_line_judgment": f"{sector} 当前处于{ '持续跟踪并等待更多验证' if action == 'watch' else '可继续跟踪并择优配置' }阶段。",
        "action": action,
        "confidence": "中" if action == "focus" else "中低",
        "key_factor_changes": [item.get("name", "") for item in indicators[:3]] or ["行业框架待继续补强"],
        "supporting_signals": [item.get("title", "") for item in entries[:2]] or ["已有行业沉淀条目"],
        "risk_signals": ["若核心景气指标缺失，行业判断只能保持中等置信度。"] if not indicators else ["继续验证需求方向和供给弹性是否同步。"],
        "scenario_base": f"{sector} 基准情景下维持当前景气判断，等待关键指标进一步确认。",
        "scenario_upside": f"{sector} 若需求与订单同步改善，行业逻辑可从跟踪升级为更积极配置。",
        "scenario_downside": f"{sector} 若关键指标走弱或政策扰动增强，行业动作应快速降为观察。",
        "last_material_change_at": _utc_now_iso(),
        "factor_tree": factor_tree,
    }


def _sector_engine_payload(hub: dict[str, Any], watch_stocks: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    sector_entries = knowledge.list_entries(kind="sector_profile")
    sectors = _group_watch_sectors(watch_stocks, sector_entries) or ["重点行业"]
    sector_cards = [_sector_card_payload(sector) for sector in sectors]
    sector_state_map = {
        item["sector"]: {
            "sector": item["sector"],
            "action": item["action"],
            "judgment": item["one_line_judgment"],
            "confidence": item["confidence"],
        }
        for item in sector_cards
    }
    factor_tree = []
    for card in sector_cards:
        factor_tree.extend(card["factor_tree"])
    alerts = [
        {
            "title": f"{card['sector']} 仍有关键验证缺口",
            "severity": "medium",
            "logic_change": "框架未完成",
            "next_action": "继续补行业指标、模块和周度验证。",
        }
        for card in sector_cards[:2]
    ]
    payload = {
        "summary": {
            "title": "行业引擎",
            "one_line_view": f"当前重点行业先围绕 {('、'.join(sectors[:3]))} 展开，行业动作先以框架验证和景气确认优先。",
            "updated_at": _utc_now_iso(),
        },
        "sector_cards": sector_cards,
        "factor_tree": factor_tree,
        "alerts": alerts,
        "sector_state_map": sector_state_map,
        "framework_draft": {
            "source": "institution_generated",
            "title": "行业框架草稿",
            "summary": "系统会结合主流机构框架和你的投喂内容，持续生成行业框架草稿。",
            "updated_at": _utc_now_iso(),
        },
        "framework_revision_queue": [
            {
                "title": f"{sectors[0]} 框架待补强",
                "reason": "当前仍缺更多供需、价格和政策验证。",
                "updated_at": _utc_now_iso(),
                "approval_state": "待审",
                "review_note": "",
            },
        ],
        "open_questions": [
            _decision_question(
                f"{sectors[0]} 的核心景气变量究竟是需求方向还是供给弹性？",
                f"sector:{sectors[0]}",
                "高",
                "框架缺口",
                "会直接影响行业动作是继续 focus 还是降回 watch。",
                "补充行业指标、研报框架和周度跟踪评论。",
                ["行业中心/跟踪指标", "行业框架草稿", "周度复盘"],
                "未来1-2周",
                "待验证",
                "可能推动行业框架修订和个股层整体重算。",
            ),
        ],
        "history": [
            _decision_history("行业层初始判断", "V1 驾驶舱首次生成", "待形成", "行业框架已初始化", "建立初始框架", "sector"),
        ],
    }
    return payload, sector_state_map


def _stock_engine_payload(
    watch_stocks: list[dict[str, Any]],
    holdings: list[dict[str, Any]],
    sector_state_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    holding_map = {str(item.get("code") or ""): item for item in holdings}
    tracked: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in watch_stocks:
        ticker = str(item.get("ticker") or "")
        if ticker and ticker not in seen:
            tracked.append({
                "ticker": ticker,
                "name": str(item.get("name") or ticker),
                "sector": str(item.get("group") or "未分组"),
            })
            seen.add(ticker)
    for code, row in holding_map.items():
        ticker = next((item["ticker"] for item in tracked if item["ticker"].split(".")[0] == code), "")
        if ticker:
            continue
        tracked.append({
            "ticker": f"{code}.SZ",
            "name": str(row.get("name") or code),
            "sector": "未分组",
        })
    decision_cards = []
    for item in tracked[:12]:
        ticker = item["ticker"]
        sector = item["sector"]
        sector_state = sector_state_map.get(sector, {"sector": sector, "action": "watch", "judgment": "行业信息仍待补强", "confidence": "中低"})
        comments = knowledge.list_entries(kind="tracking_comment", stock=ticker)
        modules = knowledge.list_stock_modules(ticker=ticker).get("items", [])
        in_portfolio = ticker.split(".")[0] in holding_map
        sector_action = sector_state["action"]
        has_company_signal = bool(comments or modules)
        if sector_action == "focus" and has_company_signal:
            action = "hold" if in_portfolio else "buy"
            confidence = "中高"
            logic_state = "强化"
        elif sector_action == "avoid":
            action = "sell" if in_portfolio else "watch"
            confidence = "中"
            logic_state = "削弱"
        else:
            action = "hold" if in_portfolio else "watch"
            confidence = "中"
            logic_state = "待确认"
        decision_cards.append({
            "ticker": ticker,
            "name": item["name"],
            "sector": sector,
            "one_line_judgment": f"{item['name']} 当前先按{action}处理，核心取决于行业顺逆风与公司跟踪信号是否共振。",
            "action": action,
            "confidence": confidence,
            "logic_state": logic_state,
            "industry_context": {
                "sector": sector,
                "action": sector_state["action"],
                "judgment": sector_state["judgment"],
                "transmission": "行业变化已纳入个股判断链路。",
            },
            "company_context": {
                "ticker": ticker,
                "has_tracking_comment": bool(comments),
                "has_custom_modules": bool(modules),
                "latest_comment": comments[0]["title"] if comments else "暂无最新跟踪点评",
            },
            "factor_changes": [comment["title"] for comment in comments[:2]] or [module.get("title", "") for module in modules[:2]] or ["公司层跟踪信号仍待补强"],
            "next_watchpoints": [
                "跟踪行业变化是否继续传导到公司",
                "补强订单、价格、盈利或管理层验证",
            ],
            "last_material_change_at": _utc_now_iso(),
        })
    alerts = [
        {
            "title": f"{card['name']} 需要继续验证行业与公司逻辑是否同向",
            "severity": "medium",
            "logic_change": card["logic_state"],
            "next_action": "优先补跟踪点评和个股模块。",
        }
        for card in decision_cards[:2]
    ]
    return {
        "summary": {
            "title": "个股引擎",
            "one_line_view": "个股层只对现有持仓和自选股给动作建议，并显式继承行业层变化。",
            "updated_at": _utc_now_iso(),
        },
        "decision_cards": decision_cards,
        "alerts": alerts,
        "framework_draft": {
            "source": "institution_generated",
            "title": "个股框架草稿",
            "summary": "系统会结合主流机构框架、个股中心与用户投喂内容，持续生成个股框架草稿。",
            "updated_at": _utc_now_iso(),
        },
        "framework_revision_queue": [
            {
                "title": "个股层待补行业传导验证",
                "reason": "需要继续确认行业变化是否真实传导到个股盈利和估值。",
                "updated_at": _utc_now_iso(),
                "approval_state": "待审",
                "review_note": "",
            },
        ],
        "open_questions": [
            _decision_question(
                "当前个股判断里，哪些变化来自行业顺逆风，哪些变化来自公司自身？",
                "stock",
                "高",
                "逻辑冲突",
                "会直接影响买卖不动建议的置信度。",
                "继续补跟踪点评、订单验证、盈利和估值拆解。",
                ["个股中心/跟踪点评", "个股中心/自定义模块", "周度复盘"],
                "未来1周",
                "待验证",
                "可能导致个股动作从 watch/hold 切换为 buy/sell。",
            ),
        ],
        "history": [
            _decision_history("个股层初始判断", "V1 驾驶舱首次生成", "待形成", "个股动作队列已初始化", "建立初始框架", "stock"),
        ],
    }


def get_decision_cockpit() -> dict[str, Any]:
    import portfolio as pf

    hub = get_research_hub()
    watch_stocks = _watch_stock_items()
    holdings = pf.get_portfolio().get("holdings", [])
    sectors = _group_watch_sectors(watch_stocks, knowledge.list_entries(kind="sector_profile"))
    strategy_engine = _strategy_engine_payload(hub, watch_stocks, holdings, sectors)
    sector_engine, sector_state_map = _sector_engine_payload(hub, watch_stocks)
    stock_engine = _stock_engine_payload(watch_stocks, holdings, sector_state_map)
    payload = {
        "summary": {
            "title": "今日决策总览",
            "one_line_view": "把新信息持续映射到策略、行业和个股逻辑上，优先减少漏看和旧逻辑失效后的反应迟缓。",
            "updated_at": _utc_now_iso(),
        },
        "strategy_engine": strategy_engine,
        "sector_engine": sector_engine,
        "stock_engine": stock_engine,
    }
    state = _load_decision_cockpit_state()
    payload = _apply_decision_question_state(payload, state)
    return _apply_framework_revision_state(payload, state)


def _intel_kind_label(kind: str) -> str:
    if kind == "tech":
        return "全球科技头条"
    if kind == "macro":
        return "宏观事件"
    if kind == "industry":
        return "行业动态"
    if kind == "stock":
        return "个股动态"
    if kind == "geopolitics":
        return "地缘政治"
    if kind == "hiring":
        return "招聘雷达"
    raise ValueError("kind 仅支持 tech、macro、industry、stock、geopolitics 或 hiring")


def generate_intel_digest(kind: str) -> dict:
    label = _intel_kind_label(kind)
    hub = get_research_hub()
    if kind == "tech":
        rows = [
            f"{item.get('industry_name')}：{item.get('summary') or item.get('title') or '暂无摘要'}"
            for item in hub["fundamental"]["global_tech_headlines"][:8]
        ]
        summary = "\n".join(rows) or "暂无全球科技头条，等待投研资讯更新。"
    elif kind == "macro":
        rows = []
        for item in hub["fundamental"]["macro_events"]:
            for row in item.get("items", [])[:2]:
                rows.append(f"{row.get('source', '公开源')}：{row.get('zh') or row.get('title') or '暂无摘要'}")
        summary = "\n".join(rows) or "暂无宏观事件，等待投研资讯更新。"
    elif kind == "industry":
        rows = []
        for item in hub["fundamental"]["industry_dynamics"][:6]:
            first = item.get("items", [{}])[0] if item.get("items") else {}
            rows.append(f"{item.get('name')}：{first.get('zh') or first.get('title') or '暂无摘要'}")
        summary = "\n".join(rows) or "暂无行业动态，等待投研资讯更新。"
    elif kind == "stock":
        rows = [
            f"{item['name']}({item['ticker']})：{'；'.join(item.get('highlights', []))}"
            for item in hub["fundamental"]["stock_dynamics"][:8]
        ]
        for item in hub["fundamental"].get("stock_topics", [])[:4]:
            first = item.get("items", [{}])[0] if item.get("items") else {}
            rows.append(f"{item.get('name')}：{first.get('zh') or first.get('title') or '暂无摘要'}")
        summary = "\n".join(rows) or "暂无个股动态，请先维护关注列表。"
    elif kind == "hiring":
        rows = [
            f"{item.get('company', '未知公司')}：{item.get('title', '未命名岗位')}（{item.get('location', '未知地点')}）"
            for item in hub["fundamental"]["hiring_radar"].get("items", [])[:8]
        ]
        summary = "\n".join(rows) or "暂无招聘信号，稍后重试。"
    else:
        rows = [
            f"{item.get('industry_name') or item.get('title')}：{item.get('summary') or item.get('title') or '暂无摘要'}"
            for item in hub["fundamental"]["geopolitics"].get("items", [])[:8]
        ]
        summary = "\n".join(rows) or "暂无地缘政治事件，等待投研资讯更新。"
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
