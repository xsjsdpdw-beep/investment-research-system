from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

try:
    from .db import iso_now, short_hash
except ImportError:  # direct `python backend/server.py` execution
    from db import iso_now, short_hash


USER_AGENT = "GlobalInformationRadar/0.1 (+local research client)"
TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"}


class FetchError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, retry_after: int | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def strip_html(value: str | None) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def canonicalize_url(value: str) -> str:
    parts = urlsplit(str(value or "").strip())
    query = [(key, val) for key, val in parse_qsl(parts.query, keep_blank_values=True) if not key.lower().startswith("utm_") and key.lower() not in TRACKING_PARAMS]
    host = (parts.hostname or "").lower()
    if parts.port and parts.port not in {80, 443}:
        host = f"{host}:{parts.port}"
    path = parts.path or "/"
    return urlunsplit((parts.scheme.lower(), host, path, urlencode(query), ""))


def parse_datetime(value: Any) -> str | None:
    if value is None or not str(value).strip():
        return None
    text = str(value).strip()
    try:
        dt = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def get_path(value: Any, path: str | None, default: Any = None) -> Any:
    if not path:
        return default
    current = value
    for part in str(path).split("."):
        if isinstance(current, dict):
            current = current.get(part, default)
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return default
    return current


def _entry_text(element: ET.Element, names: set[str]) -> str:
    for child in list(element):
        if local_name(child.tag) in names:
            text = "".join(child.itertext()).strip()
            if text:
                return strip_html(text)
    return ""


def parse_rss(raw: bytes, source: dict[str, Any]) -> list[dict[str, Any]]:
    root = ET.fromstring(raw)
    items: list[dict[str, Any]] = []
    for element in root.iter():
        if local_name(element.tag) not in {"item", "entry"}:
            continue
        title = _entry_text(element, {"title"})
        links = []
        for child in list(element):
            if local_name(child.tag) == "link":
                href = child.attrib.get("href") or (child.text or "").strip()
                if href:
                    links.append(href)
        url = links[0] if links else ""
        summary = _entry_text(element, {"description", "summary", "content", "encoded"})
        author = _entry_text(element, {"author", "creator", "dc:creator"})
        published_raw = _entry_text(element, {"pubdate", "published", "updated", "date", "created"})
        source_item_id = _entry_text(element, {"guid", "id", "uuid"})
        if not title or not url:
            continue
        canonical = canonicalize_url(url)
        items.append({
            "source_item_id": source_item_id or canonical,
            "title": title,
            "original_title": title,
            "summary": summary[:3000],
            "content_text": summary[:12000],
            "original_url": url,
            "canonical_url": canonical,
            "author": author or None,
            "published_at": parse_datetime(published_raw),
            "discovered_at": iso_now(),
            "content_hash": short_hash(title, summary),
            "cluster_key": re.sub(r"[^\w\u4e00-\u9fff]+", " ", title.lower()).strip()[:120],
            "topics": list(source.get("topics") or []),
            "entities": [],
        })
    return items


def parse_json_api(raw: bytes, source: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise FetchError(f"invalid JSON: {exc}") from exc
    mapping = source.get("mapping") or {}
    values = get_path(payload, mapping.get("items_path", "items"), payload if isinstance(payload, list) else [])
    if isinstance(values, dict):
        values = values.get("items") or values.get("data") or []
    if not isinstance(values, list):
        raise FetchError("JSON items path is not a list")
    output = []
    for value in values:
        if not isinstance(value, dict):
            continue
        title = str(get_path(value, mapping.get("title", "title"), "") or "").strip()
        url = str(get_path(value, mapping.get("url", "url"), "") or "").strip()
        if not title or not url:
            continue
        summary = str(get_path(value, mapping.get("summary", "summary"), "") or "").strip()
        published = get_path(value, mapping.get("published_at", "published_at"))
        source_item_id = str(get_path(value, mapping.get("id", "id"), "") or "").strip()
        canonical = canonicalize_url(url)
        output.append({
            "source_item_id": source_item_id or canonical,
            "title": title,
            "original_title": title,
            "summary": strip_html(summary)[:3000],
            "content_text": strip_html(summary)[:12000],
            "original_url": url,
            "canonical_url": canonical,
            "author": str(get_path(value, mapping.get("author", "author"), "") or "").strip() or None,
            "published_at": parse_datetime(published),
            "discovered_at": iso_now(),
            "content_hash": short_hash(title, summary),
            "cluster_key": re.sub(r"[^\w\u4e00-\u9fff]+", " ", title.lower()).strip()[:120],
            "topics": list(source.get("topics") or []),
            "entities": [],
        })
    return output


def retry_after_seconds(headers: Any) -> int | None:
    value = headers.get("Retry-After") if headers else None
    try:
        return max(1, int(value)) if value else None
    except (TypeError, ValueError):
        return None


def fetch_source(source: dict[str, Any], state: dict[str, Any] | None = None, *, dry_run: bool = False) -> dict[str, Any]:
    state = state or {}
    headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml,application/atom+xml,application/json,text/xml,*/*"}
    headers.update(source.get("headers") or {})
    if state.get("etag"):
        headers["If-None-Match"] = state["etag"]
    if state.get("last_modified"):
        headers["If-Modified-Since"] = state["last_modified"]
    request = urllib.request.Request(source["endpoint"], headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=int(source.get("timeout_sec") or 15)) as response:
            status = getattr(response, "status", 200)
            raw = response.read()
            response_headers = response.headers
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return {"status": "not_modified", "items": [], "etag": exc.headers.get("ETag"), "last_modified": exc.headers.get("Last-Modified")}
        retry_after = retry_after_seconds(exc.headers)
        raise FetchError(f"HTTP {exc.code}", status=exc.code, retry_after=retry_after) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FetchError(f"network error: {exc}") from exc
    if status == 304:
        return {"status": "not_modified", "items": [], "etag": response_headers.get("ETag"), "last_modified": response_headers.get("Last-Modified")}
    if dry_run:
        return {"status": "ok", "items": [], "etag": response_headers.get("ETag"), "last_modified": response_headers.get("Last-Modified"), "bytes": len(raw)}
    parser = parse_json_api if source.get("type") == "json_api" else parse_rss
    items = parser(raw, source)
    return {"status": "ok", "items": items, "etag": response_headers.get("ETag"), "last_modified": response_headers.get("Last-Modified"), "bytes": len(raw)}
