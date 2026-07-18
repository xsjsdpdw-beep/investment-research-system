"""Hiring-Radar adapter for 投研资讯基本面模块."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
import subprocess
import urllib.request

HERE = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get("VR_DATA_DIR") or Path.home() / ".vibe-research")
CACHE_DIR = DATA_ROOT / "hiring_radar"
CACHE_FILE = CACHE_DIR / "hiring_radar.json"
SCRIPT_CACHE = CACHE_DIR / "hiring_radar.py"
UPSTREAM_SCRIPT = "https://raw.githubusercontent.com/simonlin1212/Hiring-Radar/main/hiring_radar.py"
DEFAULT_COMPANIES = ("openai", "anthropic", "nvidia", "figure")
DEFAULT_KEYWORD = "research,agent,robotics,ai,inference,infra,datacenter"
DEFAULT_RECENT_DAYS = 45
MAX_ITEMS = 18


def _empty_payload() -> dict:
    return {
        "title": "招聘雷达",
        "summary": "暂无招聘信号，稍后重试。",
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "items": [],
        "companies": [name.upper() for name in DEFAULT_COMPANIES],
        "source": "Hiring-Radar",
    }


def _candidate_local_repos() -> list[Path]:
    return [
        HERE.parent / "Hiring-Radar",
        HERE / ".cache" / "Hiring-Radar",
        Path.home() / "Documents" / "Hiring-Radar",
        Path.home() / "Code" / "Hiring-Radar",
    ]


def _find_local_script() -> Path | None:
    for repo in _candidate_local_repos():
        script = repo / "hiring_radar.py"
        if script.exists():
            return script
    return None


def _ensure_upstream_script() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if SCRIPT_CACHE.exists() and SCRIPT_CACHE.stat().st_size > 1024:
        return SCRIPT_CACHE
    req = urllib.request.Request(UPSTREAM_SCRIPT, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310 - fixed upstream source
        SCRIPT_CACHE.write_bytes(resp.read())
    return SCRIPT_CACHE


def _extract_jobs(payload) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        jobs = payload.get("jobs")
        if isinstance(jobs, list):
            return [item for item in jobs if isinstance(item, dict)]
    return []


def _run_company(script: Path, company: str) -> list[dict]:
    proc = subprocess.run(  # noqa: S603 - fixed internal command
        [
            sys.executable,
            str(script),
            company,
            "--json",
            "--recent-days",
            str(DEFAULT_RECENT_DAYS),
            "--keyword",
            DEFAULT_KEYWORD,
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=12,
        cwd=str(script.parent),
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"{company} query failed")
    return _extract_jobs(json.loads(proc.stdout or "[]"))


def _safe_company_name(item: dict, fallback: str) -> str:
    return str(item.get("company") or item.get("employer") or fallback).strip() or fallback


def _normalize_item(company: str, row: dict) -> dict:
    location = str(row.get("location") or row.get("remote") or "未知地点").strip()
    summary_bits = [
        str(row.get("team") or "").strip(),
        str(row.get("dept") or "").strip(),
        str(row.get("comp") or "").strip(),
    ]
    summary = " · ".join(bit for bit in summary_bits if bit) or str(row.get("jd") or "").strip()[:120]
    return {
        "company": company,
        "title": str(row.get("title") or "未命名岗位").strip(),
        "location": location,
        "time": str(row.get("date") or row.get("date_updated") or "—").strip(),
        "url": str(row.get("url") or row.get("apply_url") or "").strip(),
        "summary": summary,
        "source": str(row.get("id") or row.get("req_id") or "Hiring-Radar").strip(),
        "department": str(row.get("dept") or row.get("team") or "").strip(),
        "salary": str(row.get("comp") or "").strip(),
        "remote": str(row.get("remote") or "").strip(),
    }


def fetch_hiring_radar() -> dict:
    script = _find_local_script() or _ensure_upstream_script()
    items: list[dict] = []
    companies: list[str] = []
    for company in DEFAULT_COMPANIES:
        try:
            rows = _run_company(script, company)
        except Exception:
            continue
        if not rows:
            continue
        canonical = _safe_company_name(rows[0], company.upper())
        companies.append(canonical)
        for row in rows[:6]:
            items.append(_normalize_item(canonical, row))

    items.sort(key=lambda item: item.get("time", ""), reverse=True)
    trimmed = items[:MAX_ITEMS]
    summary = "；".join(
        f"{item['company']}：{item['title']}（{item['location']}）"
        for item in trimmed[:6]
    ) or "暂无招聘信号，稍后重试。"
    data = _empty_payload()
    data.update({
        "summary": summary,
        "items": trimmed,
        "companies": companies or [name.upper() for name in DEFAULT_COMPANIES],
    })
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def get_hiring_radar(force: bool = False) -> dict:
    if force:
        try:
            return fetch_hiring_radar()
        except Exception:
            return _empty_payload()
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        try:
            return fetch_hiring_radar()
        except Exception:
            return _empty_payload()
