#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

"$ROOT_DIR/scripts/stop-all.sh"

nohup "$ROOT_DIR/scripts/dev-backend.sh" >/tmp/vibe-research-backend.log 2>&1 &
nohup "$ROOT_DIR/scripts/dev-frontend.sh" >/tmp/vibe-research-frontend.log 2>&1 &

python3 - <<'PY'
from urllib.request import urlopen
import json
import time


def wait_backend() -> None:
    for _ in range(20):
        try:
            data = json.loads(urlopen("http://127.0.0.1:8900/api/health", timeout=1).read())
            if data.get("service") == "investment-research-api":
                return
        except Exception:
            time.sleep(1)
    raise SystemExit("Backend did not become healthy on 127.0.0.1:8900.")


def wait_frontend() -> None:
    for _ in range(20):
        try:
            html = urlopen("http://127.0.0.1:5899", timeout=1).read().decode("utf-8", "ignore")
            if "投研体系" in html:
                return
        except Exception:
            time.sleep(1)
    raise SystemExit("Frontend did not become reachable on 127.0.0.1:5899.")


wait_backend()
wait_frontend()
print("Restarted backend and frontend.")
PY
