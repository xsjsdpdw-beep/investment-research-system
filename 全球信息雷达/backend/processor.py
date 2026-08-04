from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


class OptionalProcessor:
    """Optional OpenAI-compatible enrichment layer; fetching works without it."""

    def __init__(self, db):
        self.db = db

    def settings(self) -> dict[str, Any]:
        values = self.db.get_settings()
        values["llm_base_url"] = os.environ.get("RADAR_LLM_BASE_URL", values.get("llm_base_url", ""))
        values["llm_model"] = os.environ.get("RADAR_LLM_MODEL", values.get("llm_model", ""))
        return values

    def enabled(self) -> bool:
        values = self.settings()
        return bool(values.get("processor_enabled")) and bool(values.get("llm_base_url")) and bool(values.get("llm_model"))

    def _complete(self, prompt: str) -> dict[str, Any]:
        values = self.settings()
        base = str(values["llm_base_url"]).rstrip("/")
        if not base.endswith("/chat/completions"):
            base += "/chat/completions"
        payload = {
            "model": values["llm_model"],
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": "你是一个事实优先的信息整理器。不要补充输入中不存在的事实；不确定内容保留不确定表述。只返回 JSON。"},
                {"role": "user", "content": prompt},
            ],
        }
        headers = {"Content-Type": "application/json", "User-Agent": "GlobalInformationRadar/0.1"}
        api_key = os.environ.get("RADAR_LLM_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        request = urllib.request.Request(base, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"LLM request failed: {exc}") from exc
        content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
        content = str(content).strip()
        if content.startswith("```"):
            content = content.strip("`").replace("json\n", "", 1).strip()
        try:
            value = json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError("LLM returned invalid JSON") from exc
        if not isinstance(value, dict):
            raise RuntimeError("LLM returned a non-object")
        return value

    def enrich_items(self, items: list[dict[str, Any]]) -> int:
        if not self.enabled() or not items:
            return 0
        values = self.settings()
        count = 0
        for item in items[:20]:
            prompt = json.dumps({
                "task": "整理一条资讯",
                "allowed_domains": ["macro", "geopolitics", "global_tech", "industry", "stock"],
                "item": {"title": item.get("title"), "summary": item.get("summary"), "source": item.get("source"), "domain": item.get("domain")},
                "return": {"summary": "string", "topics": ["string"], "score": "number 0-100", "reason": "string"},
            }, ensure_ascii=False)
            try:
                result = self._complete(prompt)
                self.db.apply_enrichment(item["id"], result, values["llm_model"])
                count += 1
            except RuntimeError:
                # An enrichment failure must never roll back the fetched item.
                continue
        return count

    def enrich_daily(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled():
            return payload
        headlines = []
        for section in payload.get("sections", []):
            headlines.extend({"title": x.get("title"), "summary": x.get("summary")} for x in section.get("items", [])[:4])
        if not headlines:
            return payload
        prompt = json.dumps({"task": "为全球信息雷达生成日报导语", "items": headlines[:20], "return": {"title": "string", "paragraph": "string"}}, ensure_ascii=False)
        try:
            result = self._complete(prompt)
        except RuntimeError:
            return payload
        payload = dict(payload)
        payload["lead"] = {"title": str(result.get("title") or "今日全球信息脉搏"), "paragraph": str(result.get("paragraph") or "")}
        payload["mode"] = "ai"
        payload["generated_by"] = "optional_llm"
        payload["model"] = self.settings()["llm_model"]
        payload["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        return payload
