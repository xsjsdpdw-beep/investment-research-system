#!/bin/sh
set -eu

PID=$(lsof -tiTCP:5899 -sTCP:LISTEN || true)
export PID

python3 - <<'PY'
from urllib.request import urlopen
import os

pid = os.environ.get("PID", "")
if not pid:
    print("Frontend status: not running on 5899.")
    raise SystemExit(0)

try:
    html = urlopen("http://127.0.0.1:5899", timeout=1).read().decode("utf-8", "ignore")
except Exception:
    print(f"Frontend status: listening on 5899 with PID {pid}, but the app root is not reachable.")
    raise SystemExit(0)

if "投研体系" in html:
    print(f"Frontend status: reachable on 5899 with PID {pid}.")
else:
    print(f"Frontend status: listening on 5899 with PID {pid}, but the app root did not contain the expected title.")
PY
