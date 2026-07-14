#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

"$ROOT_DIR/scripts/check-acceptance.sh"
"$ROOT_DIR/scripts/check-frontend-build.sh"
"$ROOT_DIR/scripts/check-backend.sh"
