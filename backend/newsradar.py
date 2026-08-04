"""资讯雷达数据层 —— 移植自 investment-news。

抓 12 赛道 108 个公开 RSS 源 → 合规过滤（赌/预测市场/加密/色情）+ 最近 N 天
+ 按赛道分组、时间倒序。纯标准库 + 线程池，零 key、零个股字段。

AI「今日要点」不在此模块——复用 Vibe-Research 的可插拔 AI 层（前端调 /api/chat，
把某赛道资讯打包给用户自己的模型提炼）。本模块只出客观资讯。
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES_FILE = os.path.join(HERE, "news_sources.json")
CACHE_DIR = os.path.join(HERE, ".cache")
CACHE_FILE = os.path.join(CACHE_DIR, "radar.json")
MODULES = {"tech", "macro", "industry", "stock", "geopolitics"}
DEFAULT_MODULE_BY_KEY = {
    "ai": "tech",
    "semi": "tech",
    "robot": "tech",
    "tech": "tech",
    "consumer": "tech",
    "science": "tech",
    "macro": "macro",
    "security": "geopolitics",
    "space": "geopolitics",
    "auto": "industry",
    "energy": "industry",
    "bio": "industry",
}

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
BEIJING = timezone(timedelta(hours=8))

SOURCE_TIER_OFFICIAL = {
    "Federal Reserve", "国家统计局", "中国人民银行", "美国劳工统计局",
    "U.S. Bureau of Labor Statistics", "SEC",
}
SOURCE_TIER_ONE = {
    "Reuters", "Bloomberg", "Financial Times", "The Wall Street Journal",
    "WSJ Markets", "CNBC", "MarketWatch", "华尔街见闻",
}


def _default_source_tier(name: str) -> str:
    if name in SOURCE_TIER_OFFICIAL:
        return "T1"
    if name in SOURCE_TIER_ONE:
        return "T1.5"
    return "T2"


def _normalize_config(raw: dict) -> dict:
    cfg = dict(raw or {})
    fetch = cfg.get("fetch") or {}
    industries = []
    for item in cfg.get("industries") or []:
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        module = str(item.get("module") or DEFAULT_MODULE_BY_KEY.get(key, "industry")).strip()
        if module not in MODULES:
            module = "industry"
        industries.append({
            "key": key,
            "name": str(item.get("name") or key).strip(),
            "accent": str(item.get("accent") or "#ff5a1f").strip(),
            "module": module,
        })
    sources = []
    for item in cfg.get("sources") or []:
        name = str(item.get("name") or "").strip()
        hint = str(item.get("hint") or "").strip()
        source_type = str(item.get("type") or "rss").strip() or "rss"
        url = str(item.get("url") or "").strip()
        tier = str(item.get("tier") or _default_source_tier(name)).strip()
        if tier not in {"T1", "T1.5", "T2"}:
            tier = "T2"
        if not name or not hint:
            continue
        if source_type == "rss" and not url:
            continue
        sources.append({
            "name": name,
            "hint": hint,
            "type": source_type,
            "url": url,
            "tier": tier,
        })
    return {
        "_comment": cfg.get("_comment") or "investment-news sources config",
        "fetch": {
            "per_source": int(fetch.get("per_source") or 6),
            "timeout": int(fetch.get("timeout") or 15),
            "recent_days": int(fetch.get("recent_days") or 7),
        },
        "redline_keywords": list(dict.fromkeys(cfg.get("redline_keywords") or [])),
        "industries": industries,
        "sources": sources,
    }


def load_sources_config() -> dict:
    return _normalize_config(json.load(open(SOURCES_FILE, encoding="utf-8")))


def save_sources_config(payload: dict) -> dict:
    cfg = _normalize_config(payload)
    hint_keys = {item["key"] for item in cfg["industries"]}
    for source in cfg["sources"]:
        if source["hint"] not in hint_keys:
            raise ValueError(f"信息源 {source['name']} 的 hint 未匹配任何主题：{source['hint']}")
    tmp = SOURCES_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    os.replace(tmp, SOURCES_FILE)
    return cfg


def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def _local(tag: str) -> str:
    return tag.split("}")[-1]


def _parse_dt(s: str):
    if not s:
        return None
    try:
        dt = parsedate_to_datetime(s)
    except Exception:
        try:
            dt = datetime.fromisoformat(s.strip().replace("Z", "+00:00"))
        except Exception:
            return None
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _fetch_source(src: dict, per: int, cutoff, redline: list[str]):
    """抓单个 RSS 源；返回 items 列表，出错返回 None。"""
    try:
        req = urllib.request.Request(src["url"], headers={
            "User-Agent": UA,
            "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
        })
        with urllib.request.urlopen(req, timeout=14) as r:
            raw = r.read()
        root = ET.fromstring(raw)
        out = []
        for n in [e for e in root.iter() if _local(e.tag) in ("item", "entry")]:
            if len(out) >= per:
                break
            d = {
                "title": "", "url": "", "time": "", "ts": 0,
                "summary": "", "source": src["name"], "tier": src.get("tier", "T2"),
            }
            rawtime = ""
            for c in n:
                t = _local(c.tag)
                if t == "title" and not d["title"]:
                    d["title"] = (c.text or "").strip()
                elif t == "link" and not d["url"]:
                    d["url"] = c.get("href") or (c.text or "").strip()
                elif t in ("pubDate", "published", "updated", "date") and not rawtime:
                    rawtime = (c.text or "").strip()
                elif t in ("description", "summary", "content") and not d["summary"]:
                    d["summary"] = _strip_html(c.text or "")[:160]
            if not d["title"]:
                continue
            blob = (d["title"] + " " + d["summary"]).lower()
            if any(k in blob for k in redline):  # 合规红线过滤
                continue
            dt = _parse_dt(rawtime)
            if dt is not None:
                if cutoff and dt < cutoff:
                    continue
                d["time"] = dt.astimezone(BEIJING).strftime("%m-%d %H:%M")
                d["ts"] = int(dt.timestamp())
            else:
                d["time"] = "—"
            out.append(d)
        return out
    except Exception:
        return None


def fetch_radar() -> dict:
    """抓全部源，返回 12 赛道数据并落盘缓存。"""
    cfg = load_sources_config()
    days = cfg.get("fetch", {}).get("recent_days", 7)
    per = cfg.get("fetch", {}).get("per_source", 6)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    redline = [k.lower() for k in cfg.get("redline_keywords", [])]

    byhint: dict[str, list] = {}
    for s in cfg["sources"]:
        byhint.setdefault(s["hint"], []).append(s)

    industries, tasks = [], []
    for i, ind in enumerate(cfg["industries"]):
        pool = byhint.get(ind["key"], [])
        industries.append({"key": ind["key"], "name": ind["name"], "accent": ind["accent"], "total": len(pool), "items": []})
        for s in pool:
            if s.get("type") == "rss" and s.get("url"):
                tasks.append((i, s))

    with ThreadPoolExecutor(max_workers=40) as ex:
        results = list(ex.map(lambda t: (t[0], _fetch_source(t[1], per, cutoff, redline)), tasks))

    failed = 0
    for idx, items in results:
        if items is None:
            failed += 1
            continue
        industries[idx]["items"].extend(items)
    for ind in industries:
        ind["items"].sort(key=lambda x: x.get("ts", 0), reverse=True)

    data = {
        "generated_at": datetime.now(BEIJING).strftime("%Y-%m-%d %H:%M"),
        "recent_days": days,
        "industries": industries,
        "stats": {"industries": len(cfg["industries"]), "total_sources": len(cfg["sources"]), "failed_sources": failed},
    }
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = CACHE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, CACHE_FILE)  # 原子改名，防两次并发刷新交错写坏缓存
    return data


def load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def skeleton() -> dict:
    """无缓存时返回赛道骨架（空 items），前端提示点刷新。"""
    cfg = load_sources_config()
    byhint: dict[str, int] = {}
    for s in cfg["sources"]:
        byhint[s["hint"]] = byhint.get(s["hint"], 0) + 1
    return {
        "generated_at": None,
        "recent_days": cfg.get("fetch", {}).get("recent_days", 7),
        "industries": [{"key": i["key"], "name": i["name"], "accent": i["accent"], "total": byhint.get(i["key"], 0), "items": []} for i in cfg["industries"]],
        "stats": {"industries": len(cfg["industries"]), "total_sources": len(cfg["sources"])},
    }


def get_radar(force: bool = False) -> dict:
    if force:
        return fetch_radar()
    return load_cache() or skeleton()
