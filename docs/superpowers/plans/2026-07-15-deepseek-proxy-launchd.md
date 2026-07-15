# DeepSeek Proxy Launchd Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local DeepSeek Codex proxy auto-start on macOS login through a LaunchAgent.

**Architecture:** Add a tiny Python helper that renders the LaunchAgent plist so we can test it, then add focused shell scripts for install, uninstall, and status. Keep credentials in a local env file under `~/.codex` and reuse the existing proxy launcher.

**Tech Stack:** Python, pytest, shell, launchd

## Global Constraints

- Keep the service user-scoped under `~/Library/LaunchAgents`.
- Keep `DEEPSEEK_API_KEY` outside the repo.
- Reuse the existing proxy startup script.
- Verify both registration state and live HTTP health.

---

### Task 1: Test plist rendering

**Files:**
- Create: `backend/tests/test_deepseek_launchd.py`
- Test: `backend/tests/test_deepseek_launchd.py`

- [ ] Write the failing plist rendering test.
- [ ] Run the test file and confirm failure because the helper module does not exist.

### Task 2: Implement launchd helper

**Files:**
- Create: `backend/deepseek_launchd.py`

- [ ] Implement plist rendering and path helpers.
- [ ] Re-run the test file and make it pass.

### Task 3: Add install and status scripts

**Files:**
- Create: `scripts/install-deepseek-codex-proxy-agent.sh`
- Create: `scripts/uninstall-deepseek-codex-proxy-agent.sh`
- Create: `scripts/status-deepseek-codex-proxy-agent.sh`

- [ ] Add focused scripts for install, uninstall, and status.
- [ ] Verify the scripts are executable.

### Task 4: Install and verify locally

**Files:**
- Modify: `~/.codex/deepseek-proxy.env`
- Create: `~/Library/LaunchAgents/com.leo.deepseek-codex-proxy.plist`

- [ ] Write the env file with the current DeepSeek key.
- [ ] Install and kickstart the LaunchAgent.
- [ ] Verify `launchctl` status.
- [ ] Verify proxy health over HTTP.
