"""新版投资日历自动数据源。"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any

import data_adapters

BEIJING = timezone(timedelta(hours=8))
WALLSTREETCN_API = "https://api-one-wscn.awtmt.com/apiv1/"
WALLSTREETCN_DDC_API = "https://api-ddc-wscn.awtmt.com/"
WALLSTREETCN_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "VibeResearch/0.1 (personal calendar; source: wallstreetcn.com/calendar)",
    "X-Client-Type": "pc",
    "X-Ivanka-Platform": "wscn-platform",
    "X-Ivanka-App": "wscn|web|0.40.46|0.0|0",
}
IMPORTANT_US_EARNINGS = {
    "AAPL", "ABBV", "ABNB", "ADBE", "AMD", "AMGN", "AMZN", "ARM", "AVGO",
    "AXP", "BA", "BAC", "BKNG", "BLK", "BRK.B", "CAT", "COST", "CRM", "CSCO",
    "CVX", "DE", "DIS", "GE", "GM", "GOOG", "GOOGL", "GS", "HD", "IBM", "INTC",
    "JNJ", "JPM", "KO", "LIN", "LLY", "LMT", "LOW", "MA", "MCD", "MDLZ", "META",
    "MRK", "MS", "MSFT", "NFLX", "NKE", "NOW", "NVDA", "ORCL", "PEP", "PFE", "PG",
    "PLTR", "PYPL", "QCOM", "SBUX", "SHOP", "SNOW", "SPGI", "T", "TGT", "TSLA",
    "TSM", "UBER", "UNH", "V", "VZ", "WMT", "XOM",
}
_CACHE: dict[str, Any] = {"key": "", "events": [], "ts": 0.0}


def calendar_events(
    watchlist: dict[str, Any],
    start: str | None = None,
    end: str | None = None,
) -> list[dict[str, Any]]:
    start_date, end_date = _date_range(start, end)
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
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    now_ts = datetime.now(BEIJING).timestamp()
    if _CACHE["key"] == cache_key and now_ts - float(_CACHE["ts"] or 0) < 3600:
        return list(_CACHE["events"])

    events = _wallstreetcn_calendar_events(watchlist, start_date, end_date)
    events.extend(data_adapters._public_a_share_disclosure_events(watchlist.get("stocks", [])))
    if not any(item.get("category") == "macro" for item in events):
        events.extend(data_adapters._public_macro_baseline_events())
    events.extend(data_adapters._ifind_calendar_events(watchlist))
    events = [
        item
        for item in dedupe_events(events)
        if start_date.isoformat() <= str(item.get("date") or "") <= end_date.isoformat()
    ]
    _CACHE.update({"key": cache_key, "events": events, "ts": now_ts})
    return events


def dedupe_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    output: list[dict[str, Any]] = []
    for item in events:
        key = (str(item.get("date") or ""), str(item.get("title") or ""))
        if not key[0] or not key[1] or key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def _date_range(start: str | None, end: str | None) -> tuple[date, date]:
    today = date.today()

    def parse(value: str | None, fallback: date) -> date:
        try:
            return date.fromisoformat(str(value or "")[:10])
        except ValueError:
            return fallback

    start_date = parse(start, today)
    end_date = parse(end, today + timedelta(days=45))
    if end_date < start_date:
        start_date, end_date = end_date, start_date
    if (end_date - start_date).days > 62:
        end_date = start_date + timedelta(days=62)
    return start_date, end_date


def _get(base: str, path: str, params: dict[str, Any]) -> Any | None:
    url = urllib.parse.urljoin(base, path)
    query = urllib.parse.urlencode(params)
    try:
        request = urllib.request.Request(f"{url}?{query}", headers=WALLSTREETCN_HEADERS)
        with urllib.request.urlopen(request, timeout=6) as response:  # noqa: S310 - fixed public provider
            payload = json.loads(response.read().decode("utf-8", errors="ignore"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or payload.get("code") != 20000:
        return None
    return payload.get("data")


def _wallstreetcn_calendar_events(
    watchlist: dict[str, Any],
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    start_ts = int(datetime.combine(start_date, datetime.min.time(), tzinfo=BEIJING).timestamp())
    end_ts = int(datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=BEIJING).timestamp()) - 1
    params = {"start": start_ts, "end": end_ts}
    macro_data = _get(WALLSTREETCN_API, "finance/macrodatas", params)
    earnings_data = _get(
        WALLSTREETCN_DDC_API,
        "finance/report/list",
        {**params, "country": "US,HK,CN", "limit": 200},
    )
    meetings_data = _get(WALLSTREETCN_API, "finance/meetings", params)
    events = _wallstreetcn_macro_events(macro_data)
    events.extend(_wallstreetcn_earnings_events(earnings_data, watchlist))
    events.extend(_wallstreetcn_meeting_events(meetings_data, watchlist))
    return events


def _items(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if not isinstance(items, list):
        return []
    if not items or isinstance(items[0], dict):
        return [item for item in items if isinstance(item, dict)]
    fields = data.get("fields")
    if not isinstance(fields, list):
        return []
    return [
        {str(field): row[index] if index < len(row) else None for index, field in enumerate(fields)}
        for row in items
        if isinstance(row, list)
    ]


def _as_datetime(value: Any) -> datetime | None:
    try:
        timestamp = int(float(value))
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(timestamp, BEIJING) if timestamp > 0 else None


def _importance(stars: int) -> str:
    return "high" if stars >= 3 else "medium" if stars == 2 else "low"


def _now_iso() -> str:
    return datetime.now(BEIJING).isoformat()


def _slug(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "-", value).strip("-")[:48] or "event"


def _wallstreetcn_macro_events(data: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in _items(data):
        published = _as_datetime(row.get("public_date"))
        title = str(row.get("title") or row.get("event") or "").strip()
        if not published or not title:
            continue
        stars = max(1, min(3, int(row.get("importance") or 1)))
        category = "macro"
        if re.search(r"电话会|电话会议|法说会|业绩会", title, re.IGNORECASE):
            category = "conference_call"
        elif str(row.get("calendar_type") or "").upper() == "FE":
            category = "major_event"
        values = []
        for label, key in (("今值", "actual"), ("预期", "forecast"), ("前值", "previous")):
            value = row.get(key)
            if value not in (None, ""):
                values.append(f"{label} {value}{row.get('unit') or ''}")
        day = published.date().isoformat()
        events.append(
            {
                "id": f"wscn-macro-{row.get('id') or _slug(title)}-{day}",
                "title": title,
                "date": day,
                "time": "待定" if published.strftime("%H:%M") == "12:02" else published.strftime("%H:%M"),
                "category": category,
                "importance": _importance(stars),
                "stars": stars,
                "country": str(row.get("country") or ""),
                "source": (
                    "华尔街见闻电话会日历"
                    if category == "conference_call"
                    else "华尔街见闻大事日历"
                    if category == "major_event"
                    else "华尔街见闻财经日历"
                ),
                "source_url": str(row.get("uri") or "https://wallstreetcn.com/calendar"),
                "notes": " · ".join(values),
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "auto": True,
            }
        )
    return events


def _watchlist_identity(watchlist: dict[str, Any]) -> tuple[set[str], set[str]]:
    tickers: set[str] = set()
    names: set[str] = set()
    for item in watchlist.get("stocks", []):
        code = str(item.get("code") or "").strip().upper()
        market = str(item.get("market") or "").strip().upper()
        name = str(item.get("name") or "").strip().lower()
        if code:
            tickers.add(code)
            if market:
                tickers.add(f"{code}.{market}")
        if name:
            names.add(name)
    return tickers, names


def _watchlist_match(row: dict[str, Any], watchlist: dict[str, Any]) -> bool:
    tickers, names = _watchlist_identity(watchlist)
    ticker = str(row.get("code") or row.get("ticker") or "").strip().upper()
    company = str(row.get("company_name") or row.get("name") or "").strip().lower()
    return ticker in tickers or ticker.split(".", 1)[0] in tickers or (company and company in names)


def _wallstreetcn_earnings_events(data: Any, watchlist: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in _items(data):
        published = _as_datetime(row.get("public_date"))
        ticker = str(row.get("code") or "").strip().upper()
        company = str(row.get("company_name") or ticker).strip()
        if not published or not ticker or not company:
            continue
        is_watchlist = _watchlist_match(row, watchlist)
        is_important_us = (
            str(row.get("country_id") or "").upper() == "US"
            and ticker.split(".", 1)[0] in IMPORTANT_US_EARNINGS
        )
        if not is_watchlist and not is_important_us:
            continue
        call_time = str(row.get("earnings_call_time") or "").upper()
        event_time = {"BMO": "盘前", "AMC": "盘后", "TNS": "待定"}.get(
            call_time,
            published.strftime("%H:%M") if call_time == "TAS" else "待定",
        )
        day = published.date().isoformat()
        notes = []
        if row.get("eps_estimate") not in (None, ""):
            notes.append(f"预期 EPS {row.get('eps_estimate')}")
        if row.get("reported_eps") not in (None, "", 0):
            notes.append(f"实际 EPS {row.get('reported_eps')}")
        report_type = str(row.get("observation_date") or "业绩").strip()
        events.append(
            {
                "id": f"wscn-earnings-{row.get('id') or ticker}-{day}",
                "title": f"{company} {report_type if report_type != '业绩' else '业绩发布'}",
                "date": day,
                "time": event_time,
                "category": "earnings",
                "importance": "high",
                "stars": 3,
                "country": str(row.get("country") or ""),
                "ticker": ticker,
                "watchlist_match": is_watchlist,
                "important_us": is_important_us,
                "source": "华尔街见闻财报日历",
                "source_url": f"https://wallstreetcn.com/calendar?timestamp={int(published.timestamp() * 1000)}",
                "notes": " · ".join(notes),
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "auto": True,
            }
        )
    return events


def _wallstreetcn_meeting_events(data: Any, watchlist: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for row in _items(data):
        meeting_at = _as_datetime(row.get("meeting_date"))
        company = str(row.get("company_name") or "").strip()
        ticker = str(row.get("code") or "").strip().upper()
        if not meeting_at or not company:
            continue
        is_watchlist = _watchlist_match(row, watchlist)
        is_important_us = (
            str(row.get("country_id") or "").upper() == "US"
            and ticker.split(".", 1)[0] in IMPORTANT_US_EARNINGS
        )
        if not is_watchlist and not is_important_us:
            continue
        day = meeting_at.date().isoformat()
        address = str(row.get("meeting_address") or "").strip()
        events.append(
            {
                "id": f"wscn-meeting-{row.get('id') or ticker or _slug(company)}-{day}",
                "title": f"{company} {str(row.get('meeting_type') or '电话会').strip()}",
                "date": day,
                "time": meeting_at.strftime("%H:%M"),
                "category": "conference_call",
                "importance": "high" if is_watchlist else "medium",
                "stars": 3 if is_watchlist else 2,
                "country": str(row.get("country") or ""),
                "ticker": ticker,
                "watchlist_match": is_watchlist,
                "important_us": is_important_us,
                "source": "华尔街见闻活动日历",
                "source_url": address if address.startswith(("http://", "https://")) else "https://wallstreetcn.com/calendar",
                "notes": "" if address.startswith(("http://", "https://")) else address,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "auto": True,
            }
        )
    return events
