from fastapi.testclient import TestClient

import deepseek_codex_proxy as proxy


client = TestClient(proxy.app)


def test_models_lists_deepseek_defaults():
    resp = client.get("/v1/models")
    assert resp.status_code == 200
    body = resp.json()
    assert body["object"] == "list"
    assert body["data"][0]["id"] == "deepseek-v4-pro"


def test_responses_translates_text_input_and_wraps_output(monkeypatch):
    monkeypatch.setattr(proxy, "_deepseek_api_key", lambda: "sekret")

    captured = {}

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "id": "chatcmpl-1",
                "model": "deepseek-v4-pro",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "pong",
                            "reasoning_content": "short reasoning",
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 3,
                    "completion_tokens": 5,
                    "total_tokens": 8,
                },
            }

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(proxy.requests, "post", fake_post)

    resp = client.post(
        "/v1/responses",
        json={
            "model": "deepseek-v4-pro",
            "input": "ping",
            "instructions": "be concise",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["json"]["model"] == "deepseek-v4-pro"
    assert captured["json"]["messages"] == [
        {"role": "system", "content": "be concise"},
        {"role": "user", "content": "ping"},
    ]
    assert body["object"] == "response"
    assert body["model"] == "deepseek-v4-pro"
    assert body["output_text"] == "pong"
    assert body["output"][0]["type"] == "reasoning"
    assert body["output"][1]["type"] == "message"
    assert body["output"][1]["content"][0]["text"] == "pong"


def test_responses_wraps_tool_calls(monkeypatch):
    monkeypatch.setattr(proxy, "_deepseek_api_key", lambda: "sekret")

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "id": "chatcmpl-2",
                "model": "deepseek-v4-pro",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_123",
                                    "type": "function",
                                    "function": {
                                        "name": "run_shell",
                                        "arguments": "{\"cmd\":\"pwd\"}",
                                    },
                                }
                            ],
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 10,
                    "completion_tokens": 7,
                    "total_tokens": 17,
                },
            }

    monkeypatch.setattr(proxy.requests, "post", lambda *args, **kwargs: FakeResponse())

    resp = client.post(
        "/v1/responses",
        json={
            "model": "deepseek-v4-pro",
            "input": [{"type": "message", "role": "user", "content": "where am i"}],
            "tools": [
                {
                    "type": "function",
                    "name": "run_shell",
                    "description": "run a shell command",
                    "parameters": {"type": "object"},
                }
            ],
        },
    )

    assert resp.status_code == 200
    output = resp.json()["output"]
    assert output[0]["type"] == "function_call"
    assert output[0]["call_id"] == "call_123"
    assert output[0]["name"] == "run_shell"
    assert output[0]["arguments"] == "{\"cmd\":\"pwd\"}"
