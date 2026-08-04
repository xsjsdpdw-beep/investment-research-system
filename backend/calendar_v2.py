"""新版投资日历：独立数据文件与自动数据源。"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

import calendar_v2_sources
import knowledge

CALENDAR_V2_INDEX = knowledge.DIRS["indexes"] / "calendar_events_v2.json"


def _load_manual_events() -> list[dict[str, Any]]:
    knowledge._ensure_dirs()
    if not CALENDAR_V2_INDEX.exists():
        # 首次启用新版时只复制原版自定义事件；此后两版数据完全独立。
        legacy = [
            dict(item)
            for item in knowledge._load_calendar()
            if item.get("source") == "manual" or item.get("category") == "manual"
        ]
        knowledge._atomic_json(CALENDAR_V2_INDEX, legacy)
        return legacy
    rows = knowledge._read_json(CALENDAR_V2_INDEX, [])
    return rows if isinstance(rows, list) else []


def _save_manual_events(events: list[dict[str, Any]]) -> None:
    knowledge._atomic_json(CALENDAR_V2_INDEX, events)


def list_events(start: str | None = None, end: str | None = None) -> list[dict[str, Any]]:
    events = _load_manual_events()
    automatic = calendar_v2_sources.calendar_events(
        knowledge.load_watchlist(),
        start=start,
        end=end,
    )
    automatic = [
        item
        for item in automatic
        if not str(item.get("source") or "").startswith("华尔街见闻")
        or int(item.get("stars") or 0) >= 2
    ]
    automatic.extend(_authorized_jin10_events(start=start, end=end))
    existing_ids = {item.get("id") for item in events}
    events.extend(item for item in automatic if item.get("id") not in existing_ids)
    events = calendar_v2_sources.dedupe_events(events)
    if start:
        events = [item for item in events if str(item.get("date") or "") >= start]
    if end:
        events = [item for item in events if str(item.get("date") or "") <= end]
    return sorted(
        events,
        key=lambda item: (
            str(item.get("date") or ""),
            str(item.get("time") or "99:99"),
            str(item.get("title") or ""),
        ),
    )


def upsert_event(payload: dict[str, Any]) -> dict[str, Any]:
    title = str(payload.get("title") or "").strip()
    event_date = str(payload.get("date") or "").strip()
    if not title:
        raise ValueError("事件标题不能为空")
    if not event_date:
        raise ValueError("事件日期不能为空")

    events = _load_manual_events()
    event_id = str(payload.get("id") or "").strip()
    existing = next((item for item in events if item.get("id") == event_id), {})
    if event_id and not existing:
        raise ValueError("只能编辑新版中的自定义事件")

    now = knowledge._now_iso()
    event = {
        "id": event_id or f"cal-v2-{datetime.now(knowledge.BEIJING):%Y%m%d%H%M%S}-{knowledge._slugify(title)}",
        "title": title,
        "date": event_date,
        "time": str(payload.get("time") or "").strip(),
        "category": str(payload.get("category") or "manual").strip(),
        "importance": str(payload.get("importance") or "high").strip(),
        "source": "manual",
        "notes": str(payload.get("notes") or "").strip(),
        "stars": max(1, min(3, int(payload.get("stars") or _stars_from_importance(payload.get("importance"))))),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    events = [item for item in events if item.get("id") != event["id"]]
    events.append(event)
    _save_manual_events(events)
    return event


def delete_event(event_id: str) -> bool:
    events = _load_manual_events()
    target = next((item for item in events if item.get("id") == event_id), None)
    if not target:
        raise ValueError("新版自定义事件不存在")
    if target.get("source") != "manual":
        raise ValueError("自动事件不可删除")
    _save_manual_events([item for item in events if item.get("id") != event_id])
    return True


def _stars_from_importance(value: Any) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get(str(value or "").strip(), 3)


def _authorized_jin10_events(start: str | None, end: str | None) -> list[dict[str, Any]]:
    """读取用户获正式授权后的金十 API；未配置时不抓取官网。"""

    endpoint = os.environ.get("VR_JIN10_CALENDAR_API_URL", "").strip()
    if not endpoint.startswith("https://"):
        return []
    params = urllib.parse.urlencode({"start": start or "", "end": end or ""})
    headers = {"Accept": "application/json", "User-Agent": "VibeResearch/0.1"}
    token = os.environ.get("VR_JIN10_CALENDAR_API_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        request = urllib.request.Request(f"{endpoint}?{params}", headers=headers)
        with urllib.request.urlopen(request, timeout=8) as response:  # noqa: S310 - user-authorized HTTPS endpoint
            payload = json.loads(response.read().decode("utf-8", errors="ignore"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return []

    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    if isinstance(rows, dict):
        rows = rows.get("items", rows.get("list", []))
    if not isinstance(rows, list):
        return []

    events: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("name") or row.get("event") or "").strip()
        event_date = str(row.get("date") or row.get("publish_date") or "").strip()[:10]
        stars = int(row.get("stars") or row.get("star") or row.get("importance") or 0)
        if not title or len(event_date) != 10 or stars < 3:
            continue
        category = str(row.get("category") or row.get("type") or "macro").strip()
        if category not in {"macro", "major_event", "earnings", "conference_call"}:
            category = "major_event" if category in {"event", "大事"} else "macro"
        events.append(
            {
                "id": f"jin10-{row.get('id') or knowledge._slugify(title)}-{event_date}",
                "title": title,
                "date": event_date,
                "time": str(row.get("time") or row.get("publish_time") or "").strip(),
                "category": category,
                "importance": "high",
                "stars": min(5, stars),
                "country": str(row.get("country") or ""),
                "source": "金十授权 API",
                "source_url": str(row.get("source_url") or "https://rili.jin10.com/"),
                "notes": str(row.get("notes") or row.get("description") or "").strip(),
                "created_at": knowledge._now_iso(),
                "updated_at": knowledge._now_iso(),
                "auto": True,
            }
        )
    return events
