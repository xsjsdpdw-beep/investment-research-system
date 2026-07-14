#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Missing backend runtime: $PYTHON_BIN" >&2
  echo "Create the backend virtual environment before using scripts/dev-backend.sh." >&2
  exit 1
fi

cd "$ROOT_DIR/backend"
exec "$PYTHON_BIN" -m uvicorn app:app --host 127.0.0.1 --port 8900
