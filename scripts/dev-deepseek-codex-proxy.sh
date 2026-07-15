#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY is required"
  exit 1
fi

cd "$ROOT_DIR"
exec "$ROOT_DIR/.venv/bin/python3" -m uvicorn \
  --app-dir "$ROOT_DIR/backend" \
  deepseek_codex_proxy:app \
  --host 127.0.0.1 \
  --port 8787
