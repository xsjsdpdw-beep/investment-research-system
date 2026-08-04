#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
export VR_RESTART_ROOT="$ROOT_DIR"

"$ROOT_DIR/scripts/stop-all.sh"

python3 - <<'PY'
from urllib.request import urlopen
import os
import subprocess
import json
import time
from pathlib import Path


root_dir = Path(os.environ["VR_RESTART_ROOT"])


def launch(script_name: str, log_name: str) -> None:
    log_path = Path("/tmp") / log_name
    with log_path.open("ab") as log_file:
        subprocess.Popen(
            [str(root_dir / "scripts" / script_name)],
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )


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


launch("dev-backend.sh", "vibe-research-backend.log")
launch("dev-frontend.sh", "vibe-research-frontend.log")

wait_backend()
wait_frontend()
print("Restarted backend and frontend.")
PY
