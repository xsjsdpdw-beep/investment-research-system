#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Missing backend runtime: $PYTHON_BIN" >&2
  echo "Create the backend virtual environment before using scripts/check-acceptance.sh." >&2
  exit 1
fi

cd "$ROOT_DIR"
exec "$PYTHON_BIN" -m pytest tests/test_branding_acceptance.py -q
