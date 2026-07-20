"""AlphaEngine 本地桥接。

职责：
- 调本机 alphaengine-bridge 查询纪要/摘要
- 统一解析 JSON / SSE 输出
- 归一化成投研系统可消费的轻量结构
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_BRIDGE = "/Users/leo/Documents/Codex/2026-07-19/bang-2/outputs/alphaengine-bridge/bin/alphaengine-bridge"
DEFAULT_AUTH = "/Users/leo/.alphaengine-auth.json"
TZ = timezone(timedelta(hours=8))


def _bridge_path() -> str:
    return os.environ.get("ALPHAENGINE_BRIDGE", DEFAULT_BRIDGE)


def _auth_file() -> str:
    return os.environ.get("ALPHAENGINE_AUTH_FILE", DEFAULT_AUTH)


def _ensure_runtime_ready() -> None:
    bridge = Path(_bridge_path())
    auth = Path(_auth_file())
    if not bridge.exists():
        raise FileNotFoundError(f"AlphaEngine bridge 不存在：{bridge}")
    if not auth.exists():
        raise FileNotFoundError(f"AlphaEngine 认证文件不存在：{auth}")


def _parse_time(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, (int, float)):
        if value > 10_000_000_000:
            value = value / 1000
        return datetime.fromtimestamp(value, TZ).strftime("%Y-%m-%d %H:%M:%S")
    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=TZ).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return text


def _parse_sse_or_json(stdout: str) -> dict[str, Any]:
    payload = (stdout or "").strip()
    if not payload:
        return {}
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        pass

    final_payload: dict[str, Any] | None = None
    for line in payload.splitlines():
        text = line.strip()
        if not text.startswith("data:"):
            continue
        try:
            event = json.loads(text[5:].strip())
        except json.JSONDecodeError:
            continue
        if event.get("id") == "_final" and isinstance(event.get("content"), dict):
            final_payload = event["content"]
    return final_payload or {}


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()


def search_notes(query: str, *, page_size: int = 5, max_pages: int = 1) -> list[dict[str, Any]]:
    search_query = (query or "").strip()
    if not search_query:
        raise ValueError("AlphaEngine 查询词不能为空")

    _ensure_runtime_ready()
    env = os.environ.copy()
    env["ALPHAENGINE_AUTH_FILE"] = _auth_file()

    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for page_num in range(1, max(max_pages, 1) + 1):
        payload = {"query": search_query, "pageNum": page_num, "pageSize": max(page_size, 1)}
        proc = subprocess.run(
            [_bridge_path(), "summary-search", "--json", json.dumps(payload, ensure_ascii=False)],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "AlphaEngine 查询失败")
        data = _parse_sse_or_json(proc.stdout)
        if data.get("success") is False:
            msg = str(data.get("msg") or "AlphaEngine 查询失败").strip()
            detail = data.get("data") if isinstance(data.get("data"), dict) else {}
            code = str(detail.get("code") or data.get("code") or "").strip()
            description = str(detail.get("description") or "").strip()
            parts = [part for part in [msg, code, description] if part]
            raise RuntimeError(" / ".join(parts))
        results = data.get("results", [])
        if not isinstance(results, list) or not results:
            continue
        for row in results:
            item = {
                "id": row.get("doc_id") or row.get("summary_id") or row.get("id") or row.get("title_cn") or row.get("title") or "",
                "title": _strip_html(str(row.get("title_cn") or row.get("title") or row.get("search_title") or "AlphaEngine 纪要")),
                "publish_time": _parse_time(row.get("publish_time") or row.get("rank_date")),
                "institution": "、".join(map(str, row.get("institution_name") or [])) if isinstance(row.get("institution_name"), list) else str(row.get("institution_name") or ""),
                "document_type": row.get("document_type_name") or row.get("type_show_name") or "专家纪要",
                "companies": "、".join(map(str, row.get("company_show_name") or [])) if isinstance(row.get("company_show_name"), list) else str(row.get("company_show_name") or row.get("company_name") or ""),
                "summary": _strip_html(str(row.get("doc_introduce") or row.get("comment_content") or row.get("content") or "")),
                "query": search_query,
            }
            key = str(item["id"] or item["title"])
            if key in seen:
                continue
            seen.add(key)
            items.append(item)
    return items
