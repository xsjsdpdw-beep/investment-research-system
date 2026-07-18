"""本地文件优先的知识库 / 日历 / 关注列表存储层。"""

from __future__ import annotations

import json
import os
import re
import tempfile
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import data_adapters

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
OVERVIEW_WORKBENCH_FILE = DIRS["indexes"] / "overview_workbench.json"
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
VALID_OVERVIEW_SCOPE_TYPES = {"sector", "stock"}
VALID_OVERVIEW_SOURCE_TYPES = {"report", "attachment", "note", "expert_call"}
VALID_OVERVIEW_CANDIDATE_STATES = {"pending", "accepted", "ignored", "later"}
VALID_OVERVIEW_APPLY_ACTIONS = {"replace", "append", "partial", "ignore"}
VALID_STRUCTURED_RENDER_BLOCK_TYPES = {
    "section",
    "paragraph",
    "bullet_list",
    "quote",
    "table",
    "metric_grid",
    "timeline",
    "process_flow",
    "industry_chain",
    "comparison_cards",
    "image",
    "chart_spec",
    "source_ref",
}


def _overview_source_label(source_type: str | None) -> str:
    if source_type == "report":
        return "研报"
    if source_type == "attachment":
        return "附件"
    if source_type == "note":
        return "纪要"
    if source_type == "expert_call":
        return "专家会"
    return source_type or "候选"


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


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", (text or "").replace("&nbsp;", " "))).strip()


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
    with tempfile.NamedTemporaryFile(
        "w",
        suffix=".tmp",
        prefix=f"{path.name}.",
        dir=path.parent,
        encoding="utf-8",
        delete=False,
    ) as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2))
        tmp = Path(handle.name)
    tmp.replace(path)


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return deepcopy(default)


def _default_overview_workbench() -> dict[str, Any]:
    return {"items": [], "updated_at": _now_iso()}


def _load_overview_workbench() -> dict[str, Any]:
    _ensure_dirs()
    data = _read_json(OVERVIEW_WORKBENCH_FILE, _default_overview_workbench())
    data.setdefault("items", [])
    data.setdefault("updated_at", _now_iso())
    return data


def _save_overview_workbench(items: list[dict[str, Any]]) -> None:
    _atomic_json(OVERVIEW_WORKBENCH_FILE, {"items": items, "updated_at": _now_iso()})


def _normalize_overview_scope_type(scope_type: str) -> str:
    scope = (scope_type or "").strip()
    if scope not in VALID_OVERVIEW_SCOPE_TYPES:
        raise ValueError("概览对象类型只支持 sector 或 stock")
    return scope


def _normalize_overview_source_type(source_type: str) -> str:
    source = (source_type or "").strip()
    if source not in VALID_OVERVIEW_SOURCE_TYPES:
        raise ValueError("候选来源类型不支持")
    return source


def normalize_structured_render_block(block: dict[str, Any], index: int = 0) -> dict[str, Any]:
    raw_type = (block.get("type") or "paragraph").strip()
    normalized_type = raw_type if raw_type in VALID_STRUCTURED_RENDER_BLOCK_TYPES else "paragraph"
    return {
        "id": (block.get("id") or f"render-block-{index}").strip(),
        "type": normalized_type,
        "title": (block.get("title") or "").strip(),
        "section_key": (block.get("section_key") or "").strip(),
        "content": block.get("content") or "",
        "items": deepcopy(block.get("items") or []),
        "table": deepcopy(block.get("table") or {}),
        "image": deepcopy(block.get("image") or {}),
        "chart_spec": deepcopy(block.get("chart_spec") or {}),
        "source_refs": deepcopy(block.get("source_refs") or []),
        "children": [
            normalize_structured_render_block(child, child_index)
            for child_index, child in enumerate(block.get("children") or [])
            if isinstance(child, dict)
        ],
        "render_hint": deepcopy(block.get("render_hint") or {}),
    }


