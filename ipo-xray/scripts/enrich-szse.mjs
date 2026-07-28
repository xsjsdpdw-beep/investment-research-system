import { readFile, writeFile } from "node:fs/promises";
import { enrichSzseProject } from "../data/sources.mjs";

const output = new URL("../data/live-snapshot.json", import.meta.url);
const snapshot = JSON.parse(await readFile(output, "utf8"));
const targets = snapshot.projects.filter((project) => project.id.startsWith("A-SZSE-") && !project.detailLoaded);
let cursor = 0;
let completed = 0;
let failed = 0;

async function worker() {
  while (cursor < targets.length) {
    const project = targets[cursor++];
    try {
      const enriched = await enrichSzseProject(project);
      snapshot.projects = snapshot.projects.map((item) => item.id === enriched.id ? enriched : item);
    } catch (error) {
      failed += 1;
      console.error(`${project.id} ${project.name}: ${error.message}`);
    }
    completed += 1;
    if (completed % 5 === 0 || completed === targets.length) {
      await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      console.log(`深交所深度解析 ${completed}/${targets.length}，失败 ${failed}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(3, Math.max(1, targets.length)) }, worker));
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`完成：解析 ${completed} 个，失败 ${failed} 个`);
