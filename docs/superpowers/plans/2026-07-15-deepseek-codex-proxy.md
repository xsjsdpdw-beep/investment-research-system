# DeepSeek Codex Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Responses-to-DeepSeek proxy so Codex can use DeepSeek through a local OpenAI-compatible bridge.

**Architecture:** Add a focused FastAPI proxy module in `backend/` that translates Responses requests into DeepSeek Chat Completions calls and wraps the result back into a minimal Responses payload. Add a small startup helper and switch Codex config to the local proxy only after tests and live verification pass.

**Tech Stack:** Python, FastAPI, requests, pytest, uvicorn

## Global Constraints

- Keep the proxy local-only on `127.0.0.1`.
- Support text chat plus function-tool round-trips first.
- Do not add streaming or image support in this change.
- Reuse existing backend dependencies where possible.

---

### Task 1: Add translation tests

**Files:**
- Create: `backend/tests/test_deepseek_codex_proxy.py`
- Test: `backend/tests/test_deepseek_codex_proxy.py`

- [ ] Write failing tests for string input translation and tool-call response wrapping.
- [ ] Run the new pytest file and confirm failure because the proxy module does not exist yet.

### Task 2: Implement the proxy

**Files:**
- Create: `backend/deepseek_codex_proxy.py`
- Modify: `backend/tests/test_deepseek_codex_proxy.py`

- [ ] Implement minimal request/response models and conversion helpers.
- [ ] Implement `/health`, `/v1/models`, and `/v1/responses`.
- [ ] Re-run the proxy test file and make it pass.

### Task 3: Add a local startup helper

**Files:**
- Create: `scripts/dev-deepseek-codex-proxy.sh`

- [ ] Add a small launcher that starts the proxy with uvicorn on `127.0.0.1:8787`.
- [ ] Verify the script is executable and starts cleanly with `DEEPSEEK_API_KEY`.

### Task 4: Switch Codex to the local proxy and verify live

**Files:**
- Modify: `/Users/leo/.codex/config.toml`

- [ ] Back up the existing Codex config.
- [ ] Point a new `model_provider` at `http://127.0.0.1:8787/v1`.
- [ ] Verify the proxy responds to a live `curl` request.
- [ ] Leave a short rollback path in the final summary.
