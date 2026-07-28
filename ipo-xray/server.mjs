import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot, enrichSzseProject } from "./data/sources.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.IPO_XRAY_PORT || 4178);
const liveSnapshot = join(root, "data/live-snapshot.json");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);

  if (requestPath.startsWith("/api/ipo/project/")) {
    const projectId = requestPath.slice("/api/ipo/project/".length);
    try {
      const snapshot = JSON.parse(await readFile(liveSnapshot, "utf8"));
      const project = snapshot.projects.find((item) => item.id === projectId);
      if (!project) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "project not found" }));
        return;
      }
      const enriched = project.id.startsWith("A-SZSE-") ? await enrichSzseProject(project) : project;
      snapshot.projects = snapshot.projects.map((item) => item.id === enriched.id ? enriched : item);
      await writeFile(liveSnapshot, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ project: enriched }));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "project enrichment failed", detail: error.message }));
    }
    return;
  }

  if (requestPath === "/api/ipo/snapshot") {
    try {
      const body = await readFile(liveSnapshot, "utf8");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(body);
    } catch (error) {
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "live snapshot unavailable", detail: error.message }));
    }
    return;
  }

  if (requestPath === "/api/ipo/refresh" && (request.method === "POST" || request.method === "GET")) {
    try {
      let previousSnapshot = null;
      try {
        previousSnapshot = JSON.parse(await readFile(liveSnapshot, "utf8"));
      } catch {
        previousSnapshot = null;
      }
      const snapshot = await buildSnapshot({ limit: 500, previousSnapshot });
      await writeFile(liveSnapshot, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(snapshot));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "refresh failed", detail: error.message }));
    }
    return;
  }

  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const absolutePath = normalize(join(root, relativePath));

  if (!absolutePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(absolutePath);
    response.writeHead(200, {
      "Content-Type": mime[extname(absolutePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`IPO X-RAY is running at http://127.0.0.1:${port}`);
});
