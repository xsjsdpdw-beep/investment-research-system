#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

"$ROOT_DIR/scripts/status-backend.sh"
"$ROOT_DIR/scripts/status-frontend.sh"
