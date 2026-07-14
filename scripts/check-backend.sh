#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PYTEST_BIN="$ROOT_DIR/backend/.venv/bin/pytest"

if [ ! -x "$PYTEST_BIN" ]; then
  echo "Missing backend test runner: $PYTEST_BIN" >&2
  echo "Install backend test dependencies before using scripts/check-backend.sh." >&2
  exit 1
fi

cd "$ROOT_DIR/backend"
exec "$PYTEST_BIN" -m "not live"
