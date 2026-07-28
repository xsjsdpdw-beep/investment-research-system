import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_PYTHON = "/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 IPO-XRAY/0.3";
const PYTHON_EXTRACTOR = String.raw`
from pypdf import PdfReader
import sys

reader = PdfReader(sys.argv[1])
parts = []
for index, page in enumerate(reader.pages, start=1):
    parts.append(f"[[PAGE {index}]]")
    parts.append(page.extract_text() or "")
sys.stdout.buffer.write("\n".join(parts).encode("utf-8", "replace"))
`;

async function fetchPdf(url, { referer, timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
        Referer: referer || "https://www2.hkexnews.hk/",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

function runPython(binary, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-c", PYTHON_EXTRACTOR, filePath], { stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    const errors = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(output).toString("utf8"));
      else reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `python exit ${code}`));
    });
  });
}

async function extractWithPython(filePath) {
  const candidates = [process.env.IPO_XRAY_PYTHON, DEFAULT_PYTHON, "python3"].filter(Boolean);
  let lastError;
  for (const binary of candidates) {
    try {
      return await runPython(binary, filePath);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No Python PDF extractor available");
}

export async function extractPdfText(url, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "ipo-xray-pdf-"));
  const filePath = join(directory, "source.pdf");
  try {
    const bytes = await fetchPdf(url, options);
    await writeFile(filePath, bytes);
    const text = await extractWithPython(filePath);
    return { text, bytes: bytes.length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
