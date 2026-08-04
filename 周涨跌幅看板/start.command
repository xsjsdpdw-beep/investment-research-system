#!/bin/zsh
set -e
cd "$(dirname "$0")"
exec /usr/bin/python3 server.py --open
