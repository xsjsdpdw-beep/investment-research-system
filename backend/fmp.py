"""Financial Modeling Prep 数据源。

只负责 FMP 官方 stable API 的认证、错误归类和原始数据聚合。
API Key 优先使用调用方传入值，否则读取 VR_FMP_API_KEY；响应中永不回传 Key。
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
import re
from typing import Any

import requests

DEFAULT_BASE_URL = "https://financialmodelingprep.com/stable"
DOCS_URL = "https://site.financialmodelingprep.com/developer/docs/stable"
_SYMBOL_RE = re.compile(r"^[A-Z0-9.-]{1,20}$")


class FmpError(RuntimeError):
    """FMP 上游错误，保留 HTTP 状态以便 API 层准确映射。"""

    def __init__(self, message: str, upstream_status: int | None = None):
        super().__init__(message)
        self.upstream_status = upstream_status


def _base_url() -> str:
    return os.environ.get("VR_FMP_BASE_URL", DEFAULT_BASE_URL).strip().rstrip("/") or DEFAULT_BASE_URL


def _api_key(explicit: str | None = None) -> str:
    key = (explicit or "").strip() or os.environ.get("VR_FMP_API_KEY", "").strip()
    if not key:
        raise ValueError("未配置 FMP API Key；请在个股数据页保存 Key，或设置 VR_FMP_API_KEY")
    return key


def _symbol(value: str) -> str:
    symbol = value.strip().upper()
    if not _SYMBOL_RE.fullmatch(symbol):
        raise ValueError("FMP symbol 仅支持 1–20 位字母、数字、点或连字符")
    return symbol


def _message_from_payload(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("Error Message", "error", "message"):
            value = payload.get(key)
            if value:
                return str(value)
    return ""


def _get(endpoint: str, params: dict[str, Any], api_key: str | None = None) -> Any:
    key = _api_key(api_key)
    url = f"{_base_url()}/{endpoint.lstrip('/')}"
    try:
        response = requests.get(
            url,
            params=params,
            headers={"apikey": key, "User-Agent": "Vibe-Research/0.1"},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise FmpError(f"连接 FMP 失败：{exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise FmpError("FMP 返回了无法解析的响应", response.status_code) from exc

    message = _message_from_payload(payload)
    if response.status_code in {401, 403}:
        raise FmpError("FMP API Key 无效、缺失，或当前套餐无权访问该接口", response.status_code)
    if response.status_code == 429:
        raise FmpError("FMP 请求额度已用完或触发限流", response.status_code)
    if response.status_code >= 400:
        detail = f"：{message}" if message else ""
        raise FmpError(f"FMP 上游请求失败（HTTP {response.status_code}）{detail}", response.status_code)
    if message and not isinstance(payload, list):
        raise FmpError(f"FMP 返回错误：{message}", response.status_code)
    return payload


def _rows(payload: Any, endpoint: str) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        return [payload]
    raise FmpError(f"FMP {endpoint} 返回了非预期数据结构")


def status(api_key: str | None = None) -> dict[str, Any]:
    configured_from = ""
    if (api_key or "").strip():
        configured_from = "request"
    elif os.environ.get("VR_FMP_API_KEY", "").strip():
        configured_from = "environment"
    configured = bool(configured_from)
    return {
        "provider": "financialmodelingprep",
        "configured": configured,
        "ready": configured,
        "configured_from": configured_from or None,
        "base_url": _base_url(),
        "docs_url": DOCS_URL,
        "capabilities": [
            "company_profile",
            "financial_statements",
            "key_metrics",
            "ratios",
            "analyst_estimates",
            "price_target_consensus",
            "grades_consensus",
        ],
    }


def test_connection(api_key: str | None = None) -> dict[str, Any]:
    rows = _rows(_get("profile", {"symbol": "AAPL"}, api_key), "profile")
    if not rows:
        raise FmpError("FMP 连通成功，但未返回 AAPL 公司资料")
    profile = rows[0]
    return {
        "ok": True,
        "provider": "financialmodelingprep",
        "symbol": str(profile.get("symbol") or "AAPL"),
        "company_name": profile.get("companyName"),
        "configured_from": status(api_key)["configured_from"],
        "base_url": _base_url(),
    }


def financials(
    symbol: str,
    period: str = "annual",
    limit: int = 5,
    api_key: str | None = None,
) -> dict[str, Any]:
    ticker = _symbol(symbol)
    if period not in {"annual", "quarter"}:
        raise ValueError("period 仅支持 annual 或 quarter")
    params = {"symbol": ticker, "period": period, "limit": limit}
    endpoints = {
        "income_statement": "income-statement",
        "balance_sheet": "balance-sheet-statement",
        "cash_flow": "cash-flow-statement",
        "key_metrics": "key-metrics",
        "ratios": "ratios",
    }
    data = {
        key: _rows(_get(endpoint, params, api_key), endpoint)
        for key, endpoint in endpoints.items()
    }
    return {
        "provider": "financialmodelingprep",
        "symbol": ticker,
        "period": period,
        "limit": limit,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        **data,
    }


def estimates(
    symbol: str,
    period: str = "annual",
    limit: int = 10,
    api_key: str | None = None,
) -> dict[str, Any]:
    ticker = _symbol(symbol)
    if period not in {"annual", "quarter"}:
        raise ValueError("period 仅支持 annual 或 quarter")
    analyst_params = {"symbol": ticker, "period": period, "page": 0, "limit": limit}
    symbol_params = {"symbol": ticker}
    return {
        "provider": "financialmodelingprep",
        "symbol": ticker,
        "period": period,
        "limit": limit,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "analyst_estimates": _rows(
            _get("analyst-estimates", analyst_params, api_key),
            "analyst-estimates",
        ),
        "price_target_consensus": _rows(
            _get("price-target-consensus", symbol_params, api_key),
            "price-target-consensus",
        ),
        "grades_consensus": _rows(
            _get("grades-consensus", symbol_params, api_key),
            "grades-consensus",
        ),
    }
