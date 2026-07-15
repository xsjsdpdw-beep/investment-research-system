#!/usr/bin/env bash
set -euo pipefail

LABEL="com.leo.deepseek-codex-proxy"

echo "=== launchctl ==="
launchctl print "gui/$(id -u)/${LABEL}" || true
echo
echo "=== health ==="
curl -sS http://127.0.0.1:8787/health || true
