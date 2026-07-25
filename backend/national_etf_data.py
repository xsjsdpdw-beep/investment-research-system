"""国家队 ETF 跟踪公开数据层。

参考站点发布的 data.js 已经把交易所规模、公开行情和持仓披露统一成
可直接消费的 JSON；这里通过后端代理并做短期缓存，避免浏览器跨域和把
大体量数据直接写进前端。
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests


UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
SOURCE_URL = "https://etf.leodwlabs.com/data.js"
_CACHE_TTL = 24 * 60 * 60
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": UA})


def _cache_path() -> Path:
    root = Path(os.environ.get("VR_DATA_DIR") or Path.home() / ".vibe-research")
    root.mkdir(parents=True, exist_ok=True)
    return root / "national-etf-tracker.json"


def _read_cache() -> dict[str, Any] | None:
    path = _cache_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_cache(payload: dict[str, Any]) -> None:
    path = _cache_path()
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temp.replace(path)


def _parse_data_js(text: str) -> dict[str, Any]:
    marker = "window.TRACKER_DATA ="
    start = text.find(marker)
    if start < 0:
        raise ValueError("国家队 ETF 公开数据未找到 TRACKER_DATA")
    payload = text[start + len(marker):].strip()
    if payload.endswith(";"):
        payload = payload[:-1].rstrip()
    data = json.loads(payload)
    if not isinstance(data, dict) or not isinstance(data.get("etfs"), list):
        raise ValueError("国家队 ETF 公开数据格式不正确")
    return data


def get_national_etf_snapshot(force: bool = False) -> dict[str, Any]:
    cached = _read_cache()
    if cached and not force and time.time() - float(cached.get("fetchedAtEpoch", 0)) < _CACHE_TTL:
        return cached["snapshot"]

    response = _SESSION.get(SOURCE_URL, timeout=40)
    response.raise_for_status()
    # The source omits a charset; requests may otherwise guess ISO-8859-1 and
    # turn Chinese labels into mojibake before the JSON parser sees them.
    snapshot = _parse_data_js(response.content.decode("utf-8"))
    snapshot.setdefault("meta", {})["proxy_source"] = SOURCE_URL
    snapshot["meta"]["proxy_fetched_at"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    _write_cache({"fetchedAtEpoch": time.time(), "snapshot": snapshot})
    return snapshot
