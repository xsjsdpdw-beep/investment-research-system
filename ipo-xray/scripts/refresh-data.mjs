import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot } from "../data/sources.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "data/live-snapshot.json");
let previousSnapshot = null;
try {
  previousSnapshot = JSON.parse(await readFile(output, "utf8"));
} catch {
  previousSnapshot = null;
}
const snapshot = await buildSnapshot({ limit: 500, previousSnapshot });

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Wrote ${snapshot.projects.length} projects to ${output}`);
if (snapshot.stats.errors.length) {
  console.error(snapshot.stats.errors.join("\n"));
  process.exitCode = 1;
}
