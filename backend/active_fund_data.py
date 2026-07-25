"""主观偏股基金 iFind 数据适配层。

页面需要的是主动偏股基金合计的季度行业配置，而不是某一篇券商报告的截图。
本模块只接受 iFind 批量查询结果：运行环境通过 ``VR_IFIND_DSN`` 调用
``/fund/active-allocation``，按基金池、报告期和申万 2021 一级行业返回标准化行。
未配置 iFind 时返回明确的未就绪状态，不再把报告或用户截图当成数据回退。
"""

from __future__ import annotations

import html
import json
import os
import re
import time
from pathlib import Path
from typing import Any

import data_adapters


_CACHE_TTL = 24 * 60 * 60
_LATEST_QUARTER = "2026Q2"
_REPORT_QUARTERS = ("2026Q2", "2026Q1", "2025Q4", "2025Q3")
_IFIND_ENDPOINT = "/fund/active-allocation"
IFIND_ACTIVE_FUND_UNIVERSE = ("主动股票开放基金", "偏股混合型基金")
IFIND_ACTIVE_FUND_FIELDS = (
    "基金代码",
    "报告期",
    "申万2021一级行业",
    "行业配置比例",
    "行业超低配比例",
    "基金净值",
)


def _cache_path() -> Path:
    root = Path(os.environ.get("VR_DATA_DIR") or Path.home() / ".vibe-research")
    root.mkdir(parents=True, exist_ok=True)
    return root / "active-fund-allocation-ifind.json"


