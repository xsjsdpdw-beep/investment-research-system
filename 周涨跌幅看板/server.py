#!/usr/bin/env python3
"""独立周涨跌幅看板：静态页面 + 跨市场行情 API，仅使用 Python 标准库。"""

from __future__ import annotations

import argparse
import json
import re
import threading
import urllib.parse
import urllib.request
import webbrowser
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
IFIND_FILE = ROOT / "ifind_forecasts.json"
BEIJING = timezone(timedelta(hours=8))
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
ALLOWED_MARKETS = {"SH", "SZ", "BJ", "HK", "US", "JP"}
MARKET_CURRENCIES = {"SH": "CNY", "SZ": "CNY", "BJ": "CNY", "HK": "HKD", "US": "USD", "JP": "JPY"}


def week_bounds(today: date | None = None) -> tuple[date, date]:
    current = today or datetime.now(BEIJING).date()
    monday = current - timedelta(days=current.weekday())
    return monday, monday + timedelta(days=4)


def root_code(stock: dict[str, Any]) -> str:
    ticker = str(stock["ticker"]).strip().upper()
    suffixes = {
        "SH": (".SH", ".SS"),
        "SZ": (".SZ",),
        "BJ": (".BJ",),
        "HK": (".HK",),
        "US": (".N", ".O", ".US"),
        "JP": (".T", ".JP"),
    }
    for suffix in suffixes.get(stock["market"], ()):
        if ticker.endswith(suffix):
            return ticker[: -len(suffix)]
    return ticker


def provider_symbol(stock: dict[str, Any]) -> str:
    code = root_code(stock)
    if stock["market"] == "HK":
        code = code.zfill(5)
    prefix = {"SH": "sh", "SZ": "sz", "BJ": "bj", "HK": "hk", "US": "us", "JP": "jp"}[stock["market"]]
    return f"{prefix}{code}"


def safe_float(value: Any) -> float | None:
    try:
        number = float(value)
        return number if number > 0 else None
    except (TypeError, ValueError):
        return None


def get_bytes(url: str, params: dict[str, Any] | None = None, encoding: str = "utf-8") -> str:
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://gu.qq.com/"})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read().decode(encoding, errors="ignore")


def tencent_history(stock: dict[str, Any]) -> list[dict[str, Any]]:
    symbol = provider_symbol(stock)
    payload = json.loads(
        get_bytes(
            "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get",
            {"param": f"{symbol},day,,,320,qfq"},
        )
    )
    item = (payload.get("data") or {}).get(symbol) or {}
    raw_rows = item.get("qfqday") or item.get("day") or []
    return [
        {"date": str(row[0]), "close": float(row[2])}
        for row in raw_rows
        if isinstance(row, list) and len(row) >= 3 and safe_float(row[2]) is not None
    ]


def sina_us_history(stock: dict[str, Any]) -> list[dict[str, Any]]:
    code = root_code(stock)
    text = get_bytes(
        f"https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_{code}=/US_MinKService.getDailyK",
        {"symbol": code.lower(), "num": 320, "_": int(datetime.now().timestamp() * 1000)},
    )
    match = re.search(r"\((\[.*\])\)\s*;?\s*$", text, re.S)
    if not match:
        return []
    rows = json.loads(match.group(1))
    return [
        {"date": str(row.get("d") or ""), "close": float(row["c"])}
        for row in rows
        if isinstance(row, dict) and row.get("d") and safe_float(row.get("c")) is not None
    ]


