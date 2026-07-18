"""统一资料摄取与 OCR/提取路由底座。"""

from __future__ import annotations

import importlib.util
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any, Literal

import youdao_sync

YOUDAO_STRUCTURED_VERSION = "native-note-v2"


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


def _looks_like_youdao_note(title: str, raw: str) -> bool:
    text = (raw or "").strip()
    if not text:
        return False
    if (title or "").lower().endswith(".note"):
        return True
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    markdown_headings = sum(1 for line in lines if re.match(r"^#{1,4}\s+", line))
    long_plain_lines = sum(1 for line in lines if len(line) > 32 and not re.match(r"^[-*]\s+", line))
    note_headings = sum(1 for line in lines if _detect_youdao_heading(line) is not None)
    return markdown_headings == 0 and (note_headings >= 2 or long_plain_lines >= 6)


def _detect_youdao_heading(line: str) -> tuple[int, str] | None:
    stripped = (line or "").strip()
    if not stripped:
        return None
    if re.fullmatch(r"(问题清单|管理理念|管理|业务|产品|国内|海外|制造、销售|矿山|财务|盈利预测与估值|风险提示|投资逻辑)", stripped):
        return 2, stripped
    chinese_match = re.match(r"^([一二三四五六七八九十]+)[、.]\s*(.+)$", stripped)
    if chinese_match:
        return 2, chinese_match.group(2).strip() or stripped
    numeric_match = re.match(r"^(\d+)(?:\.(\d+))?[、.]?\s*(.+)$", stripped)
    if numeric_match and numeric_match.group(3):
        level = 2 if not numeric_match.group(2) else 3
        return level, numeric_match.group(3).strip()
    bracket_match = re.match(r"^[（(](\d+)[)）]\s*(.+)$", stripped)
    if bracket_match:
        return 3, bracket_match.group(2).strip() or stripped
    return None


def normalize_youdao_note_markdown(raw: str, title: str) -> str:
    original = (raw or "").replace("\r", "").strip()
    if not original or not _looks_like_youdao_note(title, original):
        return original

    lines = [line.strip() for line in original.split("\n")]
    blocks: list[str] = []
    paragraph_buffer: list[str] = []

    def flush_paragraph() -> None:
        text = " ".join(part for part in paragraph_buffer if part).strip()
        if text:
            blocks.append(text)
        paragraph_buffer.clear()

    first_nonempty = next((line for line in lines if line), "")
    first_line_promoted = False
    if first_nonempty and not first_nonempty.startswith("#") and len(first_nonempty) <= 60:
        blocks.append(f"# {first_nonempty}")
        first_line_promoted = True

    for line in lines:
        if not line:
            flush_paragraph()
            continue
        if first_line_promoted and line == first_nonempty:
            continue
        heading = _detect_youdao_heading(line)
        if heading:
            flush_paragraph()
            level, heading_text = heading
            blocks.append(f"{'#' * level} {heading_text}")
            continue
        if re.match(r"^[-*•]\s+", line):
            flush_paragraph()
            bullet_text = re.sub(r"^[-*•]\s+", "", line).strip()
            blocks.append(f"- {bullet_text}")
            continue
        paragraph_buffer.append(line)

    flush_paragraph()
    return "\n\n".join(blocks).strip() or original


def _youdao_data_roots() -> list[Path]:
    override = os.environ.get("VR_YOUDAO_DATA_DIR", "").strip()
    if override:
        return [Path(override)]
    base = Path.home() / "Library" / "Application Support" / "ynote-desktop"
    if not base.exists():
        return []
    return [path / "ynote-data" for path in base.iterdir() if (path / "ynote-data").exists()]


def _youdao_local_note_file(file_id: str) -> Path | None:
    normalized = (file_id or "").strip()
    if not normalized:
        return None
    for root in _youdao_data_roots():
        direct = root / "file" / "2" / normalized
        if direct.exists():
            return direct
        for candidate in (root / "file").glob(f"*/{normalized}"):
            if candidate.exists():
                return candidate
    return None


def _youdao_resource_path(resource_id: str) -> Path | None:
    normalized = (resource_id or "").strip()
    if not normalized:
        return None
    shard = normalized[-1]
    for root in _youdao_data_roots():
        candidate = root / "resource" / shard / normalized
        if candidate.exists():
            return candidate
    return None


def _image_data_url(path: Path) -> str:
    suffix = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
    }.get(suffix, "")
    payload = path.read_bytes()
    if not mime:
        sample = payload[:16]
        if sample.startswith(b"\x89PNG\r\n\x1a\n"):
            mime = "image/png"
        elif sample.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif sample.startswith(b"RIFF") and b"WEBP" in sample:
            mime = "image/webp"
        else:
            mime = "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}"


