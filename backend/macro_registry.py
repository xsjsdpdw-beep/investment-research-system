"""中国宏观数据库指标注册表。"""

from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path


DATA_ROOT = Path(os.environ.get("VR_DATA_DIR") or (Path.home() / ".vibe-research"))
REGISTRY_FILE = DATA_ROOT / "database" / "china_macro_registry.json"


def default_china_macro_registry() -> dict:
    return {
        "title": "中国宏观数据库指标注册表",
        "groups": [
            {
                "key": "overview",
                "label": "总览",
                "items": [
                    {"key": "gdp_yoy", "label": "GDP同比", "freq": "季度", "public_key": "gdp_yoy", "ifind_code": "M001620247"},
                    {"key": "industrial_value_added", "label": "工业增加值", "freq": "月度", "public_key": "industrial_value_added", "ifind_code": "M0000612"},
                    {"key": "retail_sales", "label": "社零", "freq": "月度", "public_key": "retail_sales", "ifind_code": "M0000614"},
                    {"key": "cpi_yoy", "label": "CPI同比", "freq": "月度", "public_key": "cpi_yoy", "ifind_code": "M0000545"},
                ],
            },
            {
                "key": "structure",
                "label": "核心指标结构",
                "items": [
                    {"key": "social_financing_stock", "label": "社融存量同比", "freq": "月度", "public_key": "social_financing_stock", "ifind_code": "M0049477"},
                    {"key": "rmb_loans", "label": "人民币贷款", "freq": "月度", "public_key": "rmb_loans", "ifind_code": "M0001385"},
                    {"key": "government_bonds", "label": "政府债券", "freq": "月度", "public_key": "government_bonds", "ifind_code": "M5525763"},
                ],
            },
            {
                "key": "trend",
                "label": "核心项走势",
                "items": [
                    {"key": "cpi_food_yoy", "label": "CPI食品当月同比", "freq": "月度", "public_key": "cpi_food_yoy", "ifind_code": "M0000552"},
                    {"key": "cpi_non_food_yoy", "label": "CPI非食品当月同比", "freq": "月度", "public_key": "cpi_non_food_yoy", "ifind_code": "M0000553"},
                ],
            },
        ],
    }


def _atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _validate_registry(payload: dict) -> dict:
    title = (payload.get("title") or "中国宏观数据库指标注册表").strip()
    groups = payload.get("groups")
    if not isinstance(groups, list):
        raise ValueError("groups 必须是列表")
    clean_groups = []
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("group 必须是对象")
        items = group.get("items")
        if not isinstance(items, list):
            raise ValueError("group.items 必须是列表")
        clean_items = []
        for item in items:
            if not isinstance(item, dict):
                raise ValueError("indicator item 必须是对象")
            key = (item.get("key") or "").strip()
            label = (item.get("label") or "").strip()
            if not key or not label:
                raise ValueError("指标 key 和 label 不能为空")
            clean_items.append({
                "key": key,
                "label": label,
                "freq": (item.get("freq") or "").strip(),
                "public_key": (item.get("public_key") or "").strip(),
                "ifind_code": (item.get("ifind_code") or "").strip(),
            })
        clean_groups.append({
            "key": (group.get("key") or "").strip() or "custom",
            "label": (group.get("label") or "").strip() or "自定义",
            "items": clean_items,
        })
    return {"title": title, "groups": clean_groups}


def china_macro_registry() -> dict:
    if REGISTRY_FILE.exists():
        try:
            return _validate_registry(json.loads(REGISTRY_FILE.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError, ValueError):
            return default_china_macro_registry()
    return deepcopy(default_china_macro_registry())


def save_china_macro_registry(payload: dict) -> dict:
    data = _validate_registry(payload)
    _atomic_json(REGISTRY_FILE, data)
    return data
