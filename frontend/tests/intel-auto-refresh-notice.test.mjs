import test from "node:test";
import assert from "node:assert/strict";

import { formatIntelAutoRefreshNotice } from "../src/lib/intel-auto-refresh-notice.ts";

test("formats auto refresh notice with a known timestamp", () => {
  assert.equal(
    formatIntelAutoRefreshNotice("2026-07-18 19:20"),
    "发现新内容，已自动更新（19:20）",
  );
});

test("formats auto refresh notice without timestamp", () => {
  assert.equal(
    formatIntelAutoRefreshNotice(null),
    "发现新内容，已自动更新",
  );
});
