"""统一资料摄取与 OCR/提取路由底座。"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal


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

