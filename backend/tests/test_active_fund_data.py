import active_fund_data


def test_extract_public_html_table_rows():
    page = """
    <table>
      <tr><th>行业</th><th>配置比例2026Q1</th><th>配置比例2026Q2</th><th>配置变动</th><th>超低配2026Q1</th><th>超低配2026Q2</th><th>超配变动</th></tr>
      <tr><td>电子</td><td>21.80%</td><td>43.23%</td><td>21.44%</td><td>8.07%</td><td>19.82%</td><td>11.76%</td></tr>
    </table>
    """
    rows = active_fund_data._extract_rows(page)
    assert rows[0]["sector"] == "电子"
    assert rows[0]["q1Weight"] == 21.8
    assert rows[0]["q2Weight"] == 43.23
    assert rows[0]["lowChange"] == 11.76


def test_ifind_rows_are_normalized(monkeypatch):
    monkeypatch.setattr(active_fund_data.data_adapters, "ifind_status", lambda: {"ready": True})
    monkeypatch.setattr(
        active_fund_data.data_adapters,
        "ifind_request",
        lambda path, payload: [{
            "industry": "电子",
            "2026Q1": 21.8,
            "2026Q2": 43.23,
            "low2026Q1": 8.07,
            "low2026Q2": 19.82,
        }],
    )
    snapshot = active_fund_data.get_active_fund_snapshot(force=True)
    assert snapshot["meta"]["mode"] == "ifind"
    assert snapshot["meta"]["extractedRows"] == 1
    assert snapshot["rows"][0]["sector"] == "电子"
    assert snapshot["rows"][0]["weightChange"] == 21.43


def test_unconfigured_ifind_does_not_fallback_to_reports(monkeypatch):
    monkeypatch.setattr(
        active_fund_data.data_adapters,
        "ifind_status",
        lambda: {"ready": False, "reason": "未检测到 iFind SDK 或 VR_IFIND_DSN。"},
    )
    snapshot = active_fund_data.get_active_fund_snapshot(force=True)
    assert snapshot["meta"]["mode"] == "ifind-not-configured"
    assert snapshot["meta"]["extractedRows"] == 0
    assert snapshot["rows"] == []
    assert snapshot["sources"][0]["provider"] == "iFinD 基金数据库"
