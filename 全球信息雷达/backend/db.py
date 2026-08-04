from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DOMAINS = {
    "macro": "宏观",
    "geopolitics": "地缘政治",
    "global_tech": "全球科技",
    "industry": "行业",
    "stock": "个股",
}

DEFAULT_TOPICS = [
    ("央行与利率", "macro"),
    ("通胀与就业", "macro"),
    ("贸易与制裁", "geopolitics"),
    ("冲突与安全", "geopolitics"),
    ("人工智能", "global_tech"),
    ("半导体", "global_tech"),
    ("云与数据中心", "global_tech"),
    ("能源", "industry"),
    ("汽车与机器人", "industry"),
    ("医药健康", "industry"),
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="seconds")


def slugify(value: str) -> str:
    value = str(value or "").strip().lower()
    value = re.sub(r"[^\w\-\u4e00-\u9fff]+", "-", value, flags=re.UNICODE)
    return value.strip("-")[:80] or uuid.uuid4().hex[:12]


def json_loads(value: str | None, default: Any):
    try:
        return json.loads(value or "")
    except (TypeError, ValueError):
        return default


def short_hash(*parts: str) -> str:
    raw = "\x1f".join(str(p or "") for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class Database:
    def __init__(self, runtime_dir: str | None = None):
        runtime = Path(runtime_dir or os.environ.get("RADAR_RUNTIME_DIR", str(Path.home() / ".global-information-radar"))).expanduser()
        runtime.mkdir(parents=True, exist_ok=True)
        self.runtime_dir = runtime
        self.path = runtime / "radar.sqlite3"
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=20)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 20000")
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('rss', 'json_api')),
                    endpoint TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    poll_interval_sec INTEGER NOT NULL DEFAULT 900,
                    timeout_sec INTEGER NOT NULL DEFAULT 15,
                    priority INTEGER NOT NULL DEFAULT 50,
                    mapping_json TEXT NOT NULL DEFAULT '{}',
                    headers_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS source_state (
                    source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
                    etag TEXT,
                    last_modified TEXT,
                    last_success_at TEXT,
                    next_allowed_at TEXT,
                    last_error TEXT,
                    consecutive_failures INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS source_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    status TEXT NOT NULL,
                    fetched_count INTEGER NOT NULL DEFAULT 0,
                    inserted_count INTEGER NOT NULL DEFAULT 0,
                    duplicate_count INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    retry_after INTEGER
                );
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
                    source_item_id TEXT,
                    title TEXT NOT NULL,
                    original_title TEXT,
                    summary TEXT,
                    content_text TEXT,
                    original_url TEXT NOT NULL,
                    canonical_url TEXT NOT NULL,
                    author TEXT,
                    published_at TEXT,
                    discovered_at TEXT NOT NULL,
                    domain TEXT NOT NULL,
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    entities_json TEXT NOT NULL DEFAULT '[]',
                    content_hash TEXT NOT NULL,
                    cluster_key TEXT NOT NULL,
                    duplicate_of TEXT REFERENCES items(id),
                    score REAL NOT NULL DEFAULT 0,
                    selected INTEGER NOT NULL DEFAULT 0,
                    selection_reason TEXT,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    generated_by TEXT,
                    model TEXT,
                    generated_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(source_id, source_item_id)
                );
                CREATE INDEX IF NOT EXISTS idx_items_time ON items(published_at DESC, discovered_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_items_domain ON items(domain, published_at DESC);
                CREATE INDEX IF NOT EXISTS idx_items_cluster ON items(cluster_key, published_at DESC);
                CREATE INDEX IF NOT EXISTS idx_items_url ON items(canonical_url);
                CREATE INDEX IF NOT EXISTS idx_items_hash ON items(content_hash);
                CREATE TABLE IF NOT EXISTS topics (
                    slug TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    domain TEXT,
                    keywords_json TEXT NOT NULL DEFAULT '[]',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS item_topics (
                    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    topic_slug TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
                    PRIMARY KEY(item_id, topic_slug)
                );
                CREATE TABLE IF NOT EXISTS daily_reports (
                    report_date TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    generated_at TEXT NOT NULL,
                    mode TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            now = iso_now()
            for label, domain in DEFAULT_TOPICS:
                slug = slugify(label)
                conn.execute(
                    "INSERT OR IGNORE INTO topics(slug,label,domain,created_at,updated_at) VALUES(?,?,?,?,?)",
                    (slug, label, domain, now, now),
                )
            defaults = {
                "processor_enabled": "false",
                "processor_mode": "off",
                "llm_base_url": "",
                "llm_model": "",
                "polling_enabled": "true",
            }
            for key, value in defaults.items():
                conn.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (key, value))

    def _source_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        data["enabled"] = bool(data.get("enabled"))
        data["topics"] = json_loads(data.pop("topics_json", "[]"), [])
        data["mapping"] = json_loads(data.pop("mapping_json", "{}"), {})
        data.pop("headers_json", None)
        state = self.get_source_state(data["id"])
        data["state"] = state
        return data

    def get_source_state(self, source_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM source_state WHERE source_id = ?", (source_id,)).fetchone()
            if not row:
                return {"status": "never", "last_success_at": None, "last_error": None, "consecutive_failures": 0}
            state = dict(row)
            if state.get("last_error"):
                state["status"] = "error"
            elif state.get("last_success_at"):
                state["status"] = "ok"
            else:
                state["status"] = "never"
            return state

    def list_sources(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM sources ORDER BY priority DESC, name COLLATE NOCASE").fetchall()
        return [self._source_dict(row) for row in rows]

    def get_source(self, source_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
        return self._source_dict(row) if row else None

    def save_source(self, payload: dict[str, Any], source_id: str | None = None) -> dict[str, Any]:
        source_id = str(source_id or payload.get("id") or slugify(payload.get("name", "source")))
        name = str(payload.get("name") or source_id).strip()[:120]
        source_type = str(payload.get("type") or "rss").strip()
        endpoint = str(payload.get("endpoint") or "").strip()
        domain = str(payload.get("domain") or "global_tech").strip()
        if source_type not in {"rss", "json_api"}:
            raise ValueError("source type must be rss or json_api")
        if not endpoint.startswith(("http://", "https://")):
            raise ValueError("endpoint must start with http:// or https://")
        if domain not in DOMAINS:
            raise ValueError("unknown domain")
        topics = [str(x).strip() for x in (payload.get("topics") or []) if str(x).strip()][:30]
        mapping = payload.get("mapping") if isinstance(payload.get("mapping"), dict) else {}
        headers = payload.get("headers") if isinstance(payload.get("headers"), dict) else {}
        # Headers are deliberately limited to non-secret diagnostic headers.
        headers = {str(k): str(v)[:300] for k, v in headers.items() if str(k).lower() not in {"authorization", "cookie", "x-api-key"}}
        enabled = 1 if bool(payload.get("enabled", True)) else 0
        poll = max(60, min(int(payload.get("poll_interval_sec") or 900), 86400))
        timeout = max(3, min(int(payload.get("timeout_sec") or 15), 120))
        priority = max(0, min(int(payload.get("priority") or 50), 100))
        now = iso_now()
        with self._connect() as conn:
            exists = conn.execute("SELECT created_at FROM sources WHERE id = ?", (source_id,)).fetchone()
            created = exists[0] if exists else now
            conn.execute(
                """INSERT INTO sources(id,name,type,endpoint,domain,topics_json,enabled,poll_interval_sec,timeout_sec,priority,mapping_json,headers_json,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,endpoint=excluded.endpoint,domain=excluded.domain,
                topics_json=excluded.topics_json,enabled=excluded.enabled,poll_interval_sec=excluded.poll_interval_sec,timeout_sec=excluded.timeout_sec,
                priority=excluded.priority,mapping_json=excluded.mapping_json,headers_json=excluded.headers_json,updated_at=excluded.updated_at""",
                (source_id, name, source_type, endpoint, domain, json.dumps(topics, ensure_ascii=False), enabled, poll, timeout, priority,
                 json.dumps(mapping, ensure_ascii=False), json.dumps(headers, ensure_ascii=False), created, now),
            )
            for topic in topics:
                slug = slugify(topic)
                conn.execute(
                    "INSERT INTO topics(slug,label,domain,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET domain=COALESCE(topics.domain, excluded.domain), updated_at=excluded.updated_at",
                    (slug, topic, domain, now, now),
                )
        return self.get_source(source_id) or {}

    def delete_source(self, source_id: str) -> bool:
        # Disable instead of deleting data, so source history remains auditable.
        with self._connect() as conn:
            result = conn.execute("UPDATE sources SET enabled=0, updated_at=? WHERE id=?", (iso_now(), source_id))
        return result.rowcount > 0

    def export_sources(self) -> dict[str, Any]:
        return {"sources": [{k: v for k, v in source.items() if k != "state"} for source in self.list_sources()]}

    def import_sources(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        values = payload.get("sources") if isinstance(payload, dict) else None
        if not isinstance(values, list):
            raise ValueError("import payload must contain sources[]")
        saved = []
        for source in values:
            if isinstance(source, dict):
                saved.append(self.save_source(source))
        return saved

    def get_state(self, source_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM source_state WHERE source_id=?", (source_id,)).fetchone()
        return dict(row) if row else {}

    def set_source_state(self, source_id: str, **values: Any) -> None:
        current = self.get_state(source_id)
        current.update(values)
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO source_state(source_id,etag,last_modified,last_success_at,next_allowed_at,last_error,consecutive_failures)
                VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET etag=excluded.etag,last_modified=excluded.last_modified,
                last_success_at=excluded.last_success_at,next_allowed_at=excluded.next_allowed_at,last_error=excluded.last_error,
                consecutive_failures=excluded.consecutive_failures""",
                (source_id, current.get("etag"), current.get("last_modified"), current.get("last_success_at"), current.get("next_allowed_at"),
                 current.get("last_error"), int(current.get("consecutive_failures") or 0)),
            )

    def record_run(self, source_id: str, started_at: str, status: str, fetched_count: int = 0, inserted_count: int = 0,
                   duplicate_count: int = 0, error: str | None = None, retry_after: int | None = None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO source_runs(source_id,started_at,finished_at,status,fetched_count,inserted_count,duplicate_count,error,retry_after) VALUES(?,?,?,?,?,?,?,?,?)",
                (source_id, started_at, iso_now(), status, fetched_count, inserted_count, duplicate_count, error, retry_after),
            )

    def upsert_item(self, item: dict[str, Any], source: dict[str, Any]) -> tuple[str, str]:
        now = iso_now()
        source_id = source["id"]
        source_item_id = str(item.get("source_item_id") or "").strip() or None
        original_url = str(item.get("original_url") or "").strip()
        canonical_url = str(item.get("canonical_url") or original_url).strip()
        title = str(item.get("title") or "").strip()
        summary = str(item.get("summary") or "").strip()[:3000] or None
        content_text = str(item.get("content_text") or "").strip()[:12000] or None
        if not title or not original_url:
            return "", "invalid"
        content_hash = str(item.get("content_hash") or short_hash(title, summary or ""))
        cluster_key = str(item.get("cluster_key") or slugify(re.sub(r"\s+", " ", title).strip())[:100])
        item_id = short_hash(source_id, source_item_id or "", canonical_url, title)[:32]
        topics = [str(x).strip() for x in item.get("topics", []) if str(x).strip()][:30]
        entities = [str(x).strip() for x in item.get("entities", []) if str(x).strip()][:30]
        score, selected, reason = self._rule_score(source, item)
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM items WHERE source_id=? AND source_item_id IS ?", (source_id, source_item_id)).fetchone()
            if existing:
                item_id = existing[0]
            duplicate = conn.execute(
                "SELECT id FROM items WHERE id != ? AND (canonical_url=? OR content_hash=?) AND duplicate_of IS NULL ORDER BY discovered_at LIMIT 1",
                (item_id, canonical_url, content_hash),
            ).fetchone()
            duplicate_of = duplicate[0] if duplicate else None
            conn.execute(
                """INSERT INTO items(id,source_id,source_item_id,title,original_title,summary,content_text,original_url,canonical_url,author,published_at,discovered_at,domain,topics_json,entities_json,content_hash,cluster_key,duplicate_of,score,selected,selection_reason,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET title=excluded.title,original_title=excluded.original_title,summary=excluded.summary,content_text=excluded.content_text,
                original_url=excluded.original_url,canonical_url=excluded.canonical_url,author=excluded.author,published_at=excluded.published_at,
                domain=excluded.domain,topics_json=excluded.topics_json,entities_json=excluded.entities_json,content_hash=excluded.content_hash,
                cluster_key=excluded.cluster_key,duplicate_of=excluded.duplicate_of,score=excluded.score,selected=excluded.selected,
                selection_reason=excluded.selection_reason,updated_at=excluded.updated_at""",
                (item_id, source_id, source_item_id, title, item.get("original_title") or title, summary, content_text, original_url, canonical_url,
                 item.get("author"), item.get("published_at"), item.get("discovered_at") or now, source["domain"], json.dumps(topics, ensure_ascii=False),
                 json.dumps(entities, ensure_ascii=False), content_hash, cluster_key, duplicate_of, score, selected, reason, now, now),
            )
            conn.execute("DELETE FROM item_topics WHERE item_id=?", (item_id,))
            for topic in topics:
                slug = slugify(topic)
                conn.execute("INSERT OR IGNORE INTO topics(slug,label,domain,created_at,updated_at) VALUES(?,?,?,?,?)", (slug, topic, source["domain"], now, now))
                conn.execute("INSERT OR IGNORE INTO item_topics(item_id,topic_slug) VALUES(?,?)", (item_id, slug))
        return item_id, "duplicate" if duplicate_of else ("updated" if existing else "inserted")

    def _rule_score(self, source: dict[str, Any], item: dict[str, Any]) -> tuple[float, int, str]:
        published = item.get("published_at")
        recency = 30.0
        if published:
            try:
                dt = datetime.fromisoformat(str(published).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                hours = max(0.0, (utc_now() - dt.astimezone(timezone.utc)).total_seconds() / 3600)
                recency = max(0.0, 45.0 - hours * 1.2)
            except ValueError:
                pass
        priority = max(0, min(int(source.get("priority") or 50), 100)) * 0.35
        score = round(min(100.0, recency + priority), 2)
        selected = 1 if score >= 48 else 0
        reason = f"规则精选：时效 {recency:.1f} + 来源优先级 {priority:.1f}"
        return score, selected, reason

    def _item_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        for key in ("topics_json", "entities_json"):
            data[key[:-5]] = json_loads(data.pop(key), [])
        data["selected"] = bool(data.get("selected"))
        data["is_favorite"] = bool(data.get("is_favorite"))
        data["source"] = data.pop("source_name", None) or data.get("source_id")
        data["source_type"] = data.pop("source_type", None)
        return data

    def _cursor_encode(self, value: str, item_id: str) -> str:
        return base64.urlsafe_b64encode(json.dumps({"v": value, "id": item_id}).encode()).decode().rstrip("=")

    def _cursor_decode(self, cursor: str) -> tuple[str, str]:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        return str(data["v"]), str(data["id"])

    def list_items(self, *, mode: str = "selected", domain: str | None = None, topic: str | None = None,
                   source_id: str | None = None, q: str | None = None, window: str = "7d", by: str = "timeline",
                   cursor: str | None = None, limit: int = 40) -> dict[str, Any]:
        limit = max(1, min(int(limit or 40), 100))
        time_column = "COALESCE(published_at, discovered_at)" if by == "published" else "discovered_at"
        conditions = ["i.duplicate_of IS NULL"]
        params: list[Any] = []
        if mode == "selected":
            conditions.append("i.selected=1")
        elif mode == "favorites":
            conditions.append("i.is_favorite=1")
        if domain and domain in DOMAINS:
            conditions.append("i.domain=?")
            params.append(domain)
        if topic:
            conditions.append("EXISTS (SELECT 1 FROM item_topics it WHERE it.item_id=i.id AND it.topic_slug=?)")
            params.append(slugify(topic))
        if source_id:
            conditions.append("i.source_id=?")
            params.append(source_id)
        if q and len(q.strip()) >= 2:
            like = f"%{q.strip()}%"
            conditions.append("(i.title LIKE ? OR i.original_title LIKE ? OR i.summary LIKE ? OR i.content_text LIKE ? OR s.name LIKE ?)")
            params.extend([like] * 5)
        if window in {"24h", "7d", "30d", "all"} and window != "all":
            hours = {"24h": 24, "7d": 168, "30d": 720}[window]
            cutoff = (utc_now() - timedelta(hours=hours)).isoformat()
            conditions.append(f"{time_column} >= ?")
            params.append(cutoff)
        if cursor:
            try:
                value, item_id = self._cursor_decode(cursor)
                conditions.append(f"({time_column} < ? OR ({time_column} = ? AND i.id < ?))")
                params.extend([value, value, item_id])
            except Exception as exc:
                raise ValueError(f"invalid cursor: {exc}") from exc
        where = " AND ".join(conditions)
        fetch_limit = limit + 1
        with self._connect() as conn:
            rows = conn.execute(
                f"""SELECT i.*, s.name AS source_name, s.type AS source_type FROM items i JOIN sources s ON s.id=i.source_id
                WHERE {where} ORDER BY {time_column} DESC, i.id DESC LIMIT ?""",
                (*params, fetch_limit),
            ).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._item_dict(row) for row in rows]
        next_cursor = None
        if has_more and rows:
            value = rows[-1]["published_at"] if by == "published" and rows[-1]["published_at"] else rows[-1]["discovered_at"]
            next_cursor = self._cursor_encode(value, rows[-1]["id"])
        return {
            "schema_version": 1,
            "query": {"mode": mode, "domain": domain, "topic": topic, "source_id": source_id, "window": window, "q": q, "by": by},
            "items": items,
            "page": {"count": len(items), "has_more": has_more, "next_cursor": next_cursor},
        }

    def get_item(self, item_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT i.*, s.name AS source_name, s.type AS source_type FROM items i JOIN sources s ON s.id=i.source_id WHERE i.id=?", (item_id,)).fetchone()
        return self._item_dict(row) if row else None

    def apply_enrichment(self, item_id: str, result: dict[str, Any], model: str) -> None:
        summary = str(result.get("summary") or "").strip()[:3000]
        topics = [str(x).strip() for x in (result.get("topics") or []) if str(x).strip()][:30]
        try:
            score = max(0.0, min(100.0, float(result.get("score") or 0)))
        except (TypeError, ValueError):
            score = 0.0
        reason = str(result.get("reason") or "模型精选").strip()[:500]
        now = iso_now()
        with self._connect() as conn:
            conn.execute("UPDATE items SET summary=COALESCE(NULLIF(?,''),summary),topics_json=?,score=?,selected=?,selection_reason=?,generated_by='optional_llm',model=?,generated_at=?,updated_at=? WHERE id=?", (summary, json.dumps(topics, ensure_ascii=False), score, 1 if score >= 50 else 0, reason, model, now, now, item_id))
            conn.execute("DELETE FROM item_topics WHERE item_id=?", (item_id,))
            for topic in topics:
                slug = slugify(topic)
                conn.execute("INSERT OR IGNORE INTO topics(slug,label,created_at,updated_at) VALUES(?,?,?,?)", (slug, topic, now, now))
                conn.execute("INSERT OR IGNORE INTO item_topics(item_id,topic_slug) VALUES(?,?)", (item_id, slug))

    def set_favorite(self, item_id: str, favorite: bool) -> dict[str, Any] | None:
        with self._connect() as conn:
            conn.execute("UPDATE items SET is_favorite=?, updated_at=? WHERE id=?", (1 if favorite else 0, iso_now(), item_id))
        return self.get_item(item_id)

    def list_topics(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT t.slug,t.label,t.domain,t.keywords_json,t.enabled,COUNT(it.item_id) AS item_count
                FROM topics t LEFT JOIN item_topics it ON it.topic_slug=t.slug LEFT JOIN items i ON i.id=it.item_id AND i.duplicate_of IS NULL
                WHERE t.enabled=1 GROUP BY t.slug ORDER BY t.domain, t.label COLLATE NOCASE"""
            ).fetchall()
        output = []
        for row in rows:
            item = dict(row)
            item["keywords"] = json_loads(item.pop("keywords_json"), [])
            item["enabled"] = bool(item["enabled"])
            output.append(item)
        return output

    def save_topic(self, label: str, domain: str | None = None, keywords: list[str] | None = None) -> dict[str, Any]:
        label = str(label or "").strip()[:120]
        if not label:
            raise ValueError("topic label is required")
        if domain and domain not in DOMAINS:
            raise ValueError("unknown domain")
        slug = slugify(label)
        now = iso_now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO topics(slug,label,domain,keywords_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET label=excluded.label,domain=COALESCE(excluded.domain,topics.domain),keywords_json=excluded.keywords_json,updated_at=excluded.updated_at",
                (slug, label, domain, json.dumps(keywords or [], ensure_ascii=False), now, now),
            )
        return next((item for item in self.list_topics() if item["slug"] == slug), {"slug": slug, "label": label, "domain": domain, "keywords": keywords or []})

    def get_hot_topics(self, limit: int = 8) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT i.cluster_key, MAX(i.title) AS title, MAX(i.id) AS representative_id,
                COUNT(DISTINCT i.source_id) AS source_count, COUNT(*) AS item_count, MAX(COALESCE(i.published_at,i.discovered_at)) AS latest_at,
                GROUP_CONCAT(DISTINCT s.name) AS source_names
                FROM items i JOIN sources s ON s.id=i.source_id WHERE i.duplicate_of IS NULL
                AND COALESCE(i.published_at,i.discovered_at) >= ? GROUP BY i.cluster_key
                HAVING COUNT(DISTINCT i.source_id) > 1 ORDER BY source_count DESC, latest_at DESC LIMIT ?""",
                ((utc_now() - timedelta(days=7)).isoformat(), max(1, min(limit, 30))),
            ).fetchall()
        return [
            {
                "id": row["cluster_key"],
                "title": row["title"],
                "representative_id": row["representative_id"],
                "source_count": row["source_count"],
                "item_count": row["item_count"],
                "latest_at": row["latest_at"],
                "source_names": (row["source_names"] or "").split(","),
            }
            for row in rows
        ]

    def build_daily_report(self, date_value: str | None = None, processor: Any = None) -> dict[str, Any]:
        date_value = date_value or datetime.now(timezone.utc).date().isoformat()
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT i.*, s.name AS source_name, s.type AS source_type FROM items i JOIN sources s ON s.id=i.source_id
                WHERE i.duplicate_of IS NULL AND substr(COALESCE(i.published_at,i.discovered_at),1,10)=?
                ORDER BY i.selected DESC, i.score DESC, COALESCE(i.published_at,i.discovered_at) DESC LIMIT 100""",
                (date_value,),
            ).fetchall()
        items = [self._item_dict(row) for row in rows]
        sections: dict[str, list[dict[str, Any]]] = {}
        for item in items:
            section = DOMAINS.get(item["domain"], item["domain"])
            sections.setdefault(section, []).append({
                "title": item["title"], "summary": item["summary"] or item["title"], "source": item["source"],
                "links": {"original": item["original_url"], "local": f"/item/{item['id']}"},
                "published_at": item["published_at"], "item_id": item["id"],
            })
        payload = {
            "schema_version": 1,
            "date": date_value,
            "generated_at": iso_now(),
            "mode": "facts",
            "lead": None,
            "sections": [{"label": key, "items": values[:8]} for key, values in sections.items()],
            "flashes": [
                {"title": item["title"], "source": item["source"], "published_at": item["published_at"], "item_id": item["id"]}
                for item in items[:12]
            ],
        }
        if processor and processor.enabled():
            payload = processor.enrich_daily(payload)
        with self._connect() as conn:
            conn.execute("INSERT INTO daily_reports(report_date,payload_json,generated_at,mode) VALUES(?,?,?,?) ON CONFLICT(report_date) DO UPDATE SET payload_json=excluded.payload_json,generated_at=excluded.generated_at,mode=excluded.mode", (date_value, json.dumps(payload, ensure_ascii=False), payload["generated_at"], payload["mode"]))
        return payload

    def get_daily_report(self, date_value: str | None = None, processor: Any = None) -> dict[str, Any]:
        date_value = date_value or datetime.now(timezone.utc).date().isoformat()
        with self._connect() as conn:
            row = conn.execute("SELECT payload_json FROM daily_reports WHERE report_date=?", (date_value,)).fetchone()
        if row:
            return json_loads(row[0], {})
        return self.build_daily_report(date_value, processor=processor)

    def get_settings(self) -> dict[str, Any]:
        with self._connect() as conn:
            rows = conn.execute("SELECT key,value FROM settings").fetchall()
        values = {row["key"]: row["value"] for row in rows}
        values["processor_enabled"] = values.get("processor_enabled") == "true"
        values["polling_enabled"] = values.get("polling_enabled", "true") == "true"
        return values

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        allowed = {"processor_enabled", "processor_mode", "llm_base_url", "llm_model", "polling_enabled"}
        with self._connect() as conn:
            for key, value in payload.items():
                if key in allowed:
                    if isinstance(value, bool):
                        value = "true" if value else "false"
                    conn.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))
        return self.get_settings()
