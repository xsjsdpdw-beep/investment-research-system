#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
NODE_BIN_DIR="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
VITE_BIN="$ROOT_DIR/frontend/node_modules/.bin/vite"

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "Missing frontend dependencies: $ROOT_DIR/frontend/node_modules" >&2
  echo "Install frontend dependencies before using scripts/dev-frontend.sh." >&2
  exit 1
fi

if [ -d "$NODE_BIN_DIR" ]; then
  PATH="$NODE_BIN_DIR:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Missing node runtime. Expected bundled node at $NODE_BIN_DIR or a node binary on PATH." >&2
  exit 1
fi

if [ ! -x "$VITE_BIN" ]; then
  echo "Missing Vite launcher: $VITE_BIN" >&2
  echo "Reinstall frontend dependencies before using scripts/dev-frontend.sh." >&2
  exit 1
fi

cd "$ROOT_DIR/frontend"
exec "$VITE_BIN" --host 127.0.0.1 --port 5899
