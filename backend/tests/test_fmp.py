from fastapi.testclient import TestClient

import app as app_module
import fmp


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def test_status_does_not_expose_api_key(monkeypatch):
    monkeypatch.setenv("VR_FMP_API_KEY", "secret-value")

    result = fmp.status()

    assert result["configured"] is True
    assert result["configured_from"] == "environment"
    assert "secret-value" not in str(result)


def test_connection_sends_key_in_header_and_returns_safe_summary(monkeypatch):
    seen = {}

    def fake_get(url, params, headers, timeout):
        seen.update(url=url, params=params, headers=headers, timeout=timeout)
        return _Response([{"symbol": "AAPL", "companyName": "Apple Inc."}])

    monkeypatch.setattr(fmp.requests, "get", fake_get)

    result = fmp.test_connection("test-key")

    assert seen["url"].endswith("/profile")
    assert seen["params"] == {"symbol": "AAPL"}
    assert seen["headers"]["apikey"] == "test-key"
    assert result["company_name"] == "Apple Inc."
    assert "test-key" not in str(result)


def test_financials_aggregates_five_stable_endpoints(monkeypatch):
    endpoints = []

    def fake_get(endpoint, params, api_key=None):
        endpoints.append((endpoint, params, api_key))
        return [{"symbol": "AAPL", "date": "2025-09-27"}]

    monkeypatch.setattr(fmp, "_get", fake_get)

    result = fmp.financials("aapl", period="annual", limit=3, api_key="key")

    assert result["symbol"] == "AAPL"
    assert {item[0] for item in endpoints} == {
        "income-statement",
        "balance-sheet-statement",
        "cash-flow-statement",
        "key-metrics",
        "ratios",
    }
    assert all(item[1]["limit"] == 3 for item in endpoints)
    assert len(result["income_statement"]) == 1


def test_estimates_aggregates_estimate_target_and_grade_consensus(monkeypatch):
    endpoints = []

    def fake_get(endpoint, params, api_key=None):
        endpoints.append(endpoint)
        return [{"symbol": "MSFT"}]

    monkeypatch.setattr(fmp, "_get", fake_get)

    result = fmp.estimates("msft", period="quarter", limit=8, api_key="key")

    assert endpoints == ["analyst-estimates", "price-target-consensus", "grades-consensus"]
    assert result["period"] == "quarter"
    assert result["analyst_estimates"][0]["symbol"] == "MSFT"


def test_upstream_auth_and_rate_limit_are_distinguished(monkeypatch):
    monkeypatch.setattr(
        fmp.requests,
        "get",
        lambda *_args, **_kwargs: _Response({"Error Message": "forbidden"}, 403),
    )
    try:
        fmp.test_connection("bad-key")
    except fmp.FmpError as exc:
        assert exc.upstream_status == 403
        assert "套餐" in str(exc)
    else:
        raise AssertionError("403 should raise FmpError")

    monkeypatch.setattr(
        fmp.requests,
        "get",
        lambda *_args, **_kwargs: _Response({"Error Message": "limit"}, 429),
    )
    try:
        fmp.test_connection("limited-key")
    except fmp.FmpError as exc:
        assert exc.upstream_status == 429
        assert "限流" in str(exc)
    else:
        raise AssertionError("429 should raise FmpError")


def test_api_routes_forward_browser_key_without_returning_it(monkeypatch):
    monkeypatch.setattr(
        app_module.fmp,
        "test_connection",
        lambda api_key=None: {
            "ok": True,
            "provider": "financialmodelingprep",
            "symbol": "AAPL",
            "company_name": "Apple Inc.",
        },
    )

    response = TestClient(app_module.app).post(
        "/api/global/fmp/test",
        headers={"X-FMP-API-Key": "browser-key"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True
    assert "browser-key" not in response.text


def test_api_missing_key_is_a_configuration_error(monkeypatch):
    monkeypatch.delenv("VR_FMP_API_KEY", raising=False)

    response = TestClient(app_module.app).post("/api/global/fmp/test")

    assert response.status_code == 400
    assert "未配置 FMP API Key" in response.json()["detail"]
