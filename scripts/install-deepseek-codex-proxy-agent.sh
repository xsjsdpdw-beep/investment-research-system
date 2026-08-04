#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.leo.deepseek-codex-proxy"
ENV_FILE="${HOME}/.codex/deepseek-proxy.env"
LOG_DIR="${HOME}/.codex/logs"
RUNTIME_DIR="${HOME}/.codex/deepseek-proxy"
RUNTIME_VENV="${RUNTIME_DIR}/.venv"
RUNTIME_START="${RUNTIME_DIR}/start.sh"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
PYTHON_BIN="$(command -v python3)"

if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  PYTHON_CMD=(arch -arm64 "${PYTHON_BIN}")
else
  PYTHON_CMD=("${PYTHON_BIN}")
fi

mkdir -p "${HOME}/.codex" "${LOG_DIR}" "${HOME}/Library/LaunchAgents" "${RUNTIME_DIR}"

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  if [[ -f "${ENV_FILE}" ]]; then
    echo "Using existing ${ENV_FILE}"
  else
    echo "DEEPSEEK_API_KEY is required on first install"
    exit 1
  fi
else
  printf "export DEEPSEEK_API_KEY='%s'\n" "${DEEPSEEK_API_KEY}" > "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
fi

cp "${ROOT_DIR}/backend/deepseek_codex_proxy.py" "${RUNTIME_DIR}/deepseek_codex_proxy.py"

if ! "${RUNTIME_VENV}/bin/python3" -c 'import fastapi, uvicorn, requests' >/dev/null 2>&1; then
  if [[ -d "${RUNTIME_VENV}" ]]; then
    mv "${RUNTIME_VENV}" "${RUNTIME_DIR}/.venv-backup-$(date +%Y%m%d%H%M%S)"
  fi
  "${PYTHON_CMD[@]}" -m venv "${RUNTIME_VENV}"
  "${RUNTIME_VENV}/bin/python3" -m pip install --upgrade fastapi uvicorn requests >/dev/null
fi

cat > "${RUNTIME_START}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd '${RUNTIME_DIR}'
exec '${RUNTIME_VENV}/bin/python3' -m uvicorn deepseek_codex_proxy:app --host 127.0.0.1 --port 8787
EOF
chmod +x "${RUNTIME_START}"

cd "${ROOT_DIR}"
export RUNTIME_DIR RUNTIME_START ENV_FILE LOG_DIR
"${PYTHON_CMD[@]}" - <<'PY' > "${PLIST_PATH}"
from backend.deepseek_launchd import LAUNCH_AGENT_LABEL, render_launch_agent_plist
import os

runtime_dir = os.environ["RUNTIME_DIR"]
runtime_start = os.environ["RUNTIME_START"]
env_file = os.environ["ENV_FILE"]
log_dir = os.environ["LOG_DIR"]
print(
    render_launch_agent_plist(
        LAUNCH_AGENT_LABEL,
        runtime_dir,
        env_file,
        log_dir,
        runtime_start,
    ),
    end="",
)
PY

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
launchctl bootstrap "gui/$(id -u)" "${PLIST_PATH}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "Installed ${LABEL}"
