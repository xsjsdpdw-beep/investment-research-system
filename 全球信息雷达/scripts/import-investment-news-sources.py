#!/usr/bin/env python3
"""Copy the existing 投研资讯 RSS source catalog into the standalone radar."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path


DEFAULT_SOURCE_FILE = Path(__file__).resolve().parents[2] / "backend" / "news_sources.json"
DEFAULT_API = "http://127.0.0.1:8910"
MODULE_TO_DOMAIN = {
    "macro": "macro",
    "geopolitics": "geopolitics",
    "industry": "industry",
    "stock": "stock",
    "tech": "global_tech",
}


def slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", value.lower()).strip("-")
    return value[:70] or "source"


def build_payload(path: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    industries = {item["key"]: item for item in raw.get("industries", [])}
    sources = []
    seen: Counter[str] = Counter()
    for item in raw.get("sources", []):
        name = str(item.get("name") or "").strip()
        endpoint = str(item.get("url") or "").strip()
        hint = str(item.get("hint") or "").strip()
        if not name or not endpoint.startswith(("http://", "https://")):
            continue
        category = industries.get(hint, {})
        legacy_module = str(category.get("module") or "tech")
        domain = MODULE_TO_DOMAIN.get(legacy_module, "global_tech")
        seen[name] += 1
        source_id = f"legacy-{slug(hint)}-{slug(name)}"
        if seen[name] > 1:
            source_id += f"-{seen[name]}"
        category_label = str(category.get("name") or hint)
        sources.append({
            "id": source_id,
            "name": name,
            "type": "rss",
            "endpoint": endpoint,
            "domain": domain,
            "topics": [category_label],
            "enabled": True,
            "poll_interval_sec": 900,
            "timeout_sec": int((raw.get("fetch") or {}).get("timeout") or 15),
            "priority": 50,
            "mapping": {
                "legacy_hint": hint,
                "legacy_module": legacy_module,
                "legacy_source_file": str(path),
            },
        })
    return {"sources": sources}


def post_json(api: str, path: str, payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        api.rstrip("/") + path,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "global-information-radar-import/0.1"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-file", type=Path, default=DEFAULT_SOURCE_FILE)
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    payload = build_payload(args.source_file)
    counts = Counter(source["domain"] for source in payload["sources"])
    print(f"prepared={len(payload['sources'])} domains={dict(counts)}")
    if args.dry_run:
        return
    result = post_json(args.api, "/api/sources/import", payload)
    print(f"imported={len(result.get('sources', []))}")


if __name__ == "__main__":
    main()