def normalize_structured_render_blocks(blocks: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [
        normalize_structured_render_block(block, index)
        for index, block in enumerate(blocks or [])
        if isinstance(block, dict)
    ]


def _overview_record_defaults(scope_type: str, scope_id: str, record: dict[str, Any] | None = None) -> dict[str, Any]:
    now = _now_iso()
    current = deepcopy(record or {})
    return {
        "scope_type": scope_type,
        "scope_id": scope_id,
        "draft": {
            "summary": current.get("draft", {}).get("summary", ""),
            "modules": current.get("draft", {}).get("modules", []) or [],
            "sources": current.get("draft", {}).get("sources", []) or [],
            "updated_at": current.get("draft", {}).get("updated_at") or now,
            "keywords": current.get("draft", {}).get("keywords", []) or [],
        },
        "deep_cards": current.get("deep_cards", []) or [],
        "candidates": current.get("candidates", []) or [],
        "versions": current.get("versions", []) or [],
        "editor_binding": current.get("editor_binding", {}) or {},
        "draft_structured_blocks": normalize_structured_render_blocks(current.get("draft_structured_blocks") or []),
        "deep_structured_blocks": normalize_structured_render_blocks(current.get("deep_structured_blocks") or []),
        "draft_theme_schema": deepcopy(current.get("draft_theme_schema") or {}),
        "updated_at": current.get("updated_at") or now,
    }


def _normalize_chart_blocks(chart_blocks: Any) -> list[dict[str, Any]]:
    out = []
    for block in chart_blocks or []:
        if not isinstance(block, dict):
            continue
        out.append(
            {
                "type": (block.get("type") or "text").strip(),
                "title": (block.get("title") or "").strip(),
                "spec": deepcopy(block.get("spec") or {}),
            }
        )
    return out


def _normalize_content_blocks(blocks: Any, card_id: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for index, block in enumerate(blocks or []):
        if not isinstance(block, dict):
            continue
        block_type = (block.get("type") or "text").strip()
        normalized = {
            "id": (block.get("id") or f"{card_id}-block-{index + 1}").strip(),
            "type": block_type if block_type in {"section", "text", "image", "chart", "source"} else "text",
            "title": (block.get("title") or "").strip(),
            "text": (block.get("text") or "").strip(),
            "image_url": (block.get("image_url") or "").strip(),
            "caption": (block.get("caption") or "").strip(),
            "source_label": (block.get("source_label") or "").strip(),
            "url": (block.get("url") or "").strip(),
            "note": (block.get("note") or "").strip(),
            "spec": deepcopy(block.get("spec") or {}),
            "children": [],
        }
        if normalized["type"] == "section":
            normalized["children"] = _normalize_content_blocks(block.get("children") or [], normalized["id"])
        out.append(normalized)
    return out


def _content_blocks_from_legacy(card_id: str, body: str, image_blocks: list[dict[str, Any]], chart_blocks: list[dict[str, Any]], source_blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    section_children: list[dict[str, Any]] = []
    if body.strip():
        section_children.append({
            "id": f"{card_id}-text-1",
            "type": "text",
            "title": "",
            "text": body.strip(),
            "children": [],
        })
    for index, block in enumerate(image_blocks):
        section_children.append(
            {
                "id": block.get("id") or f"{card_id}-image-{index + 1}",
                "type": "image",
                "title": (block.get("title") or "").strip(),
                "image_url": (block.get("image_url") or "").strip(),
                "caption": (block.get("caption") or "").strip(),
                "source_label": (block.get("source_label") or "").strip(),
                "children": [],
            }
        )
    for index, block in enumerate(chart_blocks):
        section_children.append(
            {
                "id": f"{card_id}-chart-{index + 1}",
                "type": "chart",
                "title": (block.get("title") or "").strip(),
                "note": str((block.get("spec") or {}).get("note") or "").strip(),
                "spec": deepcopy(block.get("spec") or {}),
                "children": [],
            }
        )
    for index, block in enumerate(source_blocks):
        section_children.append(
            {
                "id": block.get("id") or f"{card_id}-source-{index + 1}",
                "type": "source",
                "title": (block.get("label") or "").strip(),
                "url": (block.get("url") or "").strip(),
                "note": (block.get("note") or "").strip(),
                "children": [],
            }
        )
    if section_children:
        blocks.append(
            {
                "id": f"{card_id}-section-1",
                "type": "section",
                "title": "核心内容",
                "children": section_children,
            }
        )
    return blocks


def _flatten_content_blocks(blocks: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    text_parts: list[str] = []
    image_blocks: list[dict[str, Any]] = []
    chart_blocks: list[dict[str, Any]] = []
    source_blocks: list[dict[str, Any]] = []

    def walk(items: list[dict[str, Any]], prefix: list[int]) -> None:
        section_index = 0
        for block in items:
            block_type = block.get("type")
            if block_type == "section":
                section_index += 1
                number = ".".join(str(part) for part in [*prefix, section_index])
                title = (block.get("title") or "").strip()
                if title:
                    text_parts.append(f"{number} {title}")
                walk(block.get("children") or [], [*prefix, section_index])
            elif block_type == "text":
                text = _strip_html((block.get("text") or "").strip())
                if text:
                    text_parts.append(text)
            elif block_type == "image":
                image_blocks.append(
                    {
                        "id": (block.get("id") or "").strip(),
                        "title": (block.get("title") or "").strip(),
                        "image_url": (block.get("image_url") or "").strip(),
                        "caption": (block.get("caption") or "").strip(),
                        "source_label": (block.get("source_label") or "").strip(),
                    }
                )
            elif block_type == "chart":
                chart_blocks.append(
                    {
                        "type": "line",
                        "title": (block.get("title") or "").strip(),
                        "spec": deepcopy(block.get("spec") or {}),
                    }
                )
            elif block_type == "source":
                source_blocks.append(
                    {
                        "id": (block.get("id") or "").strip(),
                        "label": (block.get("title") or "").strip(),
                        "url": (block.get("url") or "").strip(),
                        "note": (block.get("note") or "").strip(),
                    }
                )

    walk(blocks, [])
    return "\n\n".join(part for part in text_parts if part.strip()), image_blocks, chart_blocks, source_blocks


def _structured_blocks_to_content_blocks(blocks: list[dict[str, Any]], parent_id: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            continue
        block_type = (block.get("type") or "paragraph").strip()
        block_id = (block.get("id") or f"{parent_id}-structured-{index + 1}").strip()
        title = (block.get("title") or "").strip()
        content = (block.get("content") or "").strip()
        children = normalize_structured_render_blocks(block.get("children") or [])
        if block_type == "section":
            out.append(
                {
                    "id": block_id,
                    "type": "section",
                    "title": title or "结构化章节",
                    "children": _structured_blocks_to_content_blocks(children, block_id),
                }
            )
            continue
        if block_type == "image":
            image_payload = block.get("image") or {}
            out.append(
                {
                    "id": block_id,
                    "type": "image",
                    "title": title,
                    "image_url": (image_payload.get("url") or image_payload.get("image_url") or "").strip(),
                    "caption": (image_payload.get("caption") or content or "").strip(),
                    "source_label": "",
                    "children": [],
                }
            )
            continue
        if block_type == "chart_spec":
            out.append(
                {
                    "id": block_id,
                    "type": "chart",
                    "title": title or "结构化图表",
                    "note": content,
                    "spec": deepcopy(block.get("chart_spec") or {}),
                    "children": [],
                }
            )
            continue
        if block_type == "source_ref":
            source_payload = (block.get("source_refs") or [{}])[0] if (block.get("source_refs") or []) else {}
            out.append(
                {
                    "id": block_id,
                    "type": "source",
                    "title": title or "来源",
                    "url": (source_payload.get("url") or "").strip(),
                    "note": content,
                    "children": [],
                }
            )
            continue
        if block_type in {"bullet_list", "timeline", "process_flow", "industry_chain", "comparison_cards", "metric_grid", "table", "quote"}:
            rendered = content
            if block_type == "table":
                table = block.get("table") or {}
                headers = table.get("headers") or []
                rows = table.get("rows") or []
                table_lines = []
                if headers:
                    table_lines.append("| " + " | ".join(str(item) for item in headers) + " |")
                    table_lines.append("| " + " | ".join("---" for _ in headers) + " |")
                for row in rows:
                    table_lines.append("| " + " | ".join(str(item) for item in row) + " |")
                rendered = "\n".join(table_lines).strip()
            elif block.get("items"):
                rendered = "\n".join(f"- {item}" for item in block.get("items") or [])
            out.append(
                {
                    "id": block_id,
                    "type": "text",
                    "title": title,
                    "text": rendered.strip(),
                    "children": [],
                }
            )
            continue
        out.append(
            {
                "id": block_id,
                "type": "text",
                "title": title,
                "text": content,
                "children": [],
            }
        )
    return out


def _candidate_to_content_block(candidate: dict[str, Any], card_id: str, target_block: str) -> dict[str, Any]:
    suffix = datetime.now(BEIJING).strftime("%Y%m%d%H%M%S")
    base_id = f"{card_id}-candidate-{suffix}-{_slugify(candidate.get('id') or candidate.get('title') or 'patch')}"
    block_type = (target_block or candidate.get("target_block") or "body").strip()
    patch_text = (candidate.get("proposed_patch") or candidate.get("summary") or "").strip()
    source_title = (candidate.get("source_title") or candidate.get("title") or "").strip()
    source_url = (candidate.get("source_url") or "").strip()
    structured_blocks = normalize_structured_render_blocks(candidate.get("structured_blocks") or [])
    if structured_blocks:
        return {
            "id": f"{base_id}-structured",
            "type": "section",
            "title": candidate.get("title") or "候选更新",
            "children": _structured_blocks_to_content_blocks(structured_blocks, f"{base_id}-structured"),
        }
    if block_type == "source":
        return {
            "id": f"{base_id}-source",
            "type": "source",
            "title": source_title or "新增来源",
            "url": source_url,
            "note": patch_text,
            "children": [],
        }
    if block_type == "image":
        return {
            "id": f"{base_id}-image",
            "type": "image",
            "title": source_title or "新增图片",
            "image_url": source_url,
            "caption": patch_text,
            "source_label": _overview_source_label(candidate.get("source_type")),
            "children": [],
        }
    if block_type == "chart":
        return {
            "id": f"{base_id}-chart",
            "type": "chart",
            "title": source_title or "新增图表",
            "note": patch_text,
            "spec": {"note": patch_text},
            "children": [],
        }
    return {
        "id": f"{base_id}-text",
        "type": "text",
        "text": patch_text,
        "children": [],
    }


def _find_block(blocks: list[dict[str, Any]], block_id: str) -> dict[str, Any] | None:
    for block in blocks:
        if block.get("id") == block_id:
            return block
        children = block.get("children") or []
        if children:
            found = _find_block(children, block_id)
            if found:
                return found
    return None


def _insert_block_relative(blocks: list[dict[str, Any]], anchor_id: str, new_block: dict[str, Any]) -> list[dict[str, Any]]:
    next_blocks = deepcopy(blocks)

    def insert_in(items: list[dict[str, Any]]) -> bool:
        for index, block in enumerate(items):
            if block.get("id") == anchor_id:
                if block.get("type") == "section":
                    children = list(block.get("children") or [])
                    children.append(new_block)
                    block["children"] = children
                else:
                    items.insert(index + 1, new_block)
                return True
            children = block.get("children") or []
            if children and insert_in(children):
                return True
        return False

    if insert_in(next_blocks):
        return next_blocks
    next_blocks.append(new_block)
    return next_blocks


def _replace_block_content(blocks: list[dict[str, Any]], block_id: str, new_block: dict[str, Any]) -> list[dict[str, Any]]:
    next_blocks = deepcopy(blocks)

    def replace_in(items: list[dict[str, Any]]) -> bool:
        for index, block in enumerate(items):
            if block.get("id") == block_id:
                if block.get("type") == "text" and new_block.get("type") == "text":
                    block["text"] = new_block.get("text", "")
                elif block.get("type") == "section":
                    children = list(block.get("children") or [])
                    children.append(new_block)
                    block["children"] = children
                else:
                    items[index] = new_block
                return True
            children = block.get("children") or []
            if children and replace_in(children):
                return True
        return False

    if replace_in(next_blocks):
        return next_blocks
    next_blocks.append(new_block)
    return next_blocks


def _normalize_deep_card(card: dict[str, Any], index: int) -> dict[str, Any]:
    now = _now_iso()
    card_id = (card.get("id") or f"card-{index + 1}").strip()
    body = (card.get("body") or "").strip()
    image_blocks = []
    for image_index, block in enumerate(card.get("image_blocks") or []):
        if not isinstance(block, dict):
            continue
        image_blocks.append(
            {
                "id": (block.get("id") or f"{card_id}-image-{image_index + 1}").strip(),
                "title": (block.get("title") or "").strip(),
                "image_url": (block.get("image_url") or "").strip(),
                "caption": (block.get("caption") or "").strip(),
                "source_label": (block.get("source_label") or "").strip(),
            }
        )
    source_blocks = []
    for source_index, block in enumerate(card.get("source_blocks") or []):
        if not isinstance(block, dict):
            continue
        source_blocks.append(
            {
                "id": (block.get("id") or f"{card_id}-source-{source_index + 1}").strip(),
                "label": (block.get("label") or "").strip(),
                "url": (block.get("url") or "").strip(),
                "note": (block.get("note") or "").strip(),
            }
        )
    content_blocks = _normalize_content_blocks(card.get("content_blocks"), card_id)
    if not content_blocks:
        content_blocks = _content_blocks_from_legacy(card_id, body, image_blocks, _normalize_chart_blocks(card.get("chart_blocks")), source_blocks)
    flattened_body, flattened_images, flattened_charts, flattened_sources = _flatten_content_blocks(content_blocks)
    return {
        "id": card_id,
        "title": (card.get("title") or card_id).strip(),
        "body": flattened_body or body,
        "preview_text": (card.get("preview_text") or "\n".join((flattened_body or body).splitlines()[:3])).strip(),
        "content_blocks": content_blocks,
        "image_blocks": flattened_images or image_blocks,
        "chart_blocks": flattened_charts or _normalize_chart_blocks(card.get("chart_blocks")),
        "source_blocks": flattened_sources or source_blocks,
        "status": (card.get("status") or "active").strip(),
        "sources": deepcopy(card.get("sources") or []),
        "updated_at": card.get("updated_at") or now,
    }


def _normalize_candidate(candidate: dict[str, Any], source_type: str, index: int) -> dict[str, Any]:
    now = _now_iso()
    state = (candidate.get("status") or "pending").strip()
    if state not in VALID_OVERVIEW_CANDIDATE_STATES:
        state = "pending"
    candidate_id = (candidate.get("id") or f"{source_type}-{datetime.now(BEIJING):%Y%m%d%H%M%S}-{index}").strip()
    return {
        "id": candidate_id,
        "source_type": source_type,
        "title": (candidate.get("title") or candidate_id).strip(),
        "summary": (candidate.get("summary") or "").strip(),
        "source_title": (candidate.get("source_title") or candidate.get("title") or "").strip(),
        "source_url": (candidate.get("source_url") or "").strip(),
        "matched_card_id": (candidate.get("matched_card_id") or "").strip(),
        "target_block": (candidate.get("target_block") or "body").strip(),
        "proposed_patch": (candidate.get("proposed_patch") or candidate.get("summary") or "").strip(),
        "source_entry_id": (candidate.get("source_entry_id") or "").strip(),
        "structured_blocks": normalize_structured_render_blocks(candidate.get("structured_blocks") or []),
        "render_recipe": deepcopy(candidate.get("render_recipe") or {}),
        "diff_preview": deepcopy(candidate.get("diff_preview") or {}),
        "status": state,
        "created_at": candidate.get("created_at") or now,
        "updated_at": now,
    }


def _get_or_create_overview_record(scope_type: str, scope_id: str) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    scope = _normalize_overview_scope_type(scope_type)
    key = (scope_id or "").strip()
    if not key:
        raise ValueError("概览对象不能为空")
    data = _load_overview_workbench()
    items = data["items"]
    for index, item in enumerate(items):
        if item.get("scope_type") == scope and item.get("scope_id") == key:
            return _overview_record_defaults(scope, key, item), items, index
    record = _overview_record_defaults(scope, key)
    items.append(record)
    return record, items, len(items) - 1


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


def get_overview_workbench(scope_type: str, scope_id: str) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)


def save_overview_draft(scope_type: str, scope_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    now = _now_iso()
    record["draft"] = {
        "summary": (payload.get("summary") or "").strip(),
        "modules": deepcopy(payload.get("modules") or []),
        "sources": deepcopy(payload.get("sources") or []),
        "keywords": deepcopy(payload.get("keywords") or []),
        "updated_at": now,
    }
    record["updated_at"] = now
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)


def save_overview_deep_cards(scope_type: str, scope_id: str, cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    now = _now_iso()
    record["deep_cards"] = [_normalize_deep_card(card, card_index) for card_index, card in enumerate(cards)]
    for card in record["deep_cards"]:
        card["updated_at"] = now
    record["updated_at"] = now
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record["deep_cards"])


def save_overview_structured_preview(scope_type: str, scope_id: str, draft_blocks: list[dict[str, Any]], deep_blocks: list[dict[str, Any]]) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    record["draft_structured_blocks"] = normalize_structured_render_blocks(draft_blocks)
    record["deep_structured_blocks"] = normalize_structured_render_blocks(deep_blocks)
    record["updated_at"] = _now_iso()
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)


def save_overview_draft_theme_schema(scope_type: str, scope_id: str, schema: dict[str, Any] | None) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    record["draft_theme_schema"] = deepcopy(schema or {})
    record["updated_at"] = _now_iso()
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)


def get_overview_editor_binding(scope_type: str, scope_id: str) -> dict[str, Any]:
    record = get_overview_workbench(scope_type, scope_id)
    binding = deepcopy(record.get("editor_binding") or {})
    binding.setdefault("provider", "")
    binding.setdefault("file_id", "")
    binding.setdefault("title", "")
    binding.setdefault("parent_id", "")
    binding.setdefault("content", "")
    binding.setdefault("preview", "")
    binding.setdefault("updated_at", "")
    binding.setdefault("last_synced_at", "")
    binding.setdefault("structured_parser_version", "")
    return binding


def save_overview_editor_binding(scope_type: str, scope_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    current = deepcopy(record.get("editor_binding") or {})
    now = _now_iso()
    binding = {
        "provider": (payload.get("provider") or current.get("provider") or "youdao").strip(),
        "file_id": (payload.get("file_id") or current.get("file_id") or "").strip(),
        "title": (payload.get("title") or current.get("title") or "").strip(),
        "parent_id": (payload.get("parent_id") or current.get("parent_id") or "").strip(),
        "content": payload.get("content") if payload.get("content") is not None else current.get("content", ""),
        "preview": payload.get("preview") if payload.get("preview") is not None else current.get("preview", ""),
        "updated_at": now,
        "last_synced_at": payload.get("last_synced_at") or current.get("last_synced_at") or "",
        "structured_parser_version": payload.get("structured_parser_version") or current.get("structured_parser_version") or "",
    }
    record["editor_binding"] = binding
    record["updated_at"] = now
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(binding)


def clear_overview_editor_binding(scope_type: str, scope_id: str, message: str = "") -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    now = _now_iso()
    binding = {
        "provider": "youdao",
        "file_id": "",
        "title": "",
        "parent_id": "",
        "content": "",
        "preview": "",
        "updated_at": now,
        "last_synced_at": "",
    }
    if message:
        binding["message"] = message
    record["editor_binding"] = binding
    record["updated_at"] = now
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(binding)


def append_overview_candidates(scope_type: str, scope_id: str, source_type: str, candidates: list[dict[str, Any]]) -> dict[str, Any]:
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    source = _normalize_overview_source_type(source_type)
    now = _now_iso()
    existing = {item.get("id"): item for item in record["candidates"]}
    for candidate_index, candidate in enumerate(candidates):
        normalized = _normalize_candidate(candidate, source, candidate_index)
        existing[normalized["id"]] = normalized
    record["candidates"] = sorted(existing.values(), key=lambda item: (item.get("created_at", ""), item.get("id", "")), reverse=True)
    record["updated_at"] = now
    items[index] = record
    _save_overview_workbench(items)
    return deepcopy(record)


def list_overview_versions(scope_type: str, scope_id: str, card_id: str | None = None) -> list[dict[str, Any]]:
    record = get_overview_workbench(scope_type, scope_id)
    versions = record["versions"]
    if card_id:
        target = (card_id or "").strip()
        versions = [item for item in versions if item.get("card_id") == target]
    return sorted(versions, key=lambda item: (item.get("created_at", ""), item.get("version_id", "")), reverse=True)


def apply_overview_candidate(scope_type: str, scope_id: str, candidate_id: str, action: str, payload: dict[str, Any]) -> dict[str, Any]:
    normalized_action = (action or "").strip()
    if normalized_action not in VALID_OVERVIEW_APPLY_ACTIONS:
        raise ValueError("候选处理动作不支持")
    record, items, index = _get_or_create_overview_record(scope_type, scope_id)
    target_id = (candidate_id or "").strip()
    candidate = next((item for item in record["candidates"] if item.get("id") == target_id), None)
    if not candidate:
        raise KeyError(target_id)
    now = _now_iso()
    if normalized_action == "ignore":
        candidate["status"] = "ignored"
        candidate["updated_at"] = now
        record["updated_at"] = now
        items[index] = record
        _save_overview_workbench(items)
        return {"candidate": deepcopy(candidate), "card": None, "version": None}

    card_id = (payload.get("card_id") or candidate.get("matched_card_id") or "").strip()
    if not card_id:
        raise ValueError("缺少命中的深度卡片")
    card = next((item for item in record["deep_cards"] if item.get("id") == card_id), None)
    if not card:
        raise KeyError(card_id)

    before_snapshot = {
        "title": card.get("title", ""),
        "body": card.get("body", ""),
        "chart_blocks": deepcopy(card.get("chart_blocks") or []),
        "content_blocks": deepcopy(card.get("content_blocks") or []),
    }
    proposed_patch = (candidate.get("proposed_patch") or candidate.get("summary") or "").strip()
    current_body = card.get("body", "")
    current_blocks = _normalize_content_blocks(card.get("content_blocks"), card_id)
    if not current_blocks:
        current_blocks = _content_blocks_from_legacy(
            card_id,
            current_body,
            card.get("image_blocks") or [],
            _normalize_chart_blocks(card.get("chart_blocks")),
            card.get("source_blocks") or [],
        )
    target_anchor_id = (payload.get("target_anchor_id") or "").strip()
    target_block = (payload.get("target_block") or candidate.get("target_block") or "body").strip()
    candidate_block = _candidate_to_content_block(candidate, card_id, target_block)
    anchor_block = _find_block(current_blocks, target_anchor_id) if target_anchor_id else None

    if normalized_action == "replace" and target_anchor_id and anchor_block:
        next_blocks = _replace_block_content(current_blocks, target_anchor_id, candidate_block)
    elif normalized_action in {"append", "partial", "replace"} and target_anchor_id:
        next_blocks = _insert_block_relative(current_blocks, target_anchor_id, candidate_block)
    elif normalized_action == "replace":
        next_blocks = [candidate_block]
    elif normalized_action == "append":
        next_blocks = [*deepcopy(current_blocks), candidate_block]
    else:
        next_blocks = [*deepcopy(current_blocks), candidate_block]

    next_body, next_images, next_charts, next_sources = _flatten_content_blocks(next_blocks)
    if normalized_action == "partial" and not next_body.strip():
        next_body = (payload.get("merged_body") or proposed_patch or current_body).strip()

    card["content_blocks"] = next_blocks
    card["body"] = next_body
    card["image_blocks"] = next_images
    card["chart_blocks"] = next_charts
    card["source_blocks"] = next_sources
    card["preview_text"] = (card.get("preview_text") or "\n".join(next_body.splitlines()[:3])).strip() or "\n".join(next_body.splitlines()[:3]).strip()
    card["updated_at"] = now
    candidate["status"] = "accepted"
    candidate["matched_card_id"] = card_id
    candidate["updated_at"] = now
    version = {
        "version_id": f"ver-{datetime.now(BEIJING):%Y%m%d%H%M%S}-{_slugify(card_id)}",
        "card_id": card_id,
        "action_type": normalized_action,
        "source_type": candidate.get("source_type", ""),
        "source_title": candidate.get("source_title") or candidate.get("title") or "",
        "before_snapshot": before_snapshot,
        "after_snapshot": {
            "title": card.get("title", ""),
            "body": card.get("body", ""),
            "chart_blocks": deepcopy(card.get("chart_blocks") or []),
            "content_blocks": deepcopy(card.get("content_blocks") or []),
        },
        "change_summary": (payload.get("change_summary") or f"{candidate.get('title') or '候选项'} -> {card.get('title') or card_id}").strip(),
        "created_at": now,
    }
    record["versions"].append(version)
    record["updated_at"] = now
    items[index] = record
    _save_overview_workbench(items)
    return {"candidate": deepcopy(candidate), "card": deepcopy(card), "version": deepcopy(version)}


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
    auto_events = data_adapters.auto_calendar_events(load_watchlist())
    existing_ids = {item.get("id") for item in events}
    events.extend(item for item in auto_events if item.get("id") not in existing_ids)
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
