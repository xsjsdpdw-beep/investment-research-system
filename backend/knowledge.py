"""本地文件优先的知识库 / 日历 / 关注列表存储层。"""

from __future__ import annotations

import json
import os
import re
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

BEIJING = timezone(timedelta(hours=8))
DATA_ROOT = Path(os.environ.get("VR_DATA_DIR") or (Path.home() / ".vibe-research"))
DIRS = {
    "calendar": DATA_ROOT / "calendar",
    "memos": DATA_ROOT / "memos",
    "watchlists": DATA_ROOT / "watchlists",
    "knowledge_sectors": DATA_ROOT / "knowledge" / "sectors",
    "knowledge_stocks": DATA_ROOT / "knowledge" / "stocks",
    "reviews_weekly": DATA_ROOT / "reviews" / "weekly",
    "indexes": DATA_ROOT / "indexes",
    "attachments": DATA_ROOT / "attachments",
}
ENTRIES_INDEX = DIRS["indexes"] / "knowledge_entries.json"
ENTRY_ORDER_FILE = DIRS["indexes"] / "knowledge_entry_order.json"
CALENDAR_INDEX = DIRS["indexes"] / "calendar_events.json"
WATCHLIST_FILE = DIRS["watchlists"] / "watchlist.json"
SECTOR_TREE_FILE = DIRS["indexes"] / "sector_tree.json"
SECTOR_TREE_ORDER_FILE = DIRS["indexes"] / "sector_tree_order.json"
SECTOR_INDICATORS_FILE = DIRS["indexes"] / "sector_indicators.json"
SECTOR_MODULES_FILE = DIRS["indexes"] / "sector_modules.json"
STOCK_MODULES_FILE = DIRS["indexes"] / "stock_modules.json"
ARTIFACT_DIR = DIRS["attachments"] / "artifacts"
VALID_TYPES = {
    "memo",
    "research_note",
    "tracking_comment",
    "weekly_review",
    "calendar_event",
    "sector_profile",
    "stock_profile",
    "attachment_link",
    "learning_pack",
}


def _ensure_dirs() -> None:
    for path in DIRS.values():
        path.mkdir(parents=True, exist_ok=True)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(BEIJING).isoformat(timespec="seconds")


def _slugify(text: str) -> str:
    base = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", (text or "").strip().lower())
    base = re.sub(r"-{2,}", "-", base).strip("-")
    return base or "entry"


def _entry_dir(kind: str) -> Path:
    if kind == "memo":
        return DIRS["memos"]
    if kind == "weekly_review":
        return DIRS["reviews_weekly"]
    if kind == "sector_profile":
        return DIRS["knowledge_sectors"]
    return DIRS["knowledge_stocks"]


def _atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return deepcopy(default)


def _entry_defaults(meta: dict[str, Any]) -> dict[str, Any]:
    now = _now_iso()
    investment_view = (meta.get("investment_view") or "").strip()
    if investment_view not in {"bullish", "neutral", "bearish", ""}:
        investment_view = ""
    return {
        "id": meta.get("id") or f"{datetime.now(BEIJING):%Y%m%d%H%M%S}-{_slugify(meta.get('title', 'entry'))}",
        "title": meta.get("title", "").strip(),
        "date": meta.get("date") or now[:10],
        "type": meta.get("type", "memo"),
        "tags": list(dict.fromkeys(meta.get("tags") or [])),
        "related_sectors": list(dict.fromkeys(meta.get("related_sectors") or [])),
        "related_stocks": list(dict.fromkeys(meta.get("related_stocks") or [])),
        "summary_status": meta.get("summary_status") or "pending",
        "image_artifact_status": meta.get("image_artifact_status") or "pending",
        "summary_text": meta.get("summary_text") or "",
        "investment_view": investment_view,
        "artifact_request": meta.get("artifact_request"),
        "created_at": meta.get("created_at") or now,
        "updated_at": now,
        "path": meta.get("path", ""),
    }


def _load_entries() -> list[dict[str, Any]]:
    _ensure_dirs()
    return _read_json(ENTRIES_INDEX, [])


def _save_entries(entries: list[dict[str, Any]]) -> None:
    _atomic_json(ENTRIES_INDEX, entries)


def _load_entry_order() -> dict[str, list[str]]:
    data = _read_json(ENTRY_ORDER_FILE, {})
    return data if isinstance(data, dict) else {}


