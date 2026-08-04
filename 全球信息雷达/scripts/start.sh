#!/bin/sh
set -eu

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUNTIME_DIR="${RADAR_RUNTIME_DIR:-$HOME/.global-information-radar}"
mkdir -p "$RUNTIME_DIR"

if [ -f "$RUNTIME_DIR/backend.pid" ] && kill -0 "$(cat "$RUNTIME_DIR/backend.pid")" 2>/dev/null; then
  echo "backend already running: $(cat "$RUNTIME_DIR/backend.pid")"
else
  nohup python3 "$PROJECT_DIR/backend/server.py" >"$RUNTIME_DIR/backend.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/backend.pid"
fi

if [ -f "$RUNTIME_DIR/frontend.pid" ] && kill -0 "$(cat "$RUNTIME_DIR/frontend.pid")" 2>/dev/null; then
  echo "frontend already running: $(cat "$RUNTIME_DIR/frontend.pid")"
else
  nohup python3 -m http.server 5910 --bind 127.0.0.1 --directory "$PROJECT_DIR/frontend" >"$RUNTIME_DIR/frontend.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/frontend.pid"
fi

echo "web: http://127.0.0.1:5910"
echo "api: http://127.0.0.1:8910/api/health"