def yahoo_history(stock: dict[str, Any]) -> list[dict[str, Any]]:
    code = root_code(stock)
    symbol = f"{code}.T" if stock["market"] == "JP" else code
    payload = json.loads(
        get_bytes(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(symbol)}",
            {"range": "1y", "interval": "1d"},
        )
    )
    result = ((payload.get("chart") or {}).get("result") or [None])[0] or {}
    timestamps = result.get("timestamp") or []
    closes = (((result.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
    timezone_name = (result.get("meta") or {}).get("exchangeTimezoneName") or "UTC"
    try:
        exchange_tz = ZoneInfo(timezone_name)
    except Exception:
        exchange_tz = timezone.utc
    rows = []
    for timestamp, close in zip(timestamps, closes):
        value = safe_float(close)
        if value is None:
            continue
        trading_date = datetime.fromtimestamp(timestamp, timezone.utc).astimezone(exchange_tz).date().isoformat()
        rows.append({"date": trading_date, "close": value})
    return rows


def fetch_history(stock: dict[str, Any]) -> list[dict[str, Any]]:
    if stock["market"] in {"SH", "SZ", "BJ", "HK"}:
        return tencent_history(stock)
    if stock["market"] == "US":
        return sina_us_history(stock)
    return yahoo_history(stock)


def fetch_quotes(stocks: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not stocks:
        return {}
    symbols = [provider_symbol(stock) for stock in stocks]
    text = get_bytes("https://qt.gtimg.cn/q=" + ",".join(symbols), encoding="gbk")
    by_symbol = {symbol: stock for symbol, stock in zip(symbols, stocks)}
    quotes: dict[str, dict[str, Any]] = {}
    for line in text.split(";"):
        if "=" not in line or '"' not in line:
            continue
        symbol = line.split("=", 1)[0].split("_")[-1]
        stock = by_symbol.get(symbol)
        if not stock:
            continue
        values = line.split('"')[1].split("~")
        raw_time = values[30] if len(values) > 30 else ""
        date_match = re.search(r"(\d{4})[-/]?(\d{2})[-/]?(\d{2})", raw_time)
        float_cap = safe_float(values[44] if len(values) > 44 else None)
        total_cap = safe_float(values[45] if len(values) > 45 else None) or float_cap
        quotes[stock["id"]] = {
            "price": safe_float(values[3] if len(values) > 3 else None),
            "date": "-".join(date_match.groups()) if date_match else "",
            "market_cap_yi": total_cap,
            "currency": MARKET_CURRENCIES.get(stock["market"], ""),
        }
    return quotes


def performance_metrics(
    history: list[dict[str, Any]],
    quote: dict[str, Any] | None,
    monday: date,
    friday: date,
) -> dict[str, Any]:
    normalized = sorted(
        [
            (date.fromisoformat(str(item["date"])[:10]), float(item["close"]))
            for item in history
            if item.get("date") and safe_float(item.get("close")) is not None
        ],
        key=lambda item: item[0],
    )
    week_base_rows = [item for item in normalized if item[0] < monday]
    latest_rows = [item for item in normalized if item[0] <= friday]
    if not latest_rows:
        return {"weekly_change": None, "ytd_change": None, "as_of": "", "base_close": None, "latest_price": None}
    latest_date, latest_price = latest_rows[-1]
    quote_date_text = str((quote or {}).get("date") or "")
    quote_price = safe_float((quote or {}).get("price"))
    if quote_date_text and quote_price is not None:
        try:
            quote_date = date.fromisoformat(quote_date_text)
            if quote_date <= friday and quote_date >= latest_date:
                latest_date, latest_price = quote_date, quote_price
        except ValueError:
            pass
    week_base_close = week_base_rows[-1][1] if week_base_rows else None
    year_start = date(monday.year, 1, 1)
    year_base_rows = [item for item in normalized if item[0] < year_start]
    year_base_close = year_base_rows[-1][1] if year_base_rows else None
    return {
        "weekly_change": round((latest_price / week_base_close - 1) * 100, 2) if week_base_close else None,
        "ytd_change": round((latest_price / year_base_close - 1) * 100, 2) if year_base_close else None,
        "as_of": latest_date.isoformat(),
        "base_close": round(week_base_close, 4) if week_base_close else None,
        "latest_price": round(latest_price, 4),
    }


def load_ifind_forecasts() -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    try:
        payload = json.loads(IFIND_FILE.read_text(encoding="utf-8"))
        return payload.get("records") or {}, {
            "source": payload.get("source") or "iFind",
            "fetched_at": payload.get("fetched_at") or "",
            "unit": payload.get("unit") or "亿",
        }
    except (OSError, json.JSONDecodeError):
        return {}, {"source": "iFind", "fetched_at": "", "unit": "亿"}


def financial_metrics(
    stock: dict[str, Any],
    quote: dict[str, Any],
    forecasts: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    data = forecasts.get(stock["ticker"]) or {}
    profit_2025 = safe_float(data.get("profit_2025"))
    profit_2026e = safe_float(data.get("profit_2026e"))
    profit_2027e = safe_float(data.get("profit_2027e"))
    market_cap = safe_float(quote.get("market_cap_yi"))
    quote_currency = quote.get("currency") or MARKET_CURRENCIES.get(stock["market"], "")
    profit_currency = data.get("profit_currency") or ""
    same_currency = bool(profit_currency and profit_currency == quote_currency)

    def growth(current: float | None, previous: float | None) -> float | None:
        return round((current / previous - 1) * 100, 1) if current and previous else None

    def pe(profit: float | None) -> float | None:
        return round(market_cap / profit, 1) if market_cap and profit and same_currency else None

    return {
        "profit_2025": profit_2025,
        "profit_2026e": profit_2026e,
        "profit_2027e": profit_2027e,
        "profit_currency": profit_currency,
        "profit_2026_yoy": growth(profit_2026e, profit_2025),
        "profit_2027_yoy": growth(profit_2027e, profit_2026e),
        "pe_2025": pe(profit_2025),
        "pe_2026e": pe(profit_2026e),
        "pe_2027e": pe(profit_2027e),
    }


def normalize_stocks(raw_stocks: Any) -> list[dict[str, Any]]:
    stocks = []
    seen: set[str] = set()
    for raw in raw_stocks if isinstance(raw_stocks, list) else []:
        if not isinstance(raw, dict):
            continue
        stock_id = str(raw.get("id") or "").strip()[:100]
        ticker = str(raw.get("ticker") or "").strip().upper()[:24]
        market = str(raw.get("market") or "").strip().upper()
        if not stock_id or stock_id in seen or not ticker or market not in ALLOWED_MARKETS:
            continue
        seen.add(stock_id)
        stocks.append(
            {
                "id": stock_id,
                "ticker": ticker,
                "market": market,
                "name": str(raw.get("name") or ticker).strip()[:60],
                "industry": str(raw.get("industry") or "").strip()[:60],
                "group_id": str(raw.get("group_id") or "").strip()[:100],
                "sort_order": int(raw.get("sort_order") or 0),
            }
        )
        if len(stocks) >= 200:
            break
    return stocks


def build_snapshot(stocks: list[dict[str, Any]]) -> dict[str, Any]:
    monday, friday = week_bounds()
    forecasts, forecast_meta = load_ifind_forecasts()
    histories: dict[str, list[dict[str, Any]]] = {}
    errors: dict[str, str] = {}
    try:
        quotes = fetch_quotes(stocks)
    except Exception as exc:
        quotes = {}
        errors["_quotes"] = str(exc)
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(stocks)))) as executor:
        futures = {executor.submit(fetch_history, stock): stock for stock in stocks}
        for future in as_completed(futures):
            stock = futures[future]
            try:
                histories[stock["id"]] = future.result()
            except Exception as exc:
                histories[stock["id"]] = []
                errors[stock["id"]] = str(exc)
    rows = []
    for stock in stocks:
        quote = quotes.get(stock["id"]) or {}
        rows.append(
            {
                **stock,
                **performance_metrics(histories.get(stock["id"], []), quote, monday, friday),
                "market_cap_yi": quote.get("market_cap_yi"),
                "currency": quote.get("currency") or MARKET_CURRENCIES.get(stock["market"], ""),
                **financial_metrics(stock, quote, forecasts),
                "error": errors.get(stock["id"], ""),
            }
        )
    return {
        "rows": rows,
        "week_start": monday.isoformat(),
        "week_end": friday.isoformat(),
        "updated_at": datetime.now(BEIJING).isoformat(timespec="seconds"),
        "ifind": forecast_meta,
        "errors": errors,
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/health":
            self.send_json({"ok": True, "service": "weekly-performance-dashboard"})
            return
        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if path not in {"/", "/index.html"}:
            self.send_error(404)
            return
        body = (ROOT / "index.html").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if urllib.parse.urlparse(self.path).path != "/api/weekly":
            self.send_error(404)
            return
        try:
            size = min(int(self.headers.get("Content-Length") or 0), 1_000_000)
            payload = json.loads(self.rfile.read(size) or b"{}")
            stocks = normalize_stocks(payload.get("stocks"))
            self.send_json(build_snapshot(stocks))
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[weekly-dashboard] {self.address_string()} {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    url = f"http://{args.host}:{args.port}/"
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    if args.open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    print(f"周涨跌幅看板已启动：{url}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
