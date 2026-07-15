#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
LOG_FILE="/tmp/vibe-research-backend.log"

"$ROOT_DIR/scripts/stop-backend.sh"

if [ -f "$LOG_FILE" ]; then
  rm -f "$LOG_FILE"
  echo "Removed backend log at $LOG_FILE."
else
  echo "Backend log already clean."
fi

echo "Backend cleanup complete."
