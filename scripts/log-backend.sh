#!/bin/sh
set -eu

LOG_FILE="/tmp/vibe-research-backend.log"

echo "=== Backend Log ==="
if [ ! -f "$LOG_FILE" ]; then
  echo "Backend log not found yet: $LOG_FILE"
  exit 0
fi

tail -n 40 "$LOG_FILE"
