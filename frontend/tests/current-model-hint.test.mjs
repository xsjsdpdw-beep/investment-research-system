import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_MODEL_HINT_CLASSNAME } from "../src/lib/current-model-hint.ts";

test("current model hint default class keeps the row vertically centered", () => {
  assert.match(DEFAULT_MODEL_HINT_CLASSNAME, /\binline-flex\b/);
  assert.match(DEFAULT_MODEL_HINT_CLASSNAME, /\bitems-center\b/);
  assert.match(DEFAULT_MODEL_HINT_CLASSNAME, /min-h-\[38px\]/);
});
