#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

"$ROOT_DIR/scripts/clean-backend.sh"
"$ROOT_DIR/scripts/clean-frontend.sh"