def _youdao_text_from_tokens(tokens: Any) -> str:
    parts: list[str] = []
    for token in tokens or []:
        if isinstance(token, dict) and "8" in token:
            parts.append(str(token.get("8") or ""))
    return "".join(parts).replace("\r", "\n")


def _youdao_block_text(block: dict[str, Any]) -> str:
    parts: list[str] = []
    for child in block.get("5") or []:
        if isinstance(child, dict):
            parts.append(_youdao_text_from_tokens(child.get("7") or []))
    return "".join(parts)


def _youdao_heading_level(block: dict[str, Any]) -> int:
    raw = str(((block.get("4") or {}).get("l") or "")).strip().lower()
    match = re.fullmatch(r"h([1-6])", raw)
    if not match:
        return 1
    return int(match.group(1))


def _youdao_image_block(block: dict[str, Any], index: int) -> dict[str, Any] | None:
    meta = block.get("4") or {}
    url = str(meta.get("u") or "")
    match = re.search(r"(WEBRESOURCE[0-9a-fA-F]+)", url)
    if not match:
        return None
    resource_id = match.group(1)
    resource_path = _youdao_resource_path(resource_id)
    if not (resource_path and resource_path.exists()):
        return None
    image_block = _blank_block(index, "image", title=f"图片{index}")
    image_block["image"] = {
        "url": _image_data_url(resource_path),
        "caption": "",
        "resource_id": resource_id,
    }
    return image_block


