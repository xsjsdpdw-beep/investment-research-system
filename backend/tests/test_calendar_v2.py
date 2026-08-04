import json

import calendar_v2


def test_v2_calendar_uses_separate_file_and_keeps_legacy_unchanged(tmp_path, monkeypatch):
    legacy = [{
        "id": "legacy-manual",
        "title": "原版自定义事项",
        "date": "2026-07-28",
        "category": "manual",
        "source": "manual",
    }]
    monkeypatch.setattr(calendar_v2, "CALENDAR_V2_INDEX", tmp_path / "calendar_events_v2.json")
    monkeypatch.setattr(calendar_v2.knowledge, "_load_calendar", lambda: legacy)
    monkeypatch.setattr(calendar_v2.calendar_v2_sources, "calendar_events", lambda *_args, **_kwargs: [])

    rows = calendar_v2.list_events("2026-07-28", "2026-07-28")
    saved = json.loads(calendar_v2.CALENDAR_V2_INDEX.read_text(encoding="utf-8"))

    assert rows[0]["id"] == "legacy-manual"
    assert saved == legacy
    assert legacy[0]["title"] == "原版自定义事项"


def test_v2_calendar_keeps_wallstreetcn_two_stars_and_above(tmp_path, monkeypatch):
    monkeypatch.setattr(calendar_v2, "CALENDAR_V2_INDEX", tmp_path / "calendar_events_v2.json")
    monkeypatch.setattr(calendar_v2.knowledge, "_load_calendar", lambda: [])
    monkeypatch.setattr(
        calendar_v2.calendar_v2_sources,
        "calendar_events",
        lambda *_args, **_kwargs: [
            {"id": "one", "title": "一星", "date": "2026-07-28", "source": "华尔街见闻财经日历", "stars": 1},
            {"id": "two", "title": "二星", "date": "2026-07-28", "source": "华尔街见闻财经日历", "stars": 2},
            {"id": "three", "title": "三星", "date": "2026-07-28", "source": "华尔街见闻财经日历", "stars": 3},
        ],
    )

    rows = calendar_v2.list_events("2026-07-28", "2026-07-28")

    assert {item["id"] for item in rows} == {"two", "three"}


def test_authorized_jin10_adapter_only_keeps_three_stars(monkeypatch):
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps({
                "data": [
                    {"id": 1, "title": "二星数据", "date": "2026-07-28", "stars": 2},
                    {"id": 2, "title": "三星数据", "date": "2026-07-28", "stars": 3},
                ],
            }).encode()

    monkeypatch.setenv("VR_JIN10_CALENDAR_API_URL", "https://authorized.example/calendar")
    monkeypatch.setattr(calendar_v2.urllib.request, "urlopen", lambda *_args, **_kwargs: Response())

    rows = calendar_v2._authorized_jin10_events("2026-07-28", "2026-07-28")

    assert [item["title"] for item in rows] == ["三星数据"]
    assert rows[0]["source"] == "金十授权 API"
