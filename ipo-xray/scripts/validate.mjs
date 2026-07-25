import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const required = ["index.html", "styles.css", "app.js", "data/snapshot.js", "server.mjs"];

for (const file of required) {
  const content = await readFile(join(root, file), "utf8");
  if (!content.trim()) throw new Error(`${file} is empty`);
}

const html = await readFile(join(root, "index.html"), "utf8");
const js = await readFile(join(root, "app.js"), "utf8");
const snapshot = await readFile(join(root, "data/snapshot.js"), "utf8");

for (const marker of ["ipo-xray", "app.js", "styles.css", "IPO_XRAY_SNAPSHOT"]) {
  if (![html, js, snapshot].some((content) => content.includes(marker))) {
    throw new Error(`missing marker: ${marker}`);
  }
}

const projectCount = (snapshot.match(/\n      id:\s*"(?:HK|A)-/g) || []).length;
if (projectCount < 4) throw new Error(`expected at least 4 seeded projects, found ${projectCount}`);

console.log(`validated ${required.length} files and ${projectCount} seeded projects`);
