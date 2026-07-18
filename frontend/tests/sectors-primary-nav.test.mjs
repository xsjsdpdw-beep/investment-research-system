import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/lib/workspace.ts", import.meta.url), "utf8");

test("板块中心 is a first-level route instead of redirecting into framework", () => {
  assert.match(routerSource, /import \{ Sectors \} from "@\/pages\/Sectors"/);
  assert.match(routerSource, /import \{ SectorDetail \} from "@\/pages\/SectorDetail"/);
  assert.match(routerSource, /\{ path: "\/sectors", element: <Sectors \/> \}/);
  assert.match(routerSource, /\{ path: "\/sectors\/:key", element: <SectorDetail \/> \}/);
  assert.doesNotMatch(routerSource, /\{ path: "\/sectors", element: <Navigate to="\/framework" replace \/> \}/);
});

test("板块中心 appears before 框架沉淀 in the first-level sidebar", () => {
  const sectorsIndex = workspaceSource.indexOf('to: "/sectors"');
  const frameworkIndex = workspaceSource.indexOf('to: "/framework"');

  assert.ok(sectorsIndex >= 0);
  assert.ok(frameworkIndex >= 0);
  assert.ok(sectorsIndex < frameworkIndex);
  assert.match(workspaceSource, /label: "板块中心"/);
});
