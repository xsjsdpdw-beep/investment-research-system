from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


class YoudaoSyncError(RuntimeError):
    pass


READ_FAILURE_MARKERS = {
    "获取笔记内容失败",
    "笔记不存在",
}


def _run(args: list[str]) -> str:
    result = subprocess.run(
        ["youdaonote", "-s", "ydn", *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise YoudaoSyncError((result.stderr or result.stdout or "有道云笔记命令执行失败").strip())
    return result.stdout.strip()


def create_markdown_note(title: str, content: str, parent_id: str = "") -> dict:
    payload = {
        "title": title,
        "type": "md",
        "content": content,
    }
    if parent_id:
        payload["parentId"] = parent_id
    with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as tmp:
        json.dump(payload, tmp, ensure_ascii=False)
        tmp_path = Path(tmp.name)
    try:
        raw = _run(["save", "-f", str(tmp_path), "--json"])
        data = json.loads(raw)
        return {
            "file_id": data.get("fileId", ""),
            "message": data.get("message", ""),
            "title": title,
            "parent_id": parent_id,
        }
    finally:
        tmp_path.unlink(missing_ok=True)


def read_note(file_id: str) -> dict:
    content = _run(["read", file_id])
    if content.strip() in READ_FAILURE_MARKERS:
        raise YoudaoSyncError(content.strip())
    return {
        "file_id": file_id,
        "content": content,
    }


def update_markdown_note(file_id: str, content: str, title: str = "") -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".md", encoding="utf-8", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        args = ["update", file_id, "-f", str(tmp_path)]
        if title:
            args.extend(["-n", title])
        raw = _run(args)
        return {
            "file_id": file_id,
            "message": raw,
            "title": title,
        }
    finally:
        tmp_path.unlink(missing_ok=True)


def search_notes(keyword: str) -> list[dict]:
    raw = _run(["search", keyword])
    items: list[dict] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("📄"):
            continue
        payload = line.removeprefix("📄").strip()
        file_id, _, title = payload.partition("\t")
        file_id = file_id.strip()
        title = title.strip()
        if not file_id or not title:
            continue
        items.append({"file_id": file_id, "title": title})
    return items


def health() -> dict:
    raw = _run(["check", "--json"])
    return json.loads(raw)


def open_app(file_id: str = "") -> dict:
    normalized = (file_id or "").strip()
    attempts: list[list[str]] = []
    if normalized:
        attempts.extend([
            ["open", f"ynote://note/{normalized}"],
            ["open", f"ynote://open?noteId={normalized}"],
            ["open", f"ynote://note?noteId={normalized}"],
            ["open", f"ynote://x-callback-url/open?noteId={normalized}"],
        ])
    attempts.extend([
        ["open", "-a", "有道云笔记"],
        ["open", "-a", "/Applications/有道云笔记.app"],
        ["osascript", "-e", 'tell application id "com.youdao.note.YoudaoNoteMac" to activate'],
    ])
    last_error = ""
    for cmd in attempts:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode == 0:
            return {
                "ok": True,
                "message": "已尝试打开当前有道笔记" if normalized else "有道云笔记已启动",
            }
        last_error = (result.stderr or result.stdout or "").strip() or "启动失败"
    raise YoudaoSyncError(last_error or "无法打开有道云笔记")
