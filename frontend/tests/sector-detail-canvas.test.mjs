import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/pages/SectorDetail.tsx", import.meta.url), "utf8");

test("SectorDetail renders the industry draft canvas directly inside 板块中心", () => {
  assert.match(source, /import \{ IndustryDraftCanvas \} from "@\/components\/research\/IndustryDraftCanvas"/);
  assert.match(source, /const \[selectedOverviewTabId, setSelectedOverviewTabId\] = useState\(""\)/);
  assert.match(source, /onClick=\{\(\) => setSelectedOverviewTabId\(tab\.id\)\}/);
  assert.match(source, /<IndustryDraftCanvas key=\{selectedOverviewTabId \|\| "default"\} data=\{draftSchema\} scopeType="sector" scopeId=\{sector\.label\} initialActiveTabId=\{selectedOverviewTabId \|\| undefined\} isInitialDraftCanvas \/>/);
});

test("SectorDetail keeps the board-center canvas read-only", () => {
  assert.doesNotMatch(source, /editing/);
  assert.doesNotMatch(source, /保存画布/);
});
