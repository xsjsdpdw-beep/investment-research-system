import test from "node:test";
import assert from "node:assert/strict";

import { normalizeModelId } from "../src/lib/ai-models.ts";

test("normalizeModelId maps legacy MiniMax display names to canonical model ids", () => {
  assert.equal(normalizeModelId("MiniMax M3"), "MiniMax-M3");
  assert.equal(normalizeModelId("MiniMax M2"), "MiniMax-M2");
});

test("normalizeModelId keeps already valid ids unchanged", () => {
  assert.equal(normalizeModelId("MiniMax-M3"), "MiniMax-M3");
  assert.equal(normalizeModelId("deepseek-v4-pro"), "deepseek-v4-pro");
});
