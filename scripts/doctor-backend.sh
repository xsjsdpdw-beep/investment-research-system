#!/bin/sh
set -eu

PYTHON_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
VENV_PYTHON="/Users/leo/Documents/投研体系/backend/.venv/bin/python"
LOG_FILE="/tmp/vibe-research-backend.log"
PID=$(lsof -tiTCP:8900 -sTCP:LISTEN || true)

echo "=== Backend Doctor ==="

if [ -x "$PYTHON_BIN" ]; then
  echo "Bundled Python: ready"
else
  echo "Bundled Python: missing ($PYTHON_BIN)"
fi

if [ -x "$VENV_PYTHON" ]; then
  echo "Backend venv: ready"
else
  echo "Backend venv: missing ($VENV_PYTHON)"
fi

if [ -n "$PID" ]; then
  echo "Backend listener: running on 8900 (PID $PID)"
else
  echo "Backend listener: not running on 8900"
fi

if [ -f "$LOG_FILE" ]; then
  echo "Backend log: present ($LOG_FILE)"
else
  echo "Backend log: missing ($LOG_FILE)"
fi
