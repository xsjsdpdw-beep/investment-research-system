from __future__ import annotations

import base64
import json
from pathlib import Path

import research_ingest


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sYx0W8AAAAASUVORK5CYII="
)


def test_extract_youdao_note_to_blocks_includes_local_note_images(monkeypatch, tmp_path):
    data_root = tmp_path / "ynote-data"
    note_dir = data_root / "file" / "2"
    resource_dir = data_root / "resource" / "6"
    note_dir.mkdir(parents=True)
    resource_dir.mkdir(parents=True)

    file_id = "WEB-note-1"
    resource_id = "WEBRESOURCEabc1234567890def6"

    note_payload = {
        "2": "1",
        "5": [
            {"3": "head-1", "4": {"l": "h4"}, "5": [{"2": "2", "3": "txt-1", "7": [{"8": "问题清单"}]}], "6": "h"},
            {"3": "img-1", "4": {"version": 1, "h": 100, "w": 200, "u": f"https://note.youdao.com/yws/res/1/{resource_id}"}, "6": "im"},
        ],
    }
    (note_dir / file_id).write_text(json.dumps(note_payload, ensure_ascii=False), encoding="utf-8")
    (resource_dir / resource_id).write_bytes(PNG_1X1)

    monkeypatch.setenv("VR_YOUDAO_DATA_DIR", str(data_root))
    monkeypatch.setattr(
        research_ingest.youdao_sync,
        "read_note",
        lambda note_id: {"file_id": note_id, "content": "问题清单\n图后面还有补充。"},
    )

    _content, blocks = research_ingest.extract_youdao_note_to_blocks(file_id, "豪迈科技.note")

    root = blocks[0]
    section = next(child for child in root["children"] if child["type"] == "section" and child["title"] == "问题清单")
    image_block = next(child for child in section["children"] if child["type"] == "image")

    assert image_block["type"] == "image"
    assert str((image_block["image"] or {}).get("url", "")).startswith("data:image/png;base64,")


def test_extract_youdao_note_to_blocks_preserves_native_order_and_heading_levels(monkeypatch, tmp_path):
    data_root = tmp_path / "ynote-data"
    note_dir = data_root / "file" / "2"
    resource_dir = data_root / "resource" / "6"
    note_dir.mkdir(parents=True)
    resource_dir.mkdir(parents=True)

    file_id = "WEB-note-2"
    resource_id = "WEBRESOURCEabc1234567890def6"

    note_payload = {
        "2": "1",
        "5": [
            {"3": "plain-0", "5": [{"2": "2", "3": "txt-0", "7": [{"8": "问题清单"}]}]},
            {"3": "head-1", "4": {"l": "h4"}, "5": [{"2": "2", "3": "txt-1", "7": [{"8": "轮胎模具"}]}], "6": "h"},
            {"3": "plain-1", "5": [{"2": "2", "3": "txt-2", "7": [{"8": "1、轮胎模具概念"}]}]},
            {"3": "plain-2", "5": [{"2": "2", "3": "txt-3", "7": [{"8": "第一段正文"}]}]},
            {"3": "img-1", "4": {"version": 1, "h": 100, "w": 200, "u": f"https://note.youdao.com/yws/res/1/{resource_id}"}, "6": "im"},
            {"3": "plain-3", "5": [{"2": "2", "3": "txt-4", "7": [{"8": "第二段正文"}]}]},
            {"3": "list-1", "4": {"li": "list-a", "ll": 1, "lt": "unordered"}, "5": [{"2": "2", "3": "txt-5", "7": [{"8": "要点A"}]}], "6": "l"},
            {"3": "list-2", "4": {"li": "list-a", "ll": 1, "lt": "unordered"}, "5": [{"2": "2", "3": "txt-6", "7": [{"8": "要点B"}]}], "6": "l"},
        ],
    }
    (note_dir / file_id).write_text(json.dumps(note_payload, ensure_ascii=False), encoding="utf-8")
    (resource_dir / resource_id).write_bytes(PNG_1X1)

    monkeypatch.setenv("VR_YOUDAO_DATA_DIR", str(data_root))
    monkeypatch.setattr(
        research_ingest.youdao_sync,
        "read_note",
        lambda note_id: {"file_id": note_id, "content": "问题清单\n轮胎模具\n1、轮胎模具概念\n第一段正文\n第二段正文"},
    )

    _content, blocks = research_ingest.extract_youdao_note_to_blocks(file_id, "豪迈科技.note")

    root = blocks[0]
    root_children = root["children"]

    assert [child["title"] for child in root_children if child["type"] == "section"] == ["轮胎模具"]
    assert all(child.get("title") != "1、轮胎模具概念" for child in root_children if child["type"] == "section")

    leading_paragraph = next(child for child in root_children if child["type"] == "paragraph")
    assert leading_paragraph["content"] == "问题清单"

    section = next(child for child in root_children if child["type"] == "section")
    sequence = [child["type"] for child in section["children"]]
    assert sequence == ["paragraph", "paragraph", "image", "paragraph", "bullet_list"]
    assert section["children"][0]["content"] == "1、轮胎模具概念"
    assert section["children"][1]["content"] == "第一段正文"
    assert section["children"][2]["type"] == "image"
    assert section["children"][3]["content"] == "第二段正文"
    assert section["children"][4]["items"] == ["要点A", "要点B"]
