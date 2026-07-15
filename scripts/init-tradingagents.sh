#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
VENV_PYTHON="$BACKEND_DIR/.venv/bin/python"
GIT_BIN="/Users/leo/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git"
DEFAULT_REPO_DIR="$BACKEND_DIR/.cache/TradingAgents-astock"
REPO_DIR="${VR_TRADINGAGENTS_DIR:-$DEFAULT_REPO_DIR}"
REPO_URL="${VR_TRADINGAGENTS_REPO_URL:-https://github.com/simonlin1212/TradingAgents-astock.git}"
LOCAL_SEED_DIR="${VR_TRADINGAGENTS_LOCAL_SEED_DIR:-/tmp/TradingAgents-astock}"

if [ ! -x "$VENV_PYTHON" ]; then
  echo "Missing backend runtime: $VENV_PYTHON" >&2
  echo "Run scripts/init-backend.sh before installing TradingAgents." >&2
  exit 1
fi

if [ ! -x "$GIT_BIN" ]; then
  echo "Missing bundled git runtime: $GIT_BIN" >&2
  exit 1
fi

mkdir -p "$(dirname "$REPO_DIR")"

if [ ! -d "$REPO_DIR/.git" ]; then
  rm -rf "$REPO_DIR"
  if [ -d "$LOCAL_SEED_DIR/.git" ] || [ -f "$LOCAL_SEED_DIR/pyproject.toml" ]; then
    echo "Copying TradingAgents-astock from local seed $LOCAL_SEED_DIR into $REPO_DIR"
    cp -R "$LOCAL_SEED_DIR" "$REPO_DIR"
  else
    echo "Cloning TradingAgents-astock into $REPO_DIR"
    "$GIT_BIN" clone --depth 1 "$REPO_URL" "$REPO_DIR"
  fi
else
  echo "TradingAgents source already present at $REPO_DIR"
fi

echo "Installing TradingAgents into backend virtual environment"
"$VENV_PYTHON" -m pip install -e "$REPO_DIR"

echo "TradingAgents installation ready"
echo "Repo: $REPO_DIR"
echo "Python: $VENV_PYTHON"