def _save_entry_order(order_map: dict[str, list[str]]) -> None:
    _atomic_json(ENTRY_ORDER_FILE, order_map)


def _load_calendar() -> list[dict[str, Any]]:
    _ensure_dirs()
    return _read_json(CALENDAR_INDEX, [])


def _save_calendar(events: list[dict[str, Any]]) -> None:
    _atomic_json(CALENDAR_INDEX, events)


def _default_watchlist() -> dict[str, Any]:
    return {"stocks": [], "indicators": [], "updated_at": _now_iso()}


def load_watchlist() -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(WATCHLIST_FILE, _default_watchlist())
    data.setdefault("stocks", [])
    data.setdefault("indicators", [])
    data.setdefault("updated_at", _now_iso())
    return data


def save_watchlist(payload: dict[str, Any]) -> dict[str, Any]:
    data = _default_watchlist()
    data["stocks"] = payload.get("stocks", [])
    data["indicators"] = payload.get("indicators", [])
    data["updated_at"] = _now_iso()
    _atomic_json(WATCHLIST_FILE, data)
    return data


def _default_sector_tree() -> dict[str, Any]:
    return {"nodes": [], "updated_at": _now_iso()}


def _default_sector_tree_order() -> list[str]:
    return []


def load_sector_tree() -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(SECTOR_TREE_FILE, _default_sector_tree())
    data.setdefault("nodes", [])
    data.setdefault("updated_at", _now_iso())
    saved_order = _read_json(SECTOR_TREE_ORDER_FILE, _default_sector_tree_order())
    rank = {str(node_id): index for index, node_id in enumerate(saved_order if isinstance(saved_order, list) else [])}
    nodes = sorted(
        data["nodes"],
        key=lambda item: (
            rank.get(item.get("id", ""), len(rank) + 1000 + item.get("sort_order", 0)),
            item.get("level", 0),
            item.get("name", ""),
        ),
    )
    return {"nodes": nodes, "updated_at": data["updated_at"]}


