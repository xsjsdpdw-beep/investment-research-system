import plistlib

import deepseek_launchd as launchd


def test_render_launch_agent_plist_has_expected_paths():
    xml_text = launchd.render_launch_agent_plist(
        label="com.leo.deepseek-codex-proxy",
        working_dir="/Users/leo/.codex/deepseek-proxy",
        env_file="/Users/leo/.codex/deepseek-proxy.env",
        log_dir="/Users/leo/.codex/logs",
        command_path="/Users/leo/.codex/deepseek-proxy/start.sh",
    )

    data = plistlib.loads(xml_text.encode("utf-8"))

    assert data["Label"] == "com.leo.deepseek-codex-proxy"
    assert data["RunAtLoad"] is True
    assert data["KeepAlive"] is True
    assert data["WorkingDirectory"] == "/Users/leo/.codex/deepseek-proxy"
    assert data["StandardOutPath"] == "/Users/leo/.codex/logs/deepseek-codex-proxy.log"
    assert data["StandardErrorPath"] == "/Users/leo/.codex/logs/deepseek-codex-proxy.log"
    assert data["ProgramArguments"][0] == "/bin/zsh"
    assert "source '/Users/leo/.codex/deepseek-proxy.env'" in data["ProgramArguments"][2]
    assert "/Users/leo/.codex/deepseek-proxy/start.sh" in data["ProgramArguments"][2]
