#!/bin/sh
set -eu

PID=$(lsof -tiTCP:8900 -sTCP:LISTEN || true)
export PID

python3 - <<'PY'
from urllib.request import urlopen
import json
import os

pid = os.environ.get("PID", "")
if not pid:
    print("Backend status: not running on 8900.")
    raise SystemExit(0)

try:
    data = json.loads(urlopen("http://127.0.0.1:8900/api/health", timeout=1).read())
except Exception:
    print(f"Backend status: listening on 8900 with PID {pid}, but /api/health is not reachable.")
    raise SystemExit(0)

if data.get("service") == "investment-research-api":
    print(f"Backend status: healthy on 8900 with PID {pid}.")
else:
    print(f"Backend status: listening on 8900 with PID {pid}, but health payload is unexpected: {data}.")
PY