def _clean_text(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _number(value: Any) -> float | None:
    if value is None:
        return None
    cleaned = str(value).replace(",", "").replace("%", "").replace("+", "").strip()
    if not cleaned or cleaned in {"-", "—", "--", "N/A", "nan", "None", "\\t"}:
        return None
    try:
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def _table_rows(page: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for table in re.findall(r"<table\b[^>]*>([\s\S]*?)</table>", page, flags=re.I):
        for row in re.findall(r"<tr\b[^>]*>([\s\S]*?)</tr>", table, flags=re.I):
            cells = [
                _clean_text(cell)
                for cell in re.findall(r"<t[dh]\b[^>]*>([\s\S]*?)</t[dh]>", row, flags=re.I)
            ]
            if cells:
                rows.append(cells)
    return rows


def _header_index(header: list[str], *terms: str) -> int | None:
    for index, cell in enumerate(header):
        if all(term.lower() in cell.lower() for term in terms):
            return index
    return None


def _extract_rows(page: str) -> list[dict[str, Any]]:
    """保留结构化 HTML 解析单测；它不是生产数据源。"""

    rows = _table_rows(page)
    for header_index, header in enumerate(rows[:5]):
        sector_index = _header_index(header, "行业")
        q2_index = _header_index(header, "配置", "Q2") or _header_index(header, "配置", "2026Q2")
        q1_index = _header_index(header, "配置", "Q1") or _header_index(header, "配置", "2026Q1")
        if sector_index is None or q2_index is None or q1_index is None:
            continue
        change_index = _header_index(header, "配置变动")
        low_q1_index = _header_index(header, "超低配", "Q1")
        low_q2_index = _header_index(header, "超低配", "Q2")
        low_change_index = _header_index(header, "超配变动") or _header_index(header, "超低配变动")
        extracted: list[dict[str, Any]] = []
        for row in rows[header_index + 1 :]:
            if max(sector_index, q2_index, q1_index) >= len(row):
                continue
            sector = row[sector_index].strip()
            q1 = _number(row[q1_index])
            q2 = _number(row[q2_index])
            if not sector or q1 is None or q2 is None or sector in {"行业", "合计"}:
                continue
            low_q1 = _number(row[low_q1_index]) if low_q1_index is not None and low_q1_index < len(row) else 0
            low_q2 = _number(row[low_q2_index]) if low_q2_index is not None and low_q2_index < len(row) else 0
            low_change = _number(row[low_change_index]) if low_change_index is not None and low_change_index < len(row) else (low_q2 or 0) - (low_q1 or 0)
            extracted.append({
                "sector": sector,
                "q1Weight": q1,
                "q2Weight": q2,
                "weightChange": (_number(row[change_index]) if change_index is not None and change_index < len(row) else q2 - q1) or 0,
                "lowQ1": low_q1 or 0,
                "lowQ2": low_q2 or 0,
                "lowChange": low_change or 0,
            })
        if extracted:
            return extracted
    return []


def _read_cache() -> dict[str, Any] | None:
    try:
        return json.loads(_cache_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_cache(payload: dict[str, Any]) -> None:
    path = _cache_path()
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def _first(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _period_value(row: dict[str, Any], period: str, field: str) -> float | None:
    quarter = period.replace("Q", "").lower()
    return _number(_first(
        row,
        f"{field}{period}",
        f"{field}_{period}",
        f"{period}{field}",
        f"{field}_{quarter}",
        period,
        period.lower(),
    ))


def _normalize_ifind_rows(result: Any) -> list[dict[str, Any]]:
    """兼容 iFind 代理返回 rows/data/items 或直接数组的标准化结果。"""

    payload = result
    if isinstance(payload, dict) and isinstance(payload.get("snapshot"), dict):
        payload = payload["snapshot"]
    if isinstance(payload, dict):
        for key in ("rows", "items", "results", "data", "行业配置"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    if not isinstance(payload, list):
        return []

    normalized: list[dict[str, Any]] = []
    for raw in payload:
        if not isinstance(raw, dict):
            continue
        sector = str(_first(raw, "sector", "industry", "行业", "行业名称", "申万行业") or "").strip()
        if not sector or sector in {"行业", "合计"}:
            continue
        q1 = _period_value(raw, "2026Q1", "weight")
        q2 = _period_value(raw, "2026Q2", "weight")
        if q1 is None:
            q1 = _number(_first(raw, "q1Weight", "q1_weight", "配置比例2026Q1", "配置Q1"))
        if q2 is None:
            q2 = _number(_first(raw, "q2Weight", "q2_weight", "配置比例2026Q2", "配置Q2"))
        if q1 is None or q2 is None:
            continue
        low_q1 = _period_value(raw, "2026Q1", "low")
        low_q2 = _period_value(raw, "2026Q2", "low")
        low_q1 = low_q1 if low_q1 is not None else _number(_first(raw, "lowQ1", "low_q1", "超低配2026Q1"))
        low_q2 = low_q2 if low_q2 is not None else _number(_first(raw, "lowQ2", "low_q2", "超低配2026Q2"))
        q4 = _period_value(raw, "2025Q4", "weight")
        q3 = _period_value(raw, "2025Q3", "weight")
        weight_change = _number(_first(raw, "weightChange", "weight_change", "配置变动"))
        low_change = _number(_first(raw, "lowChange", "low_change", "超配变动", "超低配变动"))
        normalized.append({
            "sector": sector,
            "q1Weight": q1,
            "q2Weight": q2,
            "q4Weight": q4,
            "q3Weight": q3,
            "weightChange": weight_change if weight_change is not None else round(q2 - q1, 4),
            "lowQ1": low_q1 or 0,
            "lowQ2": low_q2 or 0,
            "lowChange": low_change if low_change is not None else round((low_q2 or 0) - (low_q1 or 0), 4),
            "relativeChange": _number(_first(raw, "relativeChange", "relative_change")) or 0,
            "absoluteChange": _number(_first(raw, "absoluteChange", "absolute_change")) or 0,
            "northboundChina": 0,
            "northboundTrading": 0,
            "northboundAllocation": 0,
            "history": {
                "2026Q1": {"weight": q1, "low": low_q1},
                "2026Q2": {"weight": q2, "low": low_q2},
                "2025Q4": {"weight": q4, "low": None},
                "2025Q3": {"weight": q3, "low": None},
            },
        })
    return normalized


def _fetch_ifind_snapshot() -> dict[str, Any] | None:
    status = data_adapters.ifind_status()
    if not status["ready"]:
        return None
    result = data_adapters.ifind_request(_IFIND_ENDPOINT, {
        "operation": "active_fund_allocation",
        "universe": list(IFIND_ACTIVE_FUND_UNIVERSE),
        "report_quarters": list(_REPORT_QUARTERS),
        "industry_classification": "申万2021一级行业",
        "fields": list(IFIND_ACTIVE_FUND_FIELDS),
    })
    if not result:
        return None
    rows = _normalize_ifind_rows(result)
    if not rows:
        return None
    now = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    return {
        "rows": rows,
        "meta": {
            "latestQuarter": _LATEST_QUARTER,
            "source": "iFinD 基金数据库 / 申万2021一级行业",
            "updatedAt": now,
            "mode": "ifind",
            "extractedRows": len(rows),
            "note": "基金池、报告期和行业配置均来自 iFinD；页面不使用券商报告或用户截图作为回退。",
        },
        "sources": [{
            "id": "ifind-active-fund-allocation",
            "quarter": _LATEST_QUARTER,
            "provider": "iFinD 基金数据库",
            "url": "",
            "reachable": True,
            "title": "主动偏股基金行业配置批量查询",
            "publishedAt": now,
        }],
    }


def _not_ready_snapshot() -> dict[str, Any]:
    status = data_adapters.ifind_status()
    now = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    return {
        "rows": [],
        "meta": {
            "latestQuarter": _LATEST_QUARTER,
            "source": "iFinD 基金数据库（待配置运行环境）",
            "updatedAt": now,
            "mode": "ifind-not-configured",
            "extractedRows": 0,
            "note": f"已切换 iFinD，当前运行环境未完成接入：{status['reason']} 不显示券商报告或用户截图回退。",
        },
        "sources": [{
            "id": "ifind-active-fund-allocation",
            "quarter": _LATEST_QUARTER,
            "provider": "iFinD 基金数据库",
            "url": "",
            "reachable": False,
            "title": "等待 iFinD 基金批量接口",
            "publishedAt": "",
            "error": status["reason"],
        }],
    }


def get_active_fund_snapshot(force: bool = False) -> dict[str, Any]:
    cached = _read_cache()
    if cached and not force and time.time() - float(cached.get("fetchedAtEpoch", 0)) < _CACHE_TTL:
        return cached["snapshot"]

    snapshot = _fetch_ifind_snapshot() or _not_ready_snapshot()
    _write_cache({"fetchedAtEpoch": time.time(), "snapshot": snapshot})
    return snapshot
