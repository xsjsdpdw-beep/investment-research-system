#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PYTHON_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "Missing bundled Python runtime: $PYTHON_BIN" >&2
  exit 1
fi

cd "$BACKEND_DIR"
"$PYTHON_BIN" -m venv .venv
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r requirements.txt
"$VENV_PYTHON" -m pip install -r requirements-dev.txt
