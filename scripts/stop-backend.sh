#!/bin/sh
set -eu

PID=$(lsof -tiTCP:8900 -sTCP:LISTEN || true)

if [ -n "$PID" ]; then
  kill "$PID"
  echo "Stopped backend on 8900."
else
  echo "Backend already stopped."
fi
