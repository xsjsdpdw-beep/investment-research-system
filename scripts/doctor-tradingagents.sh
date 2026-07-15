#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"
DEFAULT_REPO_DIR="$BACKEND_DIR/.cache/TradingAgents-astock"
REPO_DIR="${VR_TRADINGAGENTS_DIR:-$DEFAULT_REPO_DIR}"

echo "=== TradingAgents Doctor ==="

if [ -d "$REPO_DIR/.git" ] || [ -f "$REPO_DIR/pyproject.toml" ]; then
  echo "TradingAgents source: present ($REPO_DIR)"
else
  echo "TradingAgents source: missing ($REPO_DIR)"
fi

if [ -x "$VENV_PYTHON" ]; then
  echo "Backend venv python: ready ($VENV_PYTHON)"
else
  echo "Backend venv python: missing ($VENV_PYTHON)"
fi

if [ -x "$VENV_PYTHON" ]; then
  if "$VENV_PYTHON" -c "import tradingagents" >/dev/null 2>&1; then
    echo "TradingAgents import: ready"
  else
    echo "TradingAgents import: missing from backend virtual environment"
  fi
else
  echo "TradingAgents import: skipped (backend virtual environment missing)"
fi

echo "Recommended setup: scripts/init-tradingagents.sh"
