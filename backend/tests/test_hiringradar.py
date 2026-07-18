from __future__ import annotations

import json

import hiringradar


def test_extract_jobs_accepts_list_and_jobs_wrapper():
    rows = [{"title": "Research Engineer"}]
    assert hiringradar._extract_jobs(rows) == rows
    assert hiringradar._extract_jobs({"jobs": rows}) == rows
    assert hiringradar._extract_jobs({"items": rows}) == []


def test_get_hiring_radar_reads_cached_payload(tmp_path, monkeypatch):
    cache_file = tmp_path / "hiring_radar.json"
    payload = {
        "title": "招聘雷达",
        "summary": "OpenAI：Research Engineer",
        "updated_at": "2026-07-17 21:50",
        "items": [
            {
                "company": "OpenAI",
                "title": "Research Engineer",
                "location": "San Francisco",
                "time": "2026-07-17",
                "url": "",
                "summary": "",
                "source": "Hiring-Radar",
            }
        ],
        "companies": ["OpenAI"],
        "source": "Hiring-Radar",
    }
    cache_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(hiringradar, "CACHE_FILE", cache_file)
    assert hiringradar.get_hiring_radar(force=False) == payload
