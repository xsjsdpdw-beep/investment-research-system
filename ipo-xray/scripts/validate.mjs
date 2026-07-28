import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const required = ["index.html", "styles.css", "app.js", "data/snapshot.js", "data/live-snapshot.json", "server.mjs"];

for (const file of required) {
  const content = await readFile(join(root, file), "utf8");
  if (!content.trim()) throw new Error(`${file} is empty`);
}

const html = await readFile(join(root, "index.html"), "utf8");
const js = await readFile(join(root, "app.js"), "utf8");
const snapshot = await readFile(join(root, "data/snapshot.js"), "utf8");
const live = JSON.parse(await readFile(join(root, "data/live-snapshot.json"), "utf8"));

for (const marker of ["IPO X光机", "app.js", "styles.css", "IPO_XRAY_SNAPSHOT"]) {
  if (![html, js, snapshot].some((content) => content.includes(marker))) {
    throw new Error(`missing marker: ${marker}`);
  }
}

const projectCount = (snapshot.match(/\n      id:\s*"(?:HK|A)-/g) || []).length;
if (projectCount < 4) throw new Error(`expected at least 4 seeded projects, found ${projectCount}`);

for (const removed of ["自选股复盘", "新闻与公告"]) {
  if (js.includes(removed)) throw new Error(`removed workspace still present: ${removed}`);
}
for (const moduleName of ["总览", "事件研究", "发行质量评分", "本周动态"]) {
  if (!js.includes(moduleName)) throw new Error(`missing module: ${moduleName}`);
}
if (live.historyStart !== "2024-01-01") throw new Error(`unexpected history start: ${live.historyStart}`);
const aCount = live.projects.filter((project) => project.market === "A").length;
const hkCount = live.projects.filter((project) => project.market === "HK").length;
if (aCount < 200 || hkCount < 200) throw new Error(`historical coverage too small: A=${aCount}, HK=${hkCount}`);

console.log(`validated ${required.length} files, seeded=${projectCount}, live A=${aCount}, HK=${hkCount}`);
