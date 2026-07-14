#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
NODE_BIN_DIR="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PNPM_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"

if [ -d "$NODE_BIN_DIR" ]; then
  PATH="$NODE_BIN_DIR:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Missing node runtime. Expected bundled node at $NODE_BIN_DIR or a node binary on PATH." >&2
  exit 1
fi

if [ ! -x "$PNPM_BIN" ]; then
  echo "Missing pnpm launcher: $PNPM_BIN" >&2
  exit 1
fi

cd "$ROOT_DIR/frontend"
"$PNPM_BIN" install
"$PNPM_BIN" approve-builds --all
