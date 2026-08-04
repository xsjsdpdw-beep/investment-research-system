from __future__ import annotations

import json
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

try:
    from .db import DOMAINS, Database, iso_now
    from .ingest import FetchError, canonicalize_url, fetch_source
    from .processor import OptionalProcessor
except ImportError:  # direct `python backend/server.py` execution
    from db import DOMAINS, Database, iso_now
    from ingest import FetchError, canonicalize_url, fetch_source
    from processor import OptionalProcessor


HOST = os.environ.get("RADAR_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("RADAR_API_PORT", "8910"))
DB = Database()
PROCESSOR = OptionalProcessor(DB)
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
ACTIVE_SOURCES: set[str] = set()
ACTIVE_LOCK = threading.Lock()


def json_response(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200, headers: dict | None = None) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    for key, value in (headers or {}).items():
        handler.send_header(key, value)
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or 0)
    if length > 2_000_000:
        raise ValueError("request body too large")
    raw = handler.rfile.read(length) if length else b"{}"
    value = json.loads(raw.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("request body must be an object")
    return value


def update_job(job_id: str, **values) -> None:
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(values)


def record_job_result(job_id: str | None, outcome: dict) -> None:
    if not job_id:
        return
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["completed"] += 1
        job["results"].append(outcome)
        if job["completed"] >= job["total"]:
            job["status"] = "completed"


def run_source(source_id: str, job_id: str | None = None, force: bool = False) -> dict:
    with ACTIVE_LOCK:
        if source_id in ACTIVE_SOURCES:
            outcome = {"source_id": source_id, "status": "skipped", "error": "source already running"}
            record_job_result(job_id, outcome)
            return outcome
    ACTIVE_SOURCES.add(source_id)
    source = DB.get_source(source_id)
    if not source:
        with ACTIVE_LOCK:
            ACTIVE_SOURCES.discard(source_id)
        outcome = {"source_id": source_id, "status": "error", "error": "source not found"}
        record_job_result(job_id, outcome)
        return outcome
    if not source["enabled"] and not force:
        with ACTIVE_LOCK:
            ACTIVE_SOURCES.discard(source_id)
        outcome = {"source_id": source_id, "status": "skipped", "error": "source disabled"}
        record_job_result(job_id, outcome)
        return outcome
    started = iso_now()
    state = DB.get_state(source_id)
    try:
        result = fetch_source(source, state)
        fetched = len(result.get("items", []))
        inserted = 0
        duplicates = 0
        item_ids = []
        for item in result.get("items", []):
            item_id, outcome = DB.upsert_item(item, source)
            if not item_id:
                continue
            item_ids.append(item_id)
            if outcome == "inserted":
                inserted += 1
            elif outcome == "duplicate":
                duplicates += 1
        DB.set_source_state(source_id, etag=result.get("etag") or state.get("etag"), last_modified=result.get("last_modified") or state.get("last_modified"), last_success_at=iso_now(), next_allowed_at=(datetime.now(timezone.utc) + timedelta(seconds=source["poll_interval_sec"])).isoformat(timespec="seconds"), last_error=None, consecutive_failures=0)
        DB.record_run(source_id, started, result.get("status", "ok"), fetched, inserted, duplicates)
        if item_ids and PROCESSOR.enabled():
            PROCESSOR.enrich_items([DB.get_item(item_id) for item_id in item_ids if DB.get_item(item_id)])
        outcome = {"source_id": source_id, "status": result.get("status", "ok"), "fetched_count": fetched, "inserted_count": inserted, "duplicate_count": duplicates}
    except FetchError as exc:
        failures = int(state.get("consecutive_failures") or 0) + 1
        retry = exc.retry_after or min(3600, max(60, 2 ** min(failures, 6) * 30))
        DB.set_source_state(source_id, last_error=str(exc), next_allowed_at=(datetime.now(timezone.utc) + timedelta(seconds=retry)).isoformat(timespec="seconds"), consecutive_failures=failures)
        DB.record_run(source_id, started, "error", error=str(exc), retry_after=retry)
        outcome = {"source_id": source_id, "status": "error", "error": str(exc), "retry_after": retry}
    except Exception as exc:  # noqa: BLE001
        DB.set_source_state(source_id, last_error=str(exc), next_allowed_at=(datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(timespec="seconds"), consecutive_failures=int(state.get("consecutive_failures") or 0) + 1)
        DB.record_run(source_id, started, "error", error=str(exc))
        outcome = {"source_id": source_id, "status": "error", "error": str(exc)}
    record_job_result(job_id, outcome)
    with ACTIVE_LOCK:
        ACTIVE_SOURCES.discard(source_id)
    return outcome


def run_refresh(source_ids: list[str], job_id: str, force: bool = False) -> None:
    if not source_ids:
        update_job(job_id, status="completed", completed=0)
        return
    workers = min(24, len(source_ids))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="radar-refresh") as pool:
        futures = [pool.submit(run_source, source_id, job_id, force) for source_id in source_ids]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001
                # Keep the batch moving even if an unexpected worker error escapes.
                record_job_result(job_id, {"status": "error", "error": str(exc)})
    update_job(job_id, status="completed", finished_at=iso_now())


def start_refresh(source_ids: list[str] | None = None, force: bool = True) -> dict:
    sources = DB.list_sources()
    ids = source_ids if source_ids is not None else [source["id"] for source in sources if source["enabled"]]
    job_id = uuid.uuid4().hex[:16]
    job = {"id": job_id, "status": "queued", "total": len(ids), "completed": 0, "results": [], "started_at": iso_now()}
    with JOBS_LOCK:
        JOBS[job_id] = job
    thread = threading.Thread(target=run_refresh, args=(ids, job_id, force), daemon=True)
    thread.start()
    return job


def scheduler_loop() -> None:
    while True:
        try:
            if DB.get_settings().get("polling_enabled", True):
                now = datetime.now(timezone.utc)
                for source in DB.list_sources():
                    if not source["enabled"]:
                        continue
                    state = source.get("state") or {}
                    next_allowed = state.get("next_allowed_at")
                    if next_allowed:
                        try:
                            if datetime.fromisoformat(next_allowed.replace("Z", "+00:00")) > now:
                                continue
                        except ValueError:
                            pass
                    threading.Thread(target=run_source, args=(source["id"],), daemon=True).start()
        except Exception:
            pass
        time.sleep(30)


class Handler(BaseHTTPRequestHandler):
    server_version = "GlobalInformationRadar/0.1"

    def log_message(self, fmt, *args):
        return

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        try:
            self._get()
        except Exception as exc:  # noqa: BLE001
            json_response(self, {"error": str(exc)}, 400)

    def do_POST(self):  # noqa: N802
        try:
            self._write("POST")
        except Exception as exc:  # noqa: BLE001
            json_response(self, {"error": str(exc)}, 400)

    def do_PUT(self):  # noqa: N802
        try:
            self._write("PUT")
        except Exception as exc:  # noqa: BLE001
            json_response(self, {"error": str(exc)}, 400)

    def do_DELETE(self):  # noqa: N802
        try:
            self._write("DELETE")
        except Exception as exc:  # noqa: BLE001
            json_response(self, {"error": str(exc)}, 400)

    def _get(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
        if path == "/api/health":
            json_response(self, {"ok": True, "service": "global-information-radar", "version": "0.1.0", "data_dir": str(DB.runtime_dir)})
        elif path == "/api/sources":
            json_response(self, {"sources": DB.list_sources()})
        elif path == "/api/sources/export":
            data = json.dumps(DB.export_sources(), ensure_ascii=False, indent=2)
            json_response(self, {"format": query.get("format", "json"), "content": data})
        elif path == "/api/topics":
            json_response(self, {"domains": [{"key": key, "label": label} for key, label in DOMAINS.items()], "topics": DB.list_topics()})
        elif path == "/api/hot-topics":
            json_response(self, {"items": DB.get_hot_topics()})
        elif path == "/api/items":
            payload = DB.list_items(mode=query.get("mode", "selected"), domain=query.get("domain") or None, topic=query.get("topic") or None, source_id=query.get("source_id") or None, q=query.get("q") or None, window=query.get("window", "7d"), by=query.get("by", "timeline"), cursor=query.get("cursor") or None, limit=int(query.get("limit", "40")))
            json_response(self, payload)
        elif path.startswith("/api/items/"):
            item = DB.get_item(path.split("/", 3)[3])
            if not item:
                json_response(self, {"error": "item not found"}, 404)
            else:
                json_response(self, {"item": item})
        elif path == "/api/daily/latest":
            json_response(self, {"report": DB.get_daily_report(processor=PROCESSOR)})
        elif path.startswith("/api/daily/"):
            json_response(self, {"report": DB.get_daily_report(path.split("/", 3)[3], processor=PROCESSOR)})
        elif path.startswith("/api/refresh/"):
            job_id = path.split("/", 3)[3]
            with JOBS_LOCK:
                job = dict(JOBS.get(job_id) or {})
            if not job:
                json_response(self, {"error": "refresh job not found"}, 404)
            else:
                json_response(self, {"job": job})
        elif path == "/api/settings/processor":
            json_response(self, {"settings": PROCESSOR.settings()})
        else:
            json_response(self, {"error": "not found"}, 404)

    def _write(self, method: str):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        payload = read_json(self) if method != "DELETE" else {}
        if path == "/api/sources" and method == "POST":
            json_response(self, {"source": DB.save_source(payload)}, 201)
        elif path.startswith("/api/sources/") and path.endswith("/test") and method == "POST":
            source_id = path.split("/")[3]
            source = DB.get_source(source_id)
            if not source:
                json_response(self, {"error": "source not found"}, 404)
                return
            result = fetch_source(source, DB.get_state(source_id))
            sample = [{"title": item["title"], "url": item["original_url"], "published_at": item["published_at"]} for item in result.get("items", [])[:5]]
            json_response(self, {"result": {"status": result.get("status"), "count": len(result.get("items", [])), "sample": sample, "bytes": result.get("bytes", 0)}})
        elif path.startswith("/api/sources/") and method == "PUT":
            source_id = path.split("/", 3)[3]
            json_response(self, {"source": DB.save_source(payload, source_id)}, 200)
        elif path.startswith("/api/sources/") and method == "DELETE":
            source_id = path.split("/", 3)[3]
            json_response(self, {"disabled": DB.delete_source(source_id)})
        elif path == "/api/sources/import" and method == "POST":
            json_response(self, {"sources": DB.import_sources(payload)})
        elif path == "/api/refresh" and method == "POST":
            source_ids = payload.get("source_ids") if isinstance(payload.get("source_ids"), list) else None
            json_response(self, {"job": start_refresh(source_ids, force=bool(payload.get("force", True)))}, 202)
        elif path.startswith("/api/items/") and path.endswith("/favorite") and method == "POST":
            item_id = path.split("/")[3]
            json_response(self, {"item": DB.set_favorite(item_id, bool(payload.get("favorite", True)))})
        elif path == "/api/settings/processor" and method == "PUT":
            json_response(self, {"settings": DB.update_settings(payload)})
        elif path == "/api/topics" and method == "POST":
            json_response(self, {"topic": DB.save_topic(payload.get("label"), payload.get("domain"), payload.get("keywords"))}, 201)
        else:
            json_response(self, {"error": "not found"}, 404)


def main() -> None:
    threading.Thread(target=scheduler_loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"global information radar API listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
