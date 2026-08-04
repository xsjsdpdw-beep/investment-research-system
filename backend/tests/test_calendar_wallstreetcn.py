from datetime import datetime

import calendar_v2_sources


def _timestamp(value: str) -> int:
    return int(datetime.fromisoformat(value).timestamp())


def test_wallstreetcn_macro_mapping_keeps_source_fields():
    events = calendar_v2_sources._wallstreetcn_macro_events({
        "items": [{
            "id": 1,
            "public_date": _timestamp("2026-07-30T02:00:00+08:00"),
            "country": "美国",
            "title": "美联储 FOMC 利率决议",
            "importance": 3,
            "actual": "4.25",
            "forecast": "4.25",
            "previous": "4.50",
            "unit": "%",
            "uri": "https://wallstreetcn.com/calendar/US1/overview",
        }],
    })

    assert len(events) == 1
    assert events[0]["date"] == "2026-07-30"
    assert events[0]["time"] == "02:00"
    assert events[0]["stars"] == 3
    assert events[0]["source"] == "华尔街见闻财经日历"
    assert "预期 4.25%" in events[0]["notes"]


def test_wallstreetcn_macro_feed_classifies_earnings_calls():
    events = calendar_v2_sources._wallstreetcn_macro_events({
        "items": [{
            "id": 2,
            "public_date": _timestamp("2026-07-30T04:30:00+08:00"),
            "country": "美国",
            "title": "Meta财报电话会",
            "importance": 3,
        }],
    })

    assert events[0]["category"] == "conference_call"
    assert events[0]["source"] == "华尔街见闻电话会日历"


def test_wallstreetcn_macro_feed_classifies_major_events():
    events = calendar_v2_sources._wallstreetcn_macro_events({
        "items": [{
            "id": 3,
            "public_date": _timestamp("2026-07-30T10:00:00+08:00"),
            "country": "中国",
            "title": "国务院新闻办公室举行发布会",
            "importance": 3,
            "calendar_type": "FE",
        }],
    })

    assert events[0]["category"] == "major_event"
    assert events[0]["source"] == "华尔街见闻大事日历"


def test_wallstreetcn_earnings_only_keeps_important_us_and_watchlist():
    data = {
        "fields": [
            "id", "code", "company_name", "country", "country_id", "public_date",
            "eps_estimate", "reported_eps", "earnings_call_time", "observation_date",
        ],
        "items": [
            [1, "MSFT.US", "微软", "美国", "US", _timestamp("2026-07-30T00:00:00+08:00"), 3.2, 0, "AMC", "中报"],
            [2, "SMALL.US", "小公司", "美国", "US", _timestamp("2026-07-30T00:00:00+08:00"), 1.0, 0, "BMO", "中报"],
            [3, "600031.SH", "三一重工", "中国", "CN", _timestamp("2026-07-31T00:00:00+08:00"), 0.4, 0, "TNS", "中报"],
        ],
    }
    watchlist = {"stocks": [{"code": "600031", "market": "SH", "name": "三一重工"}]}

    events = calendar_v2_sources._wallstreetcn_earnings_events(data, watchlist)

    assert [item["ticker"] for item in events] == ["MSFT.US", "600031.SH"]
    assert events[0]["important_us"] is True
    assert events[0]["stars"] == 3
    assert events[1]["watchlist_match"] is True
    assert events[1]["stars"] == 3
