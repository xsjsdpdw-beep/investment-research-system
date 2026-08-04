"""数据源适配层：统一声明公开源 / iFind 的数据集能力与回退策略。

页面侧只依赖本模块，不直接感知东财、iFind 或后续 AlphaEngine 等来源。
一期策略是 iFind-first：iFind 可用时优先使用；未安装 SDK/未配置 endpoint 时，
自动回退到当前公开源，保证日常工作台不断档。
"""

from __future__ import annotations

import importlib
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any

import astock

TRUE_VALUES = {"1", "true", "yes", "on"}
IFIND_SDK_CANDIDATES = ("iFinDPy", "ifind", "iFind", "THS_iFinD")
BEIJING = timezone(timedelta(hours=8))
_AUTO_CALENDAR_CACHE: dict[str, Any] = {"key": "", "events": [], "ts": 0.0}


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in TRUE_VALUES


def _ifind_token() -> str:
    return (
        os.environ.get("VR_IFIND_TOKEN", "").strip()
        or os.environ.get("IFIND_AUTH_TOKEN", "").strip()
        or os.environ.get("IFIND_TOKEN", "").strip()
        or os.environ.get("IFIND_API_KEY", "").strip()
    )


def _detect_ifind_sdk() -> str:
    for name in IFIND_SDK_CANDIDATES:
        try:
            importlib.import_module(name)
            return name
        except Exception:
            continue
    return ""


def ifind_status() -> dict[str, Any]:
    """返回 iFind 本地接入状态，不泄露 token 原文。"""

    token = _ifind_token()
    dsn = (
        os.environ.get("VR_IFIND_DSN", "").strip()
        or os.environ.get("VR_IFIND_FUND_DSN", "").strip()
    )
    mode = os.environ.get("VR_IFIND_MODE", "auto").strip() or "auto"
    sdk_module = _detect_ifind_sdk()
    enabled = _env_flag("VR_IFIND_ENABLED", bool(token or dsn or sdk_module))
    ready = enabled and bool(sdk_module or dsn)
    if not enabled:
        reason = "未开启：设置 VR_IFIND_ENABLED=1 后启用。"
    elif ready:
        reason = "已启用：数据层会优先尝试 iFind，失败时自动回退。"
    else:
        reason = "已开启但未就绪：未检测到 iFind SDK 或 VR_IFIND_DSN。"
    return {
        "enabled": enabled,
        "ready": ready,
        "mode": mode,
        "sdk_module": sdk_module,
        "has_token": bool(token),
        "has_dsn": bool(dsn),
        "reason": reason,
    }


def _parse_sw_industry(text: str) -> dict[str, str]:
    if not text:
        return {}
    match = re.search(r"所属申万行业[:：\s]*([^\n\r|]+)", text)
    if not match:
        match = re.search(r"申万行业[:：\s]*([^\n\r|]+)", text)
    if not match:
        return {}
    parts = [item.strip() for item in re.split(r"--|>|/|，|,", match.group(1)) if item.strip()]
    if not parts:
        return {}
    sw_l1 = parts[0] if len(parts) >= 1 else ""
    sw_l2 = parts[1] if len(parts) >= 2 else ""
    sw_l3 = parts[2] if len(parts) >= 3 else ""
    return {
        "industry": "--".join(parts),
        "sw_l1": sw_l1,
        "sw_l2": sw_l2,
        "sw_l3": sw_l3,
        "source": "ifind",
    }


def _stringify_result(result: Any) -> str:
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result, ensure_ascii=False)
    except Exception:
        return str(result)


def _ifind_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = _ifind_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _post_ifind_proxy(path: str, payload: dict[str, Any]) -> Any | None:
    """调用用户自建 iFind HTTP 代理。

    约定尽量宽松：支持 VR_IFIND_DSN=http://host，也支持直接指向完整 endpoint。
    若代理不存在或协议不同，静默返回 None，由公开源兜底。
    """

    dsn = (
        os.environ.get("VR_IFIND_FUND_DSN", "").strip()
        if path.startswith("/fund/")
        else os.environ.get("VR_IFIND_DSN", "").strip()
    ) or os.environ.get("VR_IFIND_DSN", "").strip()
    if not dsn:
        return None
    base = dsn.rstrip("/")
    urls = [base]
    if not base.endswith(path):
        urls.insert(0, f"{base}{path}")
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    for url in urls:
        try:
            req = urllib.request.Request(url, data=body, headers=_ifind_headers(), method="POST")
            with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310 - user-owned local/proxy URL
                raw = resp.read().decode("utf-8", errors="ignore")
            data = json.loads(raw)
            return data.get("data", data)
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            continue
    return None