def _collect_youdao_local_image_blocks(file_id: str) -> list[dict[str, Any]]:
    note_file = _youdao_local_note_file(file_id)
    if not note_file:
        return []
    try:
        document = json.loads(note_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    image_blocks: list[dict[str, Any]] = []
    for node in document.get("5") or []:
        if not isinstance(node, dict) or node.get("6") != "im":
            continue
        block = _youdao_image_block(node, len(image_blocks) + 1)
        if block:
            image_blocks.append(block)
    return image_blocks


def _youdao_note_document_to_blocks(document: dict[str, Any], fallback_title: str) -> list[dict[str, Any]]:
    root = _blank_block(0, "section", title=(fallback_title or "").strip() or "有道笔记")
    root["children"] = []
    stack: list[tuple[int, dict[str, Any]]] = [(0, root)]
    block_index = 1
    nodes = list(document.get("5") or [])

    def parent_for(level: int) -> dict[str, Any]:
        while stack and stack[-1][0] >= level:
            stack.pop()
        return stack[-1][1] if stack else root

    index = 0
    while index < len(nodes):
        node = nodes[index]
        if not isinstance(node, dict):
            index += 1
            continue
        kind = str(node.get("6") or "")

        if kind == "h":
            text = _youdao_block_text(node).strip()
            if text:
                level = _youdao_heading_level(node)
                section = _blank_block(block_index, "section", title=text)
                block_index += 1
                parent = parent_for(level)
                parent["children"].append(section)
                stack.append((level, section))
            index += 1
            continue

        if kind == "im":
            image_block = _youdao_image_block(node, block_index)
            if image_block:
                stack[-1][1]["children"].append(image_block)
                block_index += 1
            index += 1
            continue

        if kind == "l":
            items: list[str] = []
            list_key = str(((node.get("4") or {}).get("li") or "")).strip()
            while index < len(nodes):
                current = nodes[index]
                if not isinstance(current, dict) or current.get("6") != "l":
                    break
                current_key = str(((current.get("4") or {}).get("li") or "")).strip()
                if list_key and current_key and current_key != list_key:
                    break
                item_text = _youdao_block_text(current).strip()
                if item_text:
                    items.append(item_text)
                index += 1
            if items:
                list_block = _blank_block(block_index, "bullet_list")
                list_block["items"] = items
                stack[-1][1]["children"].append(list_block)
                block_index += 1
            continue

        text = _youdao_block_text(node).strip()
        if text:
            paragraph = _blank_block(block_index, "paragraph", content=text)
            stack[-1][1]["children"].append(paragraph)
            block_index += 1
        index += 1

    return [root]


def _merge_youdao_local_images(blocks: list[dict[str, Any]], file_id: str) -> list[dict[str, Any]]:
    image_blocks = _collect_youdao_local_image_blocks(file_id)
    if not image_blocks:
        return blocks
    root = deepcopy(blocks[0]) if blocks else _blank_block(0, "section", title="有道笔记")
    root.setdefault("children", [])
    image_section = _blank_block(len(root["children"]) + 1, "section", title="图片资料")
    image_section["children"] = image_blocks
    root["children"].append(image_section)
    return [root]


def youdao_note_content_to_blocks(content: str, title: str) -> list[dict[str, Any]]:
    resolved_title = (title or "").strip() or _first_heading_or_default(content, "有道笔记")
    normalized = normalize_youdao_note_markdown(content, resolved_title)
    return markdown_to_structured_blocks(normalized, resolved_title)


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


def _module_exists(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except ModuleNotFoundError:
        return False


def _resolve_command(name: str) -> str | None:
    candidate_dirs = [
        Path(__file__).resolve().parent.parent / ".tools" / "ocr" / "bin",
        Path(sys.executable).resolve().parent,
        Path(__file__).resolve().parent / ".venv" / "bin",
    ]
    for base in candidate_dirs:
        venv_cmd = base / name
        if venv_cmd.exists() and os.access(venv_cmd, os.X_OK):
            return str(venv_cmd)
    direct = shutil.which(name)
    if direct:
        return direct
    return None


def _ocr_env_paths() -> tuple[Path, Path]:
    root = Path(__file__).resolve().parent.parent / ".tools" / "ocr"
    return root / "bin", root / "lib"


def _build_subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    ocr_bin, _ocr_lib = _ocr_env_paths()
    path_parts = [str(ocr_bin)] if ocr_bin.exists() else []
    if env.get("PATH"):
        path_parts.append(env["PATH"])
    if path_parts:
        env["PATH"] = ":".join(path_parts)
    return env


def _command_exists(name: str) -> bool:
    return bool(_resolve_command(name))


def _ocrmypdf_runtime_ready() -> bool:
    cmd = _resolve_command("ocrmypdf")
    if not (cmd and _resolve_command("tesseract") and _resolve_command("gs")):
        return False
    try:
        result = subprocess.run(
            [cmd, "--version"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            env=_build_subprocess_env(),
        )
    except Exception:
        return False
    return result.returncode == 0


def engine_status() -> dict[str, Any]:
    return {
        "mineru": {"ready": _module_exists("mineru") or _module_exists("magic_pdf"), "fallback": "pypdf"},
        "pypdf": {"ready": _module_exists("pypdf")},
        "ocrmypdf": {
            "ready": _ocrmypdf_runtime_ready(),
            "command": _command_exists("ocrmypdf"),
            "tesseract": _command_exists("tesseract"),
            "ghostscript": _command_exists("gs"),
        },
        "paddleocr": {"ready": _module_exists("paddleocr")},
        "umi_ocr": {"ready": bool(os.environ.get("VR_UMI_OCR_CMD", "").strip())},
        "tesseract": {"ready": _command_exists("tesseract")},
    }


def _pdf_to_markdown_with_pypdf(path: Path) -> str:
    if not _module_exists("pypdf"):
        return ""
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
    except Exception:
        return ""
    sections: list[str] = []
    for index, page in enumerate(reader.pages):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""
        if text:
            sections.append(f"## 第{index + 1}页\n\n{text}")
    return "\n\n".join(sections).strip()


def _run_mineru_if_available(path: Path) -> dict[str, Any] | None:
    markdown = _pdf_to_markdown_with_pypdf(path)
    if markdown:
        return {
            "markdown": markdown,
            "engine": "mineru" if engine_status()["mineru"]["ready"] else "pypdf",
        }
    return None


def _run_ocrmypdf_if_available(path: Path) -> Path | None:
    cmd = _resolve_command("ocrmypdf")
    if not cmd or not _ocrmypdf_runtime_ready():
        return None
    tmpdir = Path(tempfile.mkdtemp(prefix="vr-ocrmypdf-"))
    out = tmpdir / path.name
    try:
        result = subprocess.run(
            [cmd, "--skip-text", str(path), str(out)],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
            env=_build_subprocess_env(),
        )
    except Exception:
        return None
    return out if result.returncode == 0 and out.exists() else None


def _run_paddleocr_if_available(path: Path) -> dict[str, Any] | None:
    if not _module_exists("paddleocr"):
        return None
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang="ch")
        result = ocr.ocr(str(path), cls=True)
    except Exception:
        return None
    lines: list[str] = []
    for page in result or []:
        for row in page or []:
            if not row or len(row) < 2:
                continue
            text = str((row[1] or [""])[0]).strip()
            if text:
                lines.append(text)
    text = "\n".join(lines).strip()
    return {"text": text, "engine": "paddleocr"} if text else None


def _run_umiocr_if_available(path: Path) -> dict[str, Any] | None:
    cmd = os.environ.get("VR_UMI_OCR_CMD", "").strip()
    if not cmd:
        return None
    try:
        result = subprocess.run(
            [cmd, str(path)],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
            env=_build_subprocess_env(),
        )
    except Exception:
        return None
    text = (result.stdout or "").strip()
    return {"text": text, "engine": "umi_ocr"} if text else None


def _run_tesseract_if_available(path: Path) -> dict[str, Any] | None:
    cmd = _resolve_command("tesseract")
    if not cmd:
        return None
    try:
        result = subprocess.run(
            [cmd, str(path), "stdout", "-l", "chi_sim+eng"],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
            env=_build_subprocess_env(),
        )
    except Exception:
        return None
    text = (result.stdout or "").strip()
    return {"text": text, "engine": "tesseract"} if text else None


def _extract_plain_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return _pdf_to_markdown_with_pypdf(path)
    if path.suffix.lower() == ".md":
        return path.read_text(encoding="utf-8")
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def _run_best_image_ocr(path: Path) -> dict[str, Any] | None:
    return _run_paddleocr_if_available(path) or _run_umiocr_if_available(path) or _run_tesseract_if_available(path)


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
        parsed = _run_best_image_ocr(ocr_ready_path or path)
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


def _summary_from_blocks(blocks: list[dict[str, Any]]) -> str:
    if blocks and blocks[0].get("children"):
        first_child = blocks[0]["children"][0]
        return (first_child.get("content") or first_child.get("title") or "").strip()[:240]
    return ""


def build_structured_candidate_from_text(
    source_type: str,
    source_entry_id: str,
    content: str,
    title: str,
) -> dict[str, Any]:
    normalized_content = (content or "").strip()
    blocks = markdown_to_structured_blocks(normalized_content or f"# {title}\n\n暂未提取到正文。", title)
    summary = _summary_from_blocks(blocks)
    return {
        "id": f"{source_type}-{source_entry_id or Path(title).stem}",
        "source_type": source_type,
        "title": title,
        "summary": summary,
        "source_title": title,
        "source_entry_id": source_entry_id,
        "matched_card_id": "",
        "target_block": "body",
        "proposed_patch": normalized_content,
        "structured_blocks": blocks,
    }


def extract_youdao_note_to_blocks(file_id: str, title: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    note = youdao_sync.read_note(file_id)
    content = (note.get("content") or "").strip()
    if not content:
        raise ValueError("这篇有道笔记还没有可导入内容")
    resolved_title = (title or "").strip() or _first_heading_or_default(content, "有道笔记")
    note_file = _youdao_local_note_file(file_id)
    if note_file:
        try:
            document = json.loads(note_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            document = None
        if isinstance(document, dict) and (document.get("5") or []):
            return content, _youdao_note_document_to_blocks(document, resolved_title)
    return content, _merge_youdao_local_images(youdao_note_content_to_blocks(content, resolved_title), file_id)


def extract_youdao_note_image_to_blocks(image_path: str, title: str) -> list[dict[str, Any]]:
    route = route_ingest_source({"source_type": "note_image", "provider": "youdao", "file_path": image_path})
    parsed = _run_best_image_ocr(Path(image_path))
    if not parsed and route["engine_chain"][-1] == "umi_ocr":
        parsed = _run_umiocr_if_available(Path(image_path))
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


def extract_image_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        raise ValueError("图片文件不存在")
    parsed = _run_best_image_ocr(path)
    return ocr_result_to_structured_blocks(parsed or {"text": ""}, title)


def build_structured_candidate_from_image(scope_type: str, scope_id: str, file_path: str, title: str) -> dict[str, Any]:
    blocks = extract_image_to_blocks(file_path, title)
    summary = _summary_from_blocks(blocks)
    return {
        "id": f"img-{Path(file_path).stem}",
        "source_type": "attachment",
        "title": title,
        "summary": summary,
        "source_title": title,
        "source_entry_id": file_path,
        "matched_card_id": "",
        "target_block": "body",
        "proposed_patch": summary,
        "structured_blocks": blocks,
    }


def extract_report_file_to_blocks(file_path: str, title: str) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        raise ValueError("资料文件不存在")
    ext = path.suffix.lower()
    if ext == ".pdf":
        return extract_pdf_report_to_blocks(file_path, title)
    if ext in {".png", ".jpg", ".jpeg", ".webp"}:
        return extract_image_to_blocks(file_path, title)
    text = _extract_plain_text(path)
    return markdown_to_structured_blocks(text or f"# {title}\n\n暂未提取到正文。", title)


def build_structured_candidate_from_report_file(file_path: str, title: str) -> dict[str, Any]:
    path = Path(file_path)
    ext = path.suffix.lower()
    if ext == ".pdf":
        return build_structured_candidate_from_pdf("", "", file_path, title)
    if ext in {".png", ".jpg", ".jpeg", ".webp"}:
        return build_structured_candidate_from_image("", "", file_path, title)
    blocks = extract_report_file_to_blocks(file_path, title)
    summary = _summary_from_blocks(blocks)
    return {
        "id": f"file-{path.stem}",
        "source_type": "attachment",
        "title": title,
        "summary": summary,
        "source_title": title,
        "source_entry_id": file_path,
        "matched_card_id": "",
        "target_block": "body",
        "proposed_patch": summary,
        "structured_blocks": blocks,
    }
