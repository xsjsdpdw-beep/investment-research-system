from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from tempfile import TemporaryDirectory

from backend.db import Database
from backend.ingest import FetchError, canonicalize_url, fetch_source, parse_json_api, parse_rss
from backend.processor import OptionalProcessor


RSS_FIXTURE = '''<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:example.com,2026:one</id>
    <title>央行释放流动性信号</title>
    <link href="https://example.com/story/one?utm_source=test" />
    <summary><![CDATA[宏观摘要 <b>含标签</b>]]></summary>
    <published>2026-07-27T08:00:00Z</published>
  </entry>
</feed>'''.encode("utf-8")


class FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/etag" and self.headers.get("If-None-Match") == '"fixture"':
            self.send_response(304)
            self.send_header("ETag", '"fixture"')
            self.end_headers()
            return
        body = RSS_FIXTURE if self.path in {"/rss", "/etag"} else '{"items":[{"id":"j1","title":"JSON 事件","url":"https://example.com/json","summary":"摘要","published_at":"2026-07-27T08:00:00Z"}]}'.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/rss+xml" if self.path == "/rss" else "application/json")
        self.send_header("ETag", '"fixture"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return


class RadarTests(unittest.TestCase):
    def test_rss_atom_parser_normalizes_fields(self):
        source = {"id": "rss", "domain": "macro", "topics": ["利率"]}
        items = parse_rss(RSS_FIXTURE, source)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "央行释放流动性信号")
        self.assertEqual(items[0]["canonical_url"], "https://example.com/story/one")
        self.assertIn("含标签", items[0]["summary"])
        self.assertEqual(items[0]["published_at"], "2026-07-27T08:00:00+00:00")

    def test_json_mapping_and_invalid_json(self):
        source = {"domain": "industry", "topics": ["汽车"], "mapping": {"items_path": "data.rows", "id": "key", "title": "headline", "url": "link", "summary": "abstract", "published_at": "time"}}
        raw = json.dumps({"data": {"rows": [{"key": "1", "headline": "行业变化", "link": "https://example.com/a", "abstract": "摘要", "time": "2026-07-27T08:00:00Z"}]}}).encode()
        items = parse_json_api(raw, source)
        self.assertEqual(items[0]["source_item_id"], "1")
        self.assertEqual(items[0]["title"], "行业变化")
        with self.assertRaises(FetchError):
            parse_json_api(b"not-json", source)

    def test_http_etag_304_and_canonical_url(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            endpoint = f"http://127.0.0.1:{server.server_port}/etag"
            source = {"id": "rss", "type": "rss", "endpoint": endpoint, "timeout_sec": 3, "topics": []}
            first = fetch_source(source)
            self.assertEqual(first["status"], "ok")
            second = fetch_source(source, {"etag": first["etag"]})
            self.assertEqual(second["status"], "not_modified")
            self.assertEqual(canonicalize_url("HTTPS://Example.com/a?gclid=1&x=2#frag"), "https://example.com/a?x=2")
        finally:
            server.shutdown()
            server.server_close()

    def test_database_dedup_search_favorite_and_daily(self):
        with TemporaryDirectory() as runtime:
            db = Database(runtime)
            source = db.save_source({"id": "fixture", "name": "Fixture", "type": "rss", "endpoint": "https://example.com/rss", "domain": "macro", "topics": ["利率"], "priority": 80})
            items = parse_rss(RSS_FIXTURE, source)
            item_id, outcome = db.upsert_item(items[0], source)
            self.assertEqual(outcome, "inserted")
            second_source = db.save_source({"id": "fixture2", "name": "Fixture 2", "type": "rss", "endpoint": "https://example.com/rss2", "domain": "macro", "topics": ["利率"]})
            _, duplicate_outcome = db.upsert_item(items[0], second_source)
            self.assertEqual(duplicate_outcome, "duplicate")
            result = db.list_items(mode="all", domain="macro", q="央行", window="all")
            self.assertEqual(result["page"]["count"], 1)
            db.set_favorite(item_id, True)
            favorites = db.list_items(mode="favorites", window="all")
            self.assertEqual(favorites["page"]["count"], 1)
            report = db.build_daily_report("2026-07-27")
            self.assertEqual(report["mode"], "facts")
            self.assertEqual(report["sections"][0]["items"][0]["item_id"], item_id)

    def test_optional_processor_is_off_by_default(self):
        with TemporaryDirectory() as runtime:
            processor = OptionalProcessor(Database(runtime))
            self.assertFalse(processor.enabled())


if __name__ == "__main__":
    unittest.main()
