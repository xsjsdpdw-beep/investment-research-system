#!/bin/sh
set -eu

LOG_FILE="/tmp/vibe-research-frontend.log"

echo "=== Frontend Log ==="
if [ ! -f "$LOG_FILE" ]; then
  echo "Frontend log not found yet: $LOG_FILE"
  exit 0
fi

tail -n 40 "$LOG_FILE"
