from __future__ import annotations

import os
import time
import uuid
from typing import Any

import requests
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse


DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_CHAT_COMPLETIONS_URL = f"{DEEPSEEK_BASE_URL}/chat/completions"
DEFAULT_MODELS = ["deepseek-v4-pro", "deepseek-v4-flash"]
REQUEST_TIMEOUT_S = 120

app = FastAPI(title="DeepSeek Codex Proxy", version="0.1.0")


def _deepseek_api_key() -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(500, "Missing DEEPSEEK_API_KEY for local DeepSeek proxy")
    return api_key


def _content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if not isinstance(item, dict):
                raise HTTPException(400, "Unsupported content item in Responses input")
            text = item.get("text")
            if text is not None:
                parts.append(str(text))
                continue
            if item.get("type") in {"input_text", "output_text"} and "text" in item:
                parts.append(str(item["text"]))
        return "".join(parts)
    raise HTTPException(400, "Unsupported content shape in Responses input")


def _normalize_chat_role(role: str) -> str:
    role = (role or "user").strip()
    if role in {"developer", "latest_reminder"}:
        return "system"
    if role in {"system", "user", "assistant", "tool"}:
        return role
    return "user"


def _responses_input_to_messages(instructions: str, input_value: Any) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if instructions:
        messages.append({"role": "system", "content": instructions})

    if isinstance(input_value, str):
        messages.append({"role": "user", "content": input_value})
        return messages

    if not isinstance(input_value, list):
        raise HTTPException(400, "Responses input must be a string or list")

    for item in input_value:
        if not isinstance(item, dict):
            raise HTTPException(400, "Responses input list items must be objects")

        item_type = item.get("type")
        if item_type in (None, "message"):
            role = _normalize_chat_role(item.get("role", "user"))
            messages.append({"role": role, "content": _content_to_text(item.get("content", ""))})
            continue

        if item_type == "function_call":
            call_id = item.get("call_id") or f"call_{uuid.uuid4().hex[:12]}"
            messages.append(
                {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": item.get("name", ""),
                                "arguments": item.get("arguments", "{}"),
                            },
                        }
                    ],
                }
            )
            continue

        if item_type == "function_call_output":
            call_id = item.get("call_id")
            if not call_id:
                raise HTTPException(400, "function_call_output is missing call_id")
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": _content_to_text(item.get("output", "")),
                }
            )
            continue

        raise HTTPException(400, f"Unsupported Responses item type: {item_type}")

    return messages


def _responses_tools_to_chat_tools(tools: Any) -> list[dict[str, Any]]:
    if not tools:
        return []
    chat_tools: list[dict[str, Any]] = []
    for tool in tools:
        if not isinstance(tool, dict) or tool.get("type") != "function":
            continue
        chat_tools.append(
            {
                "type": "function",
                "function": {
                    "name": tool.get("name", ""),
                    "description": tool.get("description", ""),
                    "parameters": tool.get("parameters", {"type": "object", "properties": {}}),
                },
            }
        )
    return chat_tools


def _build_deepseek_payload(body: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": body.get("model") or DEFAULT_MODELS[0],
        "messages": _responses_input_to_messages(body.get("instructions", ""), body.get("input", "")),
        "stream": False,
    }
    tools = _responses_tools_to_chat_tools(body.get("tools"))
    if tools:
        payload["tools"] = tools
    return payload


def _deepseek_response_to_responses(data: dict[str, Any], requested_model: str) -> dict[str, Any]:
    message = ((data.get("choices") or [{}])[0]).get("message") or {}
    tool_calls = message.get("tool_calls") or []
    output: list[dict[str, Any]] = []
    output_text = ""

    reasoning = message.get("reasoning_content") or ""
    if reasoning:
        output.append(
            {
                "id": f"rs_{uuid.uuid4().hex[:12]}",
                "type": "reasoning",
                "summary": [{"type": "summary_text", "text": reasoning}],
            }
        )

    if tool_calls:
        for call in tool_calls:
            fn = call.get("function") or {}
            output.append(
                {
                    "id": call.get("id") or f"fc_{uuid.uuid4().hex[:12]}",
                    "type": "function_call",
                    "call_id": call.get("id") or f"call_{uuid.uuid4().hex[:12]}",
                    "name": fn.get("name", ""),
                    "arguments": fn.get("arguments", "{}"),
                }
            )
    else:
        output_text = message.get("content") or ""
        output.append(
            {
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": output_text, "annotations": []}],
            }
        )

    usage = data.get("usage") or {}
    return {
        "id": data.get("id") or f"resp_{uuid.uuid4().hex}",
        "object": "response",
        "created_at": int(time.time()),
        "status": "completed",
        "model": data.get("model") or requested_model,
        "output": output,
        "output_text": output_text,
        "parallel_tool_calls": True,
        "store": False,
        "truncation": "disabled",
        "usage": {
            "input_tokens": usage.get("prompt_tokens", 0),
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens": usage.get("completion_tokens", 0),
            "output_tokens_details": {"reasoning_tokens": 0},
            "total_tokens": usage.get("total_tokens", 0),
        },
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "deepseek-codex-proxy"}


@app.get("/v1/models")
def list_models() -> dict[str, Any]:
    return {
        "object": "list",
        "data": [{"id": model, "object": "model", "owned_by": "deepseek"} for model in DEFAULT_MODELS],
    }


@app.post("/v1/responses")
def create_response(request: Request, body: dict[str, Any]) -> dict[str, Any]:
    del request
    payload = _build_deepseek_payload(body)
    resp = requests.post(
        DEEPSEEK_CHAT_COMPLETIONS_URL,
        headers={
            "Authorization": f"Bearer {_deepseek_api_key()}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=REQUEST_TIMEOUT_S,
    )
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except ValueError:
            detail = {"error": {"message": resp.text or "DeepSeek upstream error"}}
        return JSONResponse(status_code=resp.status_code, content=detail)

    return _deepseek_response_to_responses(resp.json(), payload["model"])