def ifind_request(path: str, payload: dict[str, Any]) -> Any | None:
    """公开 iFind 代理入口，供基金等专题数据适配器复用。"""

    return _post_ifind_proxy(path, payload)


def _unwrap_rows(result: Any) -> list[Any]:
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        for key in ("data", "items", "rows", "results", "list"):
            rows = result.get(key)
            if isinstance(rows, list):
                return rows
    return []


def _normalize_stock_rows(rows: list[Any], limit: int) -> list[dict]:
    normalized: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        code = str(row.get("code") or row.get("ticker") or row.get("stock_code") or "").strip()
        name = str(row.get("name") or row.get("stock_name") or row.get("简称") or "").strip()
        if not code or not name:
            continue
        pure_code = re.search(r"\d{6}", code)
        code = pure_code.group(0) if pure_code else code
        market = str(row.get("market") or row.get("exchange") or "").strip()
        if not market and code.isdigit():
            market = "SH" if code.startswith(("5", "6", "9")) else "SZ"
        normalized.append(
            {
                "code": code,
                "market": market,
                "name": name,
                "pinyin": str(row.get("pinyin") or row.get("spell") or "").strip(),
                "security_type": str(row.get("security_type") or row.get("type") or "AStock").strip(),
                "display": f"{name} {code}.{market}" if market else f"{name} {code}",
                "source": "ifind",
            }
        )
        if len(normalized) >= limit:
            break
    return normalized


def _try_ifind_stock_search(query: str, limit: int) -> list[dict]:
    status = ifind_status()
    if not status["ready"]:
        return []
    proxy_result = _post_ifind_proxy("/stock/search", {"query": query, "limit": limit, "operation": "stock_search"})
    rows = _unwrap_rows(proxy_result)
    normalized = _normalize_stock_rows(rows, limit)
    if normalized:
        return normalized
    if not status["sdk_module"]:
        return []
    try:
        module = importlib.import_module(status["sdk_module"])
    except Exception:
        return []
    for attr in ("search_stocks", "stock_select", "ifind_search_stocks"):
        fn = getattr(module, attr, None)
        if not callable(fn):
            continue
        try:
            result = fn(query=query, limit=limit)
        except TypeError:
            try:
                result = fn(query)
            except Exception:
                continue
        except Exception:
            continue
        normalized = _normalize_stock_rows(_unwrap_rows(result), limit)
        if normalized:
            return normalized
    return []


def _try_ifind_stock_industry(code: str) -> dict[str, str] | None:
    status = ifind_status()
    if not status["ready"]:
        return None
    proxy_result = _post_ifind_proxy("/stock/industry", {"code": code, "operation": "stock_industry"})
    if isinstance(proxy_result, dict):
        industry = str(proxy_result.get("industry") or proxy_result.get("所属申万行业") or "").strip()
        if industry:
            parts = [item.strip() for item in re.split(r"--|>|/|，|,", industry) if item.strip()]
            return {
                "industry": "--".join(parts) if parts else industry,
                "sw_l1": str(proxy_result.get("sw_l1") or (parts[0] if len(parts) >= 1 else "")).strip(),
                "sw_l2": str(proxy_result.get("sw_l2") or (parts[1] if len(parts) >= 2 else "")).strip(),
                "sw_l3": str(proxy_result.get("sw_l3") or (parts[2] if len(parts) >= 3 else "")).strip(),
                "source": "ifind",
            }
    if not status["sdk_module"]:
        return None
    try:
        module = importlib.import_module(status["sdk_module"])
    except Exception:
        return None

    query = f"{code} 股票代码 所属申万行业 所属中信行业 主营业务 基础信息"
    for attr in ("get_stock_summary", "stock_summary", "get_stock_info"):
        fn = getattr(module, attr, None)
        if not callable(fn):
            continue
        try:
            result = fn(query=query)
        except TypeError:
            try:
                result = fn(query)
            except Exception:
                continue
        except Exception:
            continue
        parsed = _parse_sw_industry(_stringify_result(result))
        if parsed:
            return parsed
    return None


