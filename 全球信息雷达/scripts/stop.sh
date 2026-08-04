#!/bin/sh
set -eu

RUNTIME_DIR="${RADAR_RUNTIME_DIR:-$HOME/.global-information-radar}"
for name in backend frontend; do
  pid_file="$RUNTIME_DIR/$name.pid"
  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "stopped $name: $pid"
    fi
    rm -f "$pid_file"
  fi
done

