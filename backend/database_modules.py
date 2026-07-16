"""数据库模块注册表：先固定一期骨架，后续逐步接真实数据。"""

from __future__ import annotations

import json
import os
import re
from copy import deepcopy
from pathlib import Path


DATA_ROOT = Path(os.environ.get("VR_DATA_DIR") or (Path.home() / ".vibe-research"))
CUSTOM_MODULES_FILE = DATA_ROOT / "database" / "custom_modules.json"
MODULE_ORDER_FILE = DATA_ROOT / "database" / "module_order.json"


def _filters(*items: tuple[str, str, list[str]]) -> list[dict]:
    return [{"key": key, "label": label, "options": options} for key, label, options in items]


def _containers(*items: tuple[str, str, str]) -> list[dict]:
    return [{"key": key, "title": title, "kind": kind} for key, title, kind in items]


def _slug(text: str) -> str:
    value = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff-]+", "-", text.strip().lower())
    return re.sub(r"-{2,}", "-", value).strip("-") or "custom-module"


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return deepcopy(default)


def _atomic_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _default_filters() -> list[dict]:
    return _filters(("custom_filter", "自定义筛选", ["待配置"]))


def _default_containers() -> list[dict]:
    return _containers(("custom-chart", "自定义图表容器", "chart"), ("custom-table", "自定义表格容器", "table"))


def _validate_module(payload: dict, *, custom: bool = True) -> dict:
    label = (payload.get("label") or "").strip()
    if not label:
        raise ValueError("模块名称不能为空")
    key = _slug(payload.get("key") or label)
    filters = payload.get("filters") or _default_filters()
    containers = payload.get("containers") or _default_containers()
    if not isinstance(filters, list) or not isinstance(containers, list):
        raise ValueError("filters 和 containers 必须是列表")
    clean_filters = []
    for item in filters:
        clean_filters.append({
            "key": _slug(str(item.get("key") or item.get("label") or "filter")),
            "label": (item.get("label") or "自定义筛选").strip(),
            "options": item.get("options") if isinstance(item.get("options"), list) and item.get("options") else ["待配置"],
        })
    clean_containers = []
    for item in containers:
        kind = item.get("kind") if item.get("kind") in {"chart", "table", "heatmap", "timeline", "text"} else "chart"
        clean_containers.append({
            "key": _slug(str(item.get("key") or item.get("title") or kind)),
            "title": (item.get("title") or "自定义容器").strip(),
            "kind": kind,
        })
    return {
        "key": key,
        "label": label,
        "status": "skeleton",
        "description": (payload.get("description") or "自定义数据库子模块，后续可继续配置筛选项、图表和数据源。").strip(),
        "filters": clean_filters,
        "containers": clean_containers,
        "custom": custom,
    }


