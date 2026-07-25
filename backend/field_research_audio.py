"""现场调研音频转写适配器。

默认使用可选的 faster-whisper 本地引擎；没有安装时由 API 返回明确的降级提示，
不把上传文件误报成已完成的转写。
"""

from __future__ import annotations

import importlib.util
import os
import tempfile
from pathlib import Path
from typing import Any


MAX_AUDIO_BYTES = 200 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".wav", ".webm"}
_MODEL: Any = None
_MODEL_NAME = ""


def _model_name() -> str:
    return os.environ.get("VR_WHISPER_MODEL", "base").strip() or "base"


def engine_status() -> dict[str, Any]:
    available = importlib.util.find_spec("faster_whisper") is not None
    return {
        "available": available,
        "engine": "faster-whisper" if available else "",
        "model": _model_name(),
        "message": "本地 Whisper 可用，首次转写可能需要下载模型。" if available else "未安装 faster-whisper；安装后即可上传音频自动转写。",
    }


def _suffix(filename: str, content_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in SUPPORTED_EXTENSIONS:
        return suffix
    mime_suffix = {
        "audio/aac": ".aac",
        "audio/flac": ".flac",
        "audio/mp4": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/ogg": ".ogg",
        "audio/wav": ".wav",
        "audio/webm": ".webm",
        "video/mp4": ".mp4",
    }
    return mime_suffix.get((content_type or "").lower(), "")


def _load_model():
    global _MODEL, _MODEL_NAME
    name = _model_name()
    if _MODEL is not None and _MODEL_NAME == name:
        return _MODEL
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("本机未安装 faster-whisper。请在 backend/.venv 中安装后重试。") from exc
    _MODEL = WhisperModel(name, device="cpu", compute_type="int8")
    _MODEL_NAME = name
    return _MODEL


def transcribe_audio(filename: str, content_type: str, payload: bytes) -> dict[str, Any]:
    if not payload:
        raise ValueError("上传的音频文件为空")
    if len(payload) > MAX_AUDIO_BYTES:
        raise ValueError("音频文件不能超过 200MB")
    suffix = _suffix(filename, content_type)
    if not suffix:
        raise ValueError("只支持 m4a、mp3、wav、webm、ogg、flac、aac 或 mp4 音频")

    model = _load_model()
    with tempfile.NamedTemporaryFile(prefix="vr-field-research-", suffix=suffix, delete=True) as handle:
        handle.write(payload)
        handle.flush()
        segments, info = model.transcribe(
            handle.name,
            language="zh",
            beam_size=5,
            vad_filter=True,
        )
        rows = [
            {
                "start": round(float(segment.start), 2),
                "end": round(float(segment.end), 2),
                "text": str(segment.text or "").strip(),
            }
            for segment in segments
            if str(segment.text or "").strip()
        ]
    return {
        "engine": "faster-whisper",
        "model": _model_name(),
        "language": str(getattr(info, "language", "zh") or "zh"),
        "duration": round(float(getattr(info, "duration", 0) or 0), 2),
        "segments": rows,
    }