def upsert_sector_node(payload: dict[str, Any]) -> dict[str, Any]:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("行业名称不能为空")
    data = load_sector_tree()
    nodes = data["nodes"]
    parent_id = (payload.get("parent_id") or "").strip()
    parent = next((item for item in nodes if item.get("id") == parent_id), None) if parent_id else None
    if parent_id and not parent:
        raise ValueError("父级行业不存在")
    node_id = (payload.get("id") or name).strip()
    level = (parent.get("level", 0) + 1) if parent else 0
    now = _now_iso()
    existing = next((item for item in nodes if item.get("id") == node_id), {})
    node = {
        "id": node_id,
        "name": name,
        "parent_id": parent_id,
        "level": level,
        "sort_order": int(payload.get("sort_order", existing.get("sort_order", len(nodes))) or 0),
        "description": (payload.get("description") or existing.get("description") or "").strip(),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    nodes = [item for item in nodes if item.get("id") != node_id]
    nodes.append(node)
    _atomic_json(SECTOR_TREE_FILE, {"nodes": nodes, "updated_at": now})
    return node


def save_sector_tree_order(ids: list[str]) -> dict[str, Any]:
    data = _read_json(SECTOR_TREE_FILE, _default_sector_tree())
    data.setdefault("nodes", [])
    known = {item.get("id", "") for item in data["nodes"]}
    clean = [item_id.strip() for item_id in ids if item_id and item_id.strip() in known]
    clean.extend(item.get("id", "") for item in data["nodes"] if item.get("id", "") not in clean)
    _atomic_json(SECTOR_TREE_ORDER_FILE, clean)
    return load_sector_tree()


def delete_sector_node(node_id: str) -> dict[str, Any]:
    target_id = (node_id or "").strip()
    if not target_id:
        raise ValueError("行业节点不能为空")

    data = _read_json(SECTOR_TREE_FILE, _default_sector_tree())
    nodes = data.get("nodes", [])
    if not any(item.get("id") == target_id for item in nodes):
        raise KeyError(target_id)

    children_by_parent: dict[str, list[str]] = {}
    for item in nodes:
        parent_id = (item.get("parent_id") or "").strip()
        if parent_id:
            children_by_parent.setdefault(parent_id, []).append(item.get("id", ""))

    to_delete = {target_id}
    queue = [target_id]
    while queue:
        current = queue.pop(0)
        for child_id in children_by_parent.get(current, []):
            if child_id and child_id not in to_delete:
                to_delete.add(child_id)
                queue.append(child_id)

    next_nodes = [item for item in nodes if item.get("id") not in to_delete]
    now = _now_iso()
    _atomic_json(SECTOR_TREE_FILE, {"nodes": next_nodes, "updated_at": now})

    saved_order = _read_json(SECTOR_TREE_ORDER_FILE, _default_sector_tree_order())
    if isinstance(saved_order, list):
        _atomic_json(SECTOR_TREE_ORDER_FILE, [item_id for item_id in saved_order if item_id not in to_delete])
    return load_sector_tree()


def _default_sector_indicators() -> dict[str, Any]:
    return {"items": [], "updated_at": _now_iso()}


def list_sector_indicators(sector: str | None = None) -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(SECTOR_INDICATORS_FILE, _default_sector_indicators())
    data.setdefault("items", [])
    data.setdefault("updated_at", _now_iso())
    items = data["items"]
    if sector:
        items = [item for item in items if item.get("sector") == sector]
    items = sorted(items, key=lambda item: (item.get("sector", ""), item.get("sort_order", 0), item.get("name", "")))
    return {"items": items, "updated_at": data["updated_at"]}


def upsert_sector_indicator(payload: dict[str, Any]) -> dict[str, Any]:
    sector = (payload.get("sector") or "").strip()
    name = (payload.get("name") or "").strip()
    if not sector:
        raise ValueError("行业不能为空")
    if not name:
        raise ValueError("指标名称不能为空")
    data = list_sector_indicators()
    items = data["items"]
    now = _now_iso()
    item_id = (payload.get("id") or f"{sector}-{name}").strip()
    existing = next((item for item in items if item.get("id") == item_id), {})
    indicator = {
        "id": item_id,
        "sector": sector,
        "name": name,
        "freq": (payload.get("freq") or existing.get("freq") or "月度").strip(),
        "chart_kind": (payload.get("chart_kind") or existing.get("chart_kind") or "line").strip(),
        "viewpoint": (payload.get("viewpoint") or existing.get("viewpoint") or "").strip(),
        "data_source": (payload.get("data_source") or existing.get("data_source") or "manual_or_ifind_placeholder").strip(),
        "sort_order": int(payload.get("sort_order", existing.get("sort_order", len(items))) or 0),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    items = [item for item in items if item.get("id") != item_id]
    items.append(indicator)
    _atomic_json(SECTOR_INDICATORS_FILE, {"items": items, "updated_at": now})
    return indicator


def reorder_sector_indicators(sector: str, ids: list[str]) -> dict[str, Any]:
    sector = (sector or "").strip()
    if not sector:
        raise ValueError("行业不能为空")
    ordered_ids = [item.strip() for item in ids if item and item.strip()]
    if not ordered_ids:
        raise ValueError("排序列表不能为空")

    data = _read_json(SECTOR_INDICATORS_FILE, _default_sector_indicators())
    data.setdefault("items", [])
    items = data["items"]
    sector_items = [item for item in items if item.get("sector") == sector]
    existing_ids = {item.get("id") for item in sector_items}
    if set(ordered_ids) != existing_ids:
        raise ValueError("排序列表与当前行业指标不一致")

    now = _now_iso()
    order_map = {item_id: index for index, item_id in enumerate(ordered_ids)}
    updated_items = []
    for item in items:
        if item.get("sector") != sector:
            updated_items.append(item)
            continue
        refreshed = dict(item)
        refreshed["sort_order"] = order_map[item["id"]]
        refreshed["updated_at"] = now
        updated_items.append(refreshed)

    _atomic_json(SECTOR_INDICATORS_FILE, {"items": updated_items, "updated_at": now})
    return list_sector_indicators(sector=sector)


def _default_stock_modules() -> dict[str, Any]:
    return {"items": [], "updated_at": _now_iso()}


def _default_sector_modules() -> dict[str, Any]:
    return {"items": [], "updated_at": _now_iso()}


def list_sector_modules(sector: str | None = None) -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(SECTOR_MODULES_FILE, _default_sector_modules())
    data.setdefault("items", [])
    data.setdefault("updated_at", _now_iso())
    items = data["items"]
    if sector:
        items = [item for item in items if item.get("sector") == sector]
    items = sorted(items, key=lambda item: (item.get("sector", ""), item.get("sort_order", 0), item.get("title", "")))
    return {"items": items, "updated_at": data["updated_at"]}


def upsert_sector_module(payload: dict[str, Any]) -> dict[str, Any]:
    sector = (payload.get("sector") or "").strip()
    title = (payload.get("title") or "").strip()
    if not sector:
        raise ValueError("行业不能为空")
    if not title:
        raise ValueError("模块标题不能为空")
    data = list_sector_modules()
    items = data["items"]
    now = _now_iso()
    module_id = (payload.get("id") or f"{sector}-{title}").strip()
    existing = next((item for item in items if item.get("id") == module_id), {})
    module = {
        "id": module_id,
        "sector": sector,
        "title": title,
        "category": (payload.get("category") or existing.get("category") or "自定义").strip(),
        "content": (payload.get("content") or existing.get("content") or "").strip(),
        "data_source": (payload.get("data_source") or existing.get("data_source") or "manual_or_public_placeholder").strip(),
        "sort_order": int(payload.get("sort_order", existing.get("sort_order", len(items))) or 0),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    items = [item for item in items if item.get("id") != module_id]
    items.append(module)
    _atomic_json(SECTOR_MODULES_FILE, {"items": items, "updated_at": now})
    return module


def reorder_sector_modules(sector: str, ids: list[str]) -> dict[str, Any]:
    sector = (sector or "").strip()
    if not sector:
        raise ValueError("行业不能为空")
    ordered_ids = [item.strip() for item in ids if item and item.strip()]
    if not ordered_ids:
        raise ValueError("排序列表不能为空")

    data = _read_json(SECTOR_MODULES_FILE, _default_sector_modules())
    data.setdefault("items", [])
    items = data["items"]
    sector_items = [item for item in items if item.get("sector") == sector]
    existing_ids = {item.get("id") for item in sector_items}
    if set(ordered_ids) != existing_ids:
        raise ValueError("排序列表与当前行业模块不一致")

    now = _now_iso()
    order_map = {module_id: index for index, module_id in enumerate(ordered_ids)}
    updated_items = []
    for item in items:
        if item.get("sector") != sector:
            updated_items.append(item)
            continue
        refreshed = dict(item)
        refreshed["sort_order"] = order_map[item["id"]]
        refreshed["updated_at"] = now
        updated_items.append(refreshed)

    _atomic_json(SECTOR_MODULES_FILE, {"items": updated_items, "updated_at": now})
    return list_sector_modules(sector=sector)


def list_stock_modules(ticker: str | None = None) -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(STOCK_MODULES_FILE, _default_stock_modules())
    data.setdefault("items", [])
    data.setdefault("updated_at", _now_iso())
    items = data["items"]
    if ticker:
        items = [item for item in items if item.get("ticker") == ticker]
    items = sorted(items, key=lambda item: (item.get("ticker", ""), item.get("sort_order", 0), item.get("title", "")))
    return {"items": items, "updated_at": data["updated_at"]}


def upsert_stock_module(payload: dict[str, Any]) -> dict[str, Any]:
    ticker = (payload.get("ticker") or "").strip()
    title = (payload.get("title") or "").strip()
    if not ticker:
        raise ValueError("个股代码不能为空")
    if not title:
        raise ValueError("模块标题不能为空")
    data = list_stock_modules()
    items = data["items"]
    now = _now_iso()
    module_id = (payload.get("id") or f"{ticker}-{title}").strip()
    existing = next((item for item in items if item.get("id") == module_id), {})
    module = {
        "id": module_id,
        "ticker": ticker,
        "title": title,
        "category": (payload.get("category") or existing.get("category") or "自定义").strip(),
        "content": (payload.get("content") or existing.get("content") or "").strip(),
        "data_source": (payload.get("data_source") or existing.get("data_source") or "manual_or_public_placeholder").strip(),
        "sort_order": int(payload.get("sort_order", existing.get("sort_order", len(items))) or 0),
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    items = [item for item in items if item.get("id") != module_id]
    items.append(module)
    _atomic_json(STOCK_MODULES_FILE, {"items": items, "updated_at": now})
    return module


def reorder_stock_modules(ticker: str, ids: list[str]) -> dict[str, Any]:
    ticker = (ticker or "").strip()
    if not ticker:
        raise ValueError("个股代码不能为空")
    ordered_ids = [item.strip() for item in ids if item and item.strip()]
    if not ordered_ids:
        raise ValueError("排序列表不能为空")

    data = _read_json(STOCK_MODULES_FILE, _default_stock_modules())
    data.setdefault("items", [])
    items = data["items"]
    stock_items = [item for item in items if item.get("ticker") == ticker]
    existing_ids = {item.get("id") for item in stock_items}
    if set(ordered_ids) != existing_ids:
        raise ValueError("排序列表与当前个股模块不一致")

    now = _now_iso()
    order_map = {module_id: index for index, module_id in enumerate(ordered_ids)}
    updated_items = []
    for item in items:
        if item.get("ticker") != ticker:
            updated_items.append(item)
            continue
        refreshed = dict(item)
        refreshed["sort_order"] = order_map[item["id"]]
        refreshed["updated_at"] = now
        updated_items.append(refreshed)

    _atomic_json(STOCK_MODULES_FILE, {"items": updated_items, "updated_at": now})
    return list_stock_modules(ticker=ticker)


def list_entries(kind: str | None = None, sector: str | None = None, stock: str | None = None) -> list[dict[str, Any]]:
    items = _load_entries()
    if kind:
        items = [item for item in items if item.get("type") == kind]
    if sector:
        items = [item for item in items if sector in item.get("related_sectors", [])]
    if stock:
        items = [item for item in items if stock in item.get("related_stocks", [])]
    ordered = sorted(items, key=lambda item: (item.get("date", ""), item.get("updated_at", "")), reverse=True)
    if kind:
        order_map = _load_entry_order()
        saved = order_map.get(kind, [])
        rank = {entry_id: index for index, entry_id in enumerate(saved)}
        fallback_rank = {item.get("id", ""): index for index, item in enumerate(ordered)}
        ordered = sorted(ordered, key=lambda item: (rank.get(item.get("id", ""), len(rank) + fallback_rank[item.get("id", "")]), fallback_rank[item.get("id", "")]))
    out = []
    for item in ordered:
        row = dict(item)
        row["content_preview"] = _read_content(row.get("path", ""))[:180]
        out.append(row)
    return out


def _read_content(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def get_entry(entry_id: str) -> dict[str, Any] | None:
    for item in _load_entries():
        if item["id"] == entry_id:
            hit = dict(item)
            hit["content"] = _read_content(hit.get("path", ""))
            return hit
    return None


def create_entry(payload: dict[str, Any]) -> dict[str, Any]:
    kind = payload.get("type", "memo")
    if kind not in VALID_TYPES:
        raise ValueError(f"不支持的条目类型：{kind}")
    if not payload.get("title", "").strip():
        raise ValueError("标题不能为空")
    content = (payload.get("content") or "").strip()
    meta = _entry_defaults(payload)
    body_path = _entry_dir(kind) / f"{meta['date']}-{meta['id']}.md"
    body_path.parent.mkdir(parents=True, exist_ok=True)
    body_path.write_text(content, encoding="utf-8")
    meta["path"] = str(body_path)
    entries = _load_entries()
    entries = [item for item in entries if item["id"] != meta["id"]]
    entries.append(meta)
    _save_entries(entries)
    return get_entry(meta["id"]) or meta


def update_entry(entry_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    entries = _load_entries()
    for idx, item in enumerate(entries):
        if item["id"] != entry_id:
            continue
        merged = dict(item)
        for key in ("title", "date", "type", "tags", "related_sectors", "related_stocks", "summary_text", "investment_view"):
            if key in payload and payload[key] is not None:
                merged[key] = payload[key]
        merged["updated_at"] = _now_iso()
        content = payload.get("content")
        if content is not None:
            Path(merged["path"]).write_text(content.strip(), encoding="utf-8")
        entries[idx] = _entry_defaults(merged)
        entries[idx]["path"] = merged["path"]
        entries[idx]["summary_text"] = merged.get("summary_text", "")
        entries[idx]["investment_view"] = merged.get("investment_view", "")
        entries[idx]["artifact_request"] = merged.get("artifact_request")
        _save_entries(entries)
        return get_entry(entry_id) or entries[idx]
    raise KeyError(entry_id)


def delete_entry(entry_id: str) -> bool:
    entries = _load_entries()
    for idx, item in enumerate(entries):
        if item["id"] != entry_id:
            continue
        Path(item["path"]).unlink(missing_ok=True)
        del entries[idx]
        _save_entries(entries)
        return True
    return False


def search_entries(query: str) -> list[dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return list_entries()
    hits = []
    for item in list_entries():
        haystack = " ".join([
            item.get("title", ""),
            " ".join(item.get("tags", [])),
            " ".join(item.get("related_sectors", [])),
            " ".join(item.get("related_stocks", [])),
            _read_content(item.get("path", "")),
        ]).lower()
        if q in haystack:
            hit = dict(item)
            hit["content_preview"] = _read_content(item.get("path", ""))[:180]
            hits.append(hit)
    return hits


def save_entry_order(kind: str, ids: list[str]) -> list[dict[str, Any]]:
    kind = (kind or "").strip()
    if kind not in VALID_TYPES:
        raise ValueError("条目类型不支持排序")
    entries = _load_entries()
    typed_ids = [item["id"] for item in entries if item.get("type") == kind]
    known = set(typed_ids)
    clean = [entry_id.strip() for entry_id in ids if entry_id and entry_id.strip() in known]
    clean.extend(entry_id for entry_id in typed_ids if entry_id not in clean)
    order_map = _load_entry_order()
    order_map[kind] = clean
    _save_entry_order(order_map)
    return list_entries(kind=kind)


def list_calendar_events(view: str = "upcoming", importance: str | None = None) -> list[dict[str, Any]]:
    events = _load_calendar()
    if importance:
        events = [item for item in events if item.get("importance") == importance]
    events = sorted(events, key=lambda item: (item.get("date", ""), item.get("title", "")))
    if view == "grouped":
        return events
    return events


def upsert_calendar_event(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload.get("title", "").strip():
        raise ValueError("事件标题不能为空")
    if not payload.get("date", "").strip():
        raise ValueError("事件日期不能为空")
    now = _now_iso()
    event = {
        "id": payload.get("id") or f"cal-{datetime.now(BEIJING):%Y%m%d%H%M%S}-{_slugify(payload.get('title', 'event'))}",
        "title": payload["title"].strip(),
        "date": payload["date"].strip(),
        "category": payload.get("category", "manual"),
        "importance": payload.get("importance", "medium"),
        "source": payload.get("source", "manual"),
        "notes": payload.get("notes", ""),
        "created_at": payload.get("created_at") or now,
        "updated_at": now,
    }
    events = _load_calendar()
    events = [item for item in events if item["id"] != event["id"]]
    events.append(event)
    _save_calendar(events)
    return event


def generate_entry_summary(entry_id: str) -> dict[str, Any]:
    entry = get_entry(entry_id)
    if not entry:
        raise KeyError(entry_id)
    lines = [line.strip() for line in entry.get("content", "").splitlines() if line.strip()]
    summary = "；".join(lines[:2])[:180]
    entries = _load_entries()
    for item in entries:
        if item["id"] == entry_id:
            item["summary_status"] = "ready"
            item["summary_text"] = summary
            item["updated_at"] = _now_iso()
    _save_entries(entries)
    refreshed = get_entry(entry_id) or entry
    refreshed["summary_status"] = "ready"
    refreshed["summary_text"] = summary
    return refreshed


def generate_entry_image_artifact(entry_id: str) -> dict[str, Any]:
    entry = get_entry(entry_id)
    if not entry:
        raise KeyError(entry_id)
    request = {
        "entry_id": entry_id,
        "title": entry["title"],
        "type": entry["type"],
        "requested_at": _now_iso(),
        "summary_text": entry.get("summary_text", ""),
        "status": "prepared",
    }
    _atomic_json(ARTIFACT_DIR / f"{entry_id}.json", request)
    entries = _load_entries()
    for item in entries:
        if item["id"] == entry_id:
            item["image_artifact_status"] = "prepared"
            item["artifact_request"] = request
            item["updated_at"] = _now_iso()
    _save_entries(entries)
    refreshed = get_entry(entry_id) or entry
    refreshed["image_artifact_status"] = "prepared"
    refreshed["artifact_request"] = request
    return refreshed
