from __future__ import annotations

import plistlib
from pathlib import Path


LAUNCH_AGENT_LABEL = "com.leo.deepseek-codex-proxy"


def render_launch_agent_plist(
    label: str,
    working_dir: str,
    env_file: str,
    log_dir: str,
    command_path: str,
) -> str:
    command = (
        f"source '{env_file}' && "
        f"exec '{command_path}'"
    )
    payload = {
        "Label": label,
        "RunAtLoad": True,
        "KeepAlive": True,
        "WorkingDirectory": working_dir,
        "ProgramArguments": ["/bin/zsh", "-lc", command],
        "StandardOutPath": f"{log_dir}/deepseek-codex-proxy.log",
        "StandardErrorPath": f"{log_dir}/deepseek-codex-proxy.log",
    }
    return plistlib.dumps(payload).decode("utf-8")


def default_paths(home: str) -> dict[str, str]:
    home_path = Path(home).expanduser()
    return {
        "env_file": str(home_path / ".codex" / "deepseek-proxy.env"),
        "log_dir": str(home_path / ".codex" / "logs"),
        "runtime_dir": str(home_path / ".codex" / "deepseek-proxy"),
        "plist_path": str(home_path / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"),
    }