def default_modules() -> list[dict]:
    return [
            {
                "key": "industry-map",
                "label": "行业图谱",
                "status": "skeleton",
                "description": "申万三级行业 CR3 市值、营收、利润占比与行业对比。",
                "filters": _filters(
                    ("sw_level", "申万层级", ["一级", "二级", "三级"]),
                    ("industry", "行业", ["待接入行业列表"]),
                    ("period", "期间", ["年度", "季度"]),
                ),
                "containers": _containers(
                    ("cr3-chart", "CR3 占比柱状图", "chart"),
                    ("compare-table", "行业对比表", "table"),
                ),
            },
            {
                "key": "earnings-tracker",
                "label": "业绩跟踪",
                "status": "skeleton",
                "description": "按行业和个股跟踪营收、归母净利规模及增速。",
                "filters": _filters(
                    ("view", "视角", ["行业", "个股"]),
                    ("sw_level", "申万层级", ["一级", "二级", "三级"]),
                    ("period", "年度/季度", ["近 5 年", "单期"]),
                ),
                "containers": _containers(
                    ("scale-growth-chart", "规模与增速图", "chart"),
                    ("composition-chart", "构成占比图", "chart"),
                    ("history-table", "连续历史数据表", "table"),
                ),
            },
            {
                "key": "china-macro",
                "label": "中国宏观数据库",
                "status": "sample_ready",
                "description": "一期已提供总览、结构拆解热力表、核心项走势样板。",
                "filters": _filters(
                    ("indicator_group", "指标组", ["总览", "核心指标结构", "核心项走势"]),
                    ("freq", "频率", ["月度", "季度", "年度"]),
                ),
                "containers": _containers(
                    ("overview-table", "总览表格", "table"),
                    ("structure-heatmap", "结构拆解热力表", "heatmap"),
                    ("trend-chart", "核心项走势", "chart"),
                ),
            },
            {
                "key": "china-midstream",
                "label": "中国中观数据库",
                "status": "skeleton",
                "description": "按中观行业沉淀年度、季度变化和图表化指标。",
                "filters": _filters(
                    ("sector", "中观行业", ["待自定义"]),
                    ("period", "期间", ["年度", "季度", "月度"]),
                ),
                "containers": _containers(
                    ("indicator-chart", "中观指标图表", "chart"),
                    ("commentary", "观点说明", "text"),
                ),
            },
            {
                "key": "us-macro",
                "label": "美国宏观数据库",
                "status": "skeleton",
                "description": "参考中国宏观数据库，预留美国 CPI、就业、利率等指标。",
                "filters": _filters(
                    ("indicator_group", "指标组", ["通胀", "就业", "利率", "增长"]),
                    ("freq", "频率", ["月度", "季度"]),
                ),
                "containers": _containers(
                    ("overview-table", "美国宏观总览", "table"),
                    ("trend-chart", "核心项走势", "chart"),
                ),
            },
            {
                "key": "china-index-review",
                "label": "上证指数复盘",
                "status": "skeleton",
                "description": "1990 至今指数走势、年度涨跌幅、估值和年度大事记。",
                "filters": _filters(
                    ("index", "指数", ["上证", "创业板", "科创板"]),
                    ("year", "年份", ["1990-2026"]),
                ),
                "containers": _containers(
                    ("long-term-dashboard", "长期总览看板", "chart"),
                    ("year-review", "年度复盘", "timeline"),
                    ("valuation-chart", "估值水平", "chart"),
                ),
            },
            {
                "key": "us-index-review",
                "label": "美国指数复盘",
                "status": "skeleton",
                "description": "参考上证指数复盘，预留美股主要指数长期与年度复盘。",
                "filters": _filters(
                    ("index", "指数", ["标普500", "纳斯达克", "道琼斯"]),
                    ("year", "年份", ["年度筛选"]),
                ),
                "containers": _containers(
                    ("long-term-dashboard", "长期总览看板", "chart"),
                    ("year-review", "年度复盘", "timeline"),
                ),
            },
        ]


def custom_modules() -> list[dict]:
    rows = _read_json(CUSTOM_MODULES_FILE, [])
    if not isinstance(rows, list):
        return []
    out = []
    for item in rows:
        if isinstance(item, dict):
            try:
                out.append(_validate_module(item, custom=True))
            except ValueError:
                continue
    return out


def upsert_custom_module(payload: dict) -> dict:
    module = _validate_module(payload, custom=True)
    reserved = {item["key"] for item in default_modules()}
    if module["key"] in reserved:
        raise ValueError("不能覆盖系统内置模块 key")
    rows = [item for item in custom_modules() if item["key"] != module["key"]]
    rows.append(module)
    _atomic_json(CUSTOM_MODULES_FILE, rows)
    return module


def _ordered_modules(modules: list[dict]) -> list[dict]:
    order = _read_json(MODULE_ORDER_FILE, [])
    if not isinstance(order, list):
        order = []
    rank = {str(key): idx for idx, key in enumerate(order)}
    fallback_rank = {item["key"]: idx for idx, item in enumerate(modules)}
    return sorted(modules, key=lambda item: (rank.get(item["key"], len(rank) + fallback_rank[item["key"]]), fallback_rank[item["key"]]))


def save_module_order(keys: list[str]) -> dict:
    modules = [*default_modules(), *custom_modules()]
    known = {item["key"] for item in modules}
    clean = [key for key in keys if key in known]
    clean.extend(item["key"] for item in modules if item["key"] not in clean)
    _atomic_json(MODULE_ORDER_FILE, clean)
    return database_modules()


def database_modules() -> dict:
    modules = [*default_modules(), *custom_modules()]
    return {
        "modules": _ordered_modules(modules),
        "container_contract": {
            "filter_bar": {"empty_state": "筛选项未接入真实数据时展示占位选项，不阻塞页面。"},
            "chart": {"empty_state": "暂无数据时展示解释性空态，后续接入 data_adapters 查询结果。"},
            "table": {"empty_state": "空表保留字段结构，方便后续导入 iFind/公开源数据。"},
        },
    }
