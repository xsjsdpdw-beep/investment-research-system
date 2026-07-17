"""统一资料摄取与 OCR/提取路由底座。"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Literal

import youdao_sync


def _first_heading_or_default(content: str, fallback: str) -> str:
    for line in (content or "").splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip() or fallback
    return fallback


def _blank_block(index: int, block_type: str, title: str = "", content: str = "") -> dict[str, Any]:
    return {
        "id": f"render-block-{index}",
        "type": block_type,
        "title": title,
        "section_key": "",
        "content": content,
        "items": [],
        "table": {},
        "image": {},
        "chart_spec": {},
        "source_refs": [],
        "children": [],
        "render_hint": {},
    }


def _consume_markdown_table(lines: list[str], start: int) -> tuple[dict[str, Any] | None, int]:
    if start + 1 >= len(lines):
        return None, start
    first = lines[start].strip()
    second = lines[start + 1].strip()
    if "|" not in first or "|" not in second:
        return None, start
    if not re.fullmatch(r"[\|\-\:\s]+", second):
        return None, start
    rows: list[list[str]] = []
    index = start
    while index < len(lines) and "|" in lines[index]:
        rows.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
        index += 1
    if len(rows) < 2:
        return None, start
    return {"headers": rows[0], "rows": rows[1:]}, index


def markdown_to_structured_blocks(raw: str, title: str) -> list[dict[str, Any]]:
    content = (raw or "").replace("\r", "").strip()
    if not content:
        return [_blank_block(0, "section", title=title)]

    lines = content.split("\n")
    root = _blank_block(0, "section", title=_first_heading_or_default(content, title))
    root["children"] = []
    stack: list[tuple[int, dict[str, Any]]] = [(1, root)]
    paragraph_buffer: list[str] = []
    block_index = 1

    def parent_for(level: int) -> dict[str, Any]:
        while stack and stack[-1][0] >= level:
            stack.pop()
        return stack[-1][1] if stack else root

    def flush_paragraph() -> None:
        nonlocal block_index
        text = " ".join(part.strip() for part in paragraph_buffer if part.strip()).strip()
        if text:
            stack[-1][1]["children"].append(_blank_block(block_index, "paragraph", content=text))
            block_index += 1
        paragraph_buffer.clear()

    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            flush_paragraph()
            index += 1
            continue

        table, next_index = _consume_markdown_table(lines, index)
        if table:
            flush_paragraph()
            block = _blank_block(block_index, "table")
            block["table"] = table
            stack[-1][1]["children"].append(block)
            block_index += 1
            index = next_index
            continue

        if line.startswith("#"):
            flush_paragraph()
            level = len(line) - len(line.lstrip("#"))
            heading_title = line.lstrip("#").strip()
            if index == 0 and level == 1 and heading_title == root["title"]:
                index += 1
                continue
            section = _blank_block(block_index, "section", title=line.lstrip("#").strip())
            block_index += 1
            parent = parent_for(level)
            parent["children"].append(section)
            stack.append((level, section))
            index += 1
            continue

        if re.match(r"^[-*]\s+", line):
            flush_paragraph()
            items: list[str] = []
            while index < len(lines):
                bullet = lines[index].strip()
                if not re.match(r"^[-*]\s+", bullet):
                    break
                items.append(re.sub(r"^[-*]\s+", "", bullet).strip())
                index += 1
            block = _blank_block(block_index, "bullet_list")
            block["items"] = items
            stack[-1][1]["children"].append(block)
            block_index += 1
            continue

        paragraph_buffer.append(line)
        index += 1

    flush_paragraph()
    return [root]


def detect_source_kind(source: dict[str, Any]) -> str:
    source_type = (source.get("source_type") or "").strip()
    provider = (source.get("provider") or "").strip()
    file_path = (source.get("file_path") or "").strip().lower()
    if provider == "youdao" and source_type == "note_image":
        return "youdao_image"
    if provider == "youdao" and source_type in {"note", "note_text"}:
        return "youdao_text"
    if file_path.endswith(".pdf"):
        return "pdf"
    if file_path.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
        return "image"
    return "text"


def detect_pdf_kind(file_path: str) -> Literal["digital_pdf", "scanned_pdf"]:
    path = Path(file_path)
    if not path.exists():
        return "digital_pdf"
    try:
        sample = path.read_bytes()[:32768]
    except OSError:
        return "digital_pdf"
    if any(marker in sample for marker in (b"/Font", b"BT", b"/ToUnicode", b"/CIDFont")):
        return "digital_pdf"
    return "scanned_pdf"


def route_ingest_source(source: dict[str, Any]) -> dict[str, Any]:
    kind = detect_source_kind(source)
    if kind == "pdf":
        pdf_kind = detect_pdf_kind(source.get("file_path") or "")
        if pdf_kind == "scanned_pdf":
            return {"kind": kind, "pdf_kind": pdf_kind, "engine_chain": ["ocrmypdf", "paddleocr"]}
        return {"kind": kind, "pdf_kind": pdf_kind, "engine_chain": ["mineru"]}
    if kind in {"youdao_image", "image"}:
        return {"kind": kind, "engine_chain": ["paddleocr", "umi_ocr"]}
    if kind == "youdao_text":
        return {"kind": kind, "engine_chain": ["native_youdao"]}
    return {"kind": kind, "engine_chain": ["plain_text"]}


def _run_mineru_if_available(path: Path) -> dict[str, Any] | None:
    return None


def _run_ocrmypdf_if_available(path: Path) -> Path | None:
    return None


def _run_paddleocr_if_available(path: Path) -> dict[str, Any] | None:
    return None


def _extract_plain_text(path: Path) -> str:
    if path.suffix.lower() == ".md":
        return path.read_text(encoding="utf-8")
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def mineru_json_to_structured_blocks(parsed: dict[str, Any], title: str) -> list[dict[str, Any]]:
    markdown = (parsed.get("markdown") or "").strip()
    if markdown:
        return markdown_to_structured_blocks(markdown, title)
    return markdown_to_structured_blocks(f"# {title}\n\n暂未提取到结构化内容。", title)


def paddleocr_json_to_structured_blocks(parsed: dict[str, Any], title: str) -> list[dict[str, Any]]:
    text = (parsed.get("markdown") or parsed.get("text") or "").strip()
    return markdown_to_structured_blocks(text or f"# {title}\n\n暂未提取到 OCR 正文。", title)


def extract_pdf_report_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        raise ValueError("研报文件不存在")
    route = route_ingest_source({"source_type": "report", "file_path": str(path), "provider": ""})
    if route["engine_chain"] == ["mineru"]:
        parsed = _run_mineru_if_available(path)
        if parsed:
            return mineru_json_to_structured_blocks(parsed, title)
    else:
        ocr_ready_path = _run_ocrmypdf_if_available(path)
        parsed = _run_paddleocr_if_available(ocr_ready_path or path)
        if parsed:
            return paddleocr_json_to_structured_blocks(parsed, title)
    raw = _extract_plain_text(path)
    return markdown_to_structured_blocks(raw or f"# {title}\n\n暂未提取到正文。", title)


def build_structured_candidate_from_pdf(scope_type: str, scope_id: str, file_path: str, title: str) -> dict[str, Any]:
    blocks = extract_pdf_report_to_blocks(file_path, title)
    summary = ""
    if blocks and blocks[0].get("children"):
        first_child = blocks[0]["children"][0]
        summary = (first_child.get("content") or first_child.get("title") or "").strip()
    return {
        "id": f"pdf-{Path(file_path).stem}",
        "source_type": "report",
        "title": title,
        "summary": summary[:240],
        "source_title": title,
        "source_entry_id": file_path,
        "matched_card_id": "",
        "target_block": "body",
        "proposed_patch": summary,
        "structured_blocks": blocks,
    }


def ocr_result_to_structured_blocks(parsed: dict[str, Any], title: str) -> list[dict[str, Any]]:
    text = (parsed.get("markdown") or parsed.get("text") or "").strip()
    return markdown_to_structured_blocks(text or f"# {title}\n\n暂未提取到 OCR 正文。", title)


def extract_youdao_note_to_blocks(file_id: str, title: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    note = youdao_sync.read_note(file_id)
    content = (note.get("content") or "").strip()
    if not content:
        raise ValueError("这篇有道笔记还没有可导入内容")
    resolved_title = (title or "").strip() or _first_heading_or_default(content, "有道笔记")
    return content, markdown_to_structured_blocks(content, resolved_title)


def extract_youdao_note_image_to_blocks(image_path: str, title: str) -> list[dict[str, Any]]:
    route = route_ingest_source({"source_type": "note_image", "provider": "youdao", "file_path": image_path})
    parsed = _run_paddleocr_if_available(Path(image_path))
    if not parsed and route["engine_chain"][-1] == "umi_ocr":
        parsed = None
    return ocr_result_to_structured_blocks(parsed or {}, title)


def build_structured_candidate_from_youdao(scope_type: str, scope_id: str, file_id: str, title: str) -> dict[str, Any]:
    content, blocks = extract_youdao_note_to_blocks(file_id, title)
    snippet = content.replace("\r", " ").replace("\n", " ").strip()[:240]
    return {
        "id": f"youdao-note-{file_id}",
        "source_type": "note",
        "title": title,
        "summary": snippet,
        "source_title": title,
        "source_entry_id": file_id,
        "matched_card_id": "",
        "target_block": "body",
        "proposed_patch": content,
        "structured_blocks": blocks,
    }
