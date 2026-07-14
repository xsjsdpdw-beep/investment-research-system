#!/bin/sh
set -eu

PID=$(lsof -tiTCP:5899 -sTCP:LISTEN || true)

if [ -n "$PID" ]; then
  kill "$PID"
  echo "Stopped frontend on 5899."
else
  echo "Frontend already stopped."
fi
