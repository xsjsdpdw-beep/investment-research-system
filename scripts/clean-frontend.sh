#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
LOG_FILE="/tmp/vibe-research-frontend.log"

"$ROOT_DIR/scripts/stop-frontend.sh"

if [ -f "$LOG_FILE" ]; then
  rm -f "$LOG_FILE"
  echo "Removed frontend log at $LOG_FILE."
else
  echo "Frontend log already clean."
fi

echo "Frontend cleanup complete."