def stock_search(query: str, limit: int = 10) -> list[dict]:
    """股票搜索统一入口。iFind 接入后可在这里替换，不影响前端页面。"""

    ifind_hits = _try_ifind_stock_search(query, limit)
    if ifind_hits:
        return ifind_hits
    return astock.stock_search(query, limit=limit)


def stock_industry(code: str) -> dict:
    """股票行业分类统一入口，优先 iFind，失败后回退公开源。"""

    ifind_hit = _try_ifind_stock_industry(code)
    if ifind_hit:
        ifind_hit.setdefault("code", code)
        return ifind_hit
    data = astock.stock_industry(code)
    data.setdefault("provider", "public")
    data.setdefault("fallback_from", "ifind")
    return data


def auto_calendar_events(watchlist: dict[str, Any]) -> list[dict[str, Any]]:
    """自动日历事件入口。

    默认用公开源生成可见日历；iFind 可用时再补全更精确的事件。
    """

    cache_key = json.dumps(
        {
            "stocks": [
                {
                    "code": item.get("code"),
                    "market": item.get("market"),
                    "name": item.get("name"),
                }
                for item in watchlist.get("stocks", [])
            ],
            "day": date.today().isoformat(),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    now_ts = datetime.now(BEIJING).timestamp()
    if _AUTO_CALENDAR_CACHE["key"] == cache_key and now_ts - float(_AUTO_CALENDAR_CACHE["ts"] or 0) < 3600:
        return list(_AUTO_CALENDAR_CACHE["events"])

    events = _public_calendar_events(watchlist)
    events.extend(_ifind_calendar_events(watchlist))
    deduped = _dedupe_events(events)
    _AUTO_CALENDAR_CACHE.update({"key": cache_key, "events": deduped, "ts": now_ts})
    return deduped


def _ifind_calendar_events(watchlist: dict[str, Any]) -> list[dict[str, Any]]:
    status = ifind_status()
    if not status["ready"]:
        return []
    payload = {
        "operation": "calendar_events",
        "stocks": watchlist.get("stocks", []),
        "indicators": watchlist.get("indicators", []),
    }
    proxy_result = _post_ifind_proxy("/calendar/events", payload)
    rows = _unwrap_rows(proxy_result)
    events: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("event") or "").strip()
        date = str(row.get("date") or row.get("event_date") or "").strip()[:10]
        if not title or not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            continue
        event_id = str(row.get("id") or f"auto-{date}-{_slug_for_id(title)}")
        events.append(
            {
                "id": event_id,
                "title": title,
                "date": date,
                "category": str(row.get("category") or "auto"),
                "importance": str(row.get("importance") or "medium"),
                "source": str(row.get("source") or "ifind"),
                "notes": str(row.get("notes") or ""),
                "created_at": str(row.get("created_at") or ""),
                "updated_at": str(row.get("updated_at") or ""),
                "auto": True,
            }
        )
    return events


def _public_calendar_events(watchlist: dict[str, Any]) -> list[dict[str, Any]]:
    events = []
    events.extend(_public_a_share_disclosure_events(watchlist.get("stocks", [])))
    events.extend(_public_macro_baseline_events())
    return events


def _public_a_share_disclosure_events(stocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    codes = {
        str(item.get("code") or "").strip(): {
            "name": str(item.get("name") or "").strip(),
            "market": str(item.get("market") or "").strip().upper(),
        }
        for item in stocks
        if str(item.get("code") or "").strip().isdigit()
        and str(item.get("market") or "").strip().upper() in {"SH", "SZ", "BJ"}
    }
    if not codes:
        return []

    try:
        import akshare as ak
    except Exception:
        return []

    events: list[dict[str, Any]] = []
    for period in _recent_report_periods():
        try:
            df = ak.stock_report_disclosure(market="沪深京", period=period)
        except Exception:
            continue
        if df is None or getattr(df, "empty", True):
            continue
        for _, row in df.iterrows():
            code = str(row.get("股票代码") or "").strip()
            if code not in codes:
                continue
            event_date = _latest_disclosure_date(row)
            if not event_date:
                continue
            title_name = codes[code]["name"] or str(row.get("股票简称") or code).strip() or code
            events.append(
                {
                    "id": f"public-disclosure-{code}-{period}-{event_date}",
                    "title": f"{title_name} {period}预约披露",
                    "date": event_date,
                    "category": "earnings",
                    "importance": "high",
                    "source": "巨潮预约披露",
                    "notes": "公开源自动提取。若公司后续变更披露日期，刷新后会按最新预约/变更日期更新。",
                    "created_at": _now_iso(),
                    "updated_at": _now_iso(),
                    "auto": True,
                }
            )
    return events


def _latest_disclosure_date(row: Any) -> str:
    for key in ("实际披露", "三次变更", "二次变更", "初次变更", "首次预约"):
        value = row.get(key)
        text = "" if value is None else str(value)
        if not text or text in {"NaT", "nan", "None"}:
            continue
        match = re.search(r"\d{4}-\d{2}-\d{2}", text)
        if match:
            return match.group(0)
        if hasattr(value, "isoformat"):
            return value.isoformat()[:10]
    return ""


def _recent_report_periods() -> list[str]:
    today = date.today()
    year = today.year
    candidates = [
        f"{year}三季报",
        f"{year}半年报",
        f"{year}一季报",
        f"{year - 1}年报",
        f"{year - 1}三季报",
        f"{year - 1}半年报",
        f"{year - 1}一季报",
    ]
    if today.month >= 10:
        candidates.insert(0, f"{year}年报")
    return candidates


def _public_macro_baseline_events() -> list[dict[str, Any]]:
    today = date.today()
    horizon = today + timedelta(days=150)
    events: list[dict[str, Any]] = []
    cursor = date(today.year, today.month, 1)
    while cursor <= horizon:
        year, month = cursor.year, cursor.month
        for day, title, category, importance, note in [
            (9, "中国 CPI/PPI 常规公布窗口", "macro", "high", "通常在每月上旬公布，具体日期以国家统计局日程为准。"),
            (15, "MLF 到期/续作观察窗口", "liquidity", "medium", "货币政策与流动性观察节点，具体操作以央行公告为准。"),
            (20, "中国 LPR 报价窗口", "liquidity", "high", "一般每月20日左右公布，遇节假日可能顺延。"),
            (30, "中国官方 PMI 公布窗口", "macro", "high", "通常在月末公布，具体日期以国家统计局/中物联为准。"),
        ]:
            event_day = _safe_date(year, month, day)
            if today <= event_day <= horizon:
                events.append(_macro_event(event_day, title, category, importance, note, "公开宏观日历基线"))

        us_cpi = _nth_weekday(year, month, weekday=2, nth=2)
        if today <= us_cpi <= horizon:
            events.append(_macro_event(us_cpi, "美国 CPI 常规公布窗口", "macro", "high", "按历史节奏估算，精确日期以后续官方日历/iFind为准。", "公开宏观日历基线"))

        cursor = date(year + (month // 12), (month % 12) + 1, 1)

    for fomc_day in _fomc_baseline_dates(today.year) + _fomc_baseline_dates(today.year + 1):
        if today <= fomc_day <= horizon:
            events.append(_macro_event(fomc_day, "美联储 FOMC 议息会议窗口", "macro", "high", "公开常规议息窗口，精确会议日程以后续官方日历/iFind为准。", "公开宏观日历基线"))
    return events


def _macro_event(event_day: date, title: str, category: str, importance: str, notes: str, source: str) -> dict[str, Any]:
    day = event_day.isoformat()
    return {
        "id": f"public-macro-{_slug_for_id(title)}-{day}",
        "title": title,
        "date": day,
        "category": category,
        "importance": importance,
        "source": source,
        "notes": notes,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "auto": True,
    }


def _safe_date(year: int, month: int, day: int) -> date:
    while day >= 28:
        try:
            return date(year, month, day)
        except ValueError:
            day -= 1
    return date(year, month, day)


def _nth_weekday(year: int, month: int, weekday: int, nth: int) -> date:
    current = date(year, month, 1)
    seen = 0
    while current.month == month:
        if current.weekday() == weekday:
            seen += 1
            if seen == nth:
                return current
        current += timedelta(days=1)
    return _safe_date(year, month, 15)


def _fomc_baseline_dates(year: int) -> list[date]:
    return [
        _safe_date(year, 1, 29),
        _safe_date(year, 3, 18),
        _safe_date(year, 5, 6),
        _safe_date(year, 6, 17),
        _safe_date(year, 7, 29),
        _safe_date(year, 9, 16),
        _safe_date(year, 11, 4),
        _safe_date(year, 12, 16),
    ]


def _dedupe_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for item in sorted(events, key=lambda x: (str(x.get("date", "")), str(x.get("title", "")))):
        key = (str(item.get("date") or ""), str(item.get("title") or ""))
        if not key[0] or not key[1] or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _now_iso() -> str:
    return datetime.now(BEIJING).isoformat()


def _slug_for_id(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "-", value).strip("-")[:48] or "event"


def _dataset_provider(ifind_ready: bool, fallback: str = "placeholder") -> dict[str, str]:
    return {
        "active_provider": "ifind" if ifind_ready else fallback,
        "fallback_provider": fallback,
    }


def provider_status() -> dict[str, Any]:
    status = ifind_status()
    ifind_enabled = bool(status["enabled"])
    ifind_ready = bool(status["ready"])
    premium_enabled = _env_flag("VR_PREMIUM_NOTES_ENABLED")
    premium_ready = premium_enabled and bool(os.environ.get("VR_PREMIUM_NOTES_DSN", "").strip())
    fmp_ready = bool(os.environ.get("VR_FMP_API_KEY", "").strip())
    dataset_status = {
        "china_macro_overview": {
            "active_provider": "ifind" if ifind_ready else "public",
            "fallback_provider": "public",
            "dataset_key": "china_macro_overview",
        },
        "industry_expert_notes": {
            "active_provider": "premium_notes" if premium_ready else "placeholder",
            "fallback_provider": "placeholder",
            "dataset_key": "industry_expert_notes",
        },
        "stock_expert_notes": {
            "active_provider": "premium_notes" if premium_ready else "placeholder",
            "fallback_provider": "placeholder",
            "dataset_key": "stock_expert_notes",
        },
        "us_stock_financials": {
            "active_provider": "financialmodelingprep" if fmp_ready else "eastmoney",
            "fallback_provider": "eastmoney",
            "dataset_key": "us_stock_financials",
        },
        "us_stock_estimates": {
            "active_provider": "financialmodelingprep" if fmp_ready else "unconfigured",
            "fallback_provider": "unconfigured",
            "dataset_key": "us_stock_estimates",
        },
    }
    for key in [
        "stock_data",
        "industry_map",
        "earnings_tracker",
        "china_midstream",
        "us_macro",
        "china_index_review",
        "us_index_review",
    ]:
        dataset_status[key] = {**_dataset_provider(ifind_ready), "dataset_key": key}
    return {
        "providers": {
            "public": {
                "enabled": True,
                "ready": True,
                "label": "公开源",
                "notes": "当前一期默认使用现有公开源与样板数据。",
            },
            "ifind": {
                "enabled": ifind_enabled,
                "ready": ifind_ready,
                "label": "iFind",
                "notes": status["reason"],
                "mode": status["mode"],
                "sdk_module": status["sdk_module"],
                "has_token": status["has_token"],
                "has_dsn": status["has_dsn"],
            },
            "premium_notes": {
                "enabled": premium_enabled,
                "ready": premium_ready,
                "label": "高价值纪要源",
                "notes": "设置 VR_PREMIUM_NOTES_ENABLED=1 与 VR_PREMIUM_NOTES_DSN 后，可接专家会议纪要、渠道会纪要等高价值内容。",
            },
            "research_ingest": {
                "enabled": True,
                "ready": True,
                "label": "资料结构化提取",
                "notes": "统一投喂与结构化候选底座，具体 OCR/PDF 引擎状态请看 /api/research/ingest/status。",
            },
            "financialmodelingprep": {
                "enabled": fmp_ready,
                "ready": fmp_ready,
                "label": "Financial Modeling Prep",
                "notes": "美股财务三表、关键指标与分析师一致预期；可在个股数据页配置个人 Key，定时任务请设置 VR_FMP_API_KEY。",
                "has_api_key": fmp_ready,
            },
        },
        **dataset_status,
    }
