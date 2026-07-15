#!/usr/bin/env bash
set -euo pipefail

LABEL="com.leo.deepseek-codex-proxy"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
rm -f "${PLIST_PATH}"

echo "Removed ${LABEL}"
