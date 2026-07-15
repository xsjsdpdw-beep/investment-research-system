#!/bin/sh
set -eu

NODE_BIN_DIR="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
PNPM_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm"
NODE_MODULES_DIR="/Users/leo/Documents/投研体系/frontend/node_modules"
LOG_FILE="/tmp/vibe-research-frontend.log"
PID=$(lsof -tiTCP:5899 -sTCP:LISTEN || true)

echo "=== Frontend Doctor ==="

if [ -d "$NODE_BIN_DIR" ]; then
  echo "Bundled Node runtime: ready"
else
  echo "Bundled Node runtime: missing ($NODE_BIN_DIR)"
fi

if [ -x "$PNPM_BIN" ]; then
  echo "Bundled pnpm: ready"
else
  echo "Bundled pnpm: missing ($PNPM_BIN)"
fi

if [ -d "$NODE_MODULES_DIR" ]; then
  echo "Frontend dependencies: ready"
else
  echo "Frontend dependencies: missing ($NODE_MODULES_DIR)"
fi

if [ -n "$PID" ]; then
  echo "Frontend listener: running on 5899 (PID $PID)"
else
  echo "Frontend listener: not running on 5899"
fi

if [ -f "$LOG_FILE" ]; then
  echo "Frontend log: present ($LOG_FILE)"
else
  echo "Frontend log: missing ($LOG_FILE)"
fi
