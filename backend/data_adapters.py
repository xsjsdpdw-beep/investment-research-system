"""数据源适配层：统一声明公开源 / iFind 的数据集能力与回退策略。"""

from __future__ import annotations

import os
from typing import Any


def provider_status() -> dict[str, Any]:
    ifind_enabled = os.environ.get("VR_IFIND_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
    ifind_ready = ifind_enabled and bool(os.environ.get("VR_IFIND_DSN", "").strip())
    premium_enabled = os.environ.get("VR_PREMIUM_NOTES_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}
    premium_ready = premium_enabled and bool(os.environ.get("VR_PREMIUM_NOTES_DSN", "").strip())
    dataset_status = {
        "china_macro_overview": {
            "active_provider": "ifind" if ifind_ready else "public",
            "fallback_provider": "public",
            "dataset_key": "china_macro_overview",
        },
        "industry_expert_notes": {
            "active_provider": "premium_notes" if premium_ready else "placeholder",
            "fallback_provider": "placeholder",
            "dataset_key": "industry_expert_notes",
        },
        "stock_expert_notes": {
            "active_provider": "premium_notes" if premium_ready else "placeholder",
            "fallback_provider": "placeholder",
            "dataset_key": "stock_expert_notes",
        },
    }
    for key in [
        "industry_map",
        "earnings_tracker",
        "china_midstream",
        "us_macro",
        "china_index_review",
        "us_index_review",
    ]:
        dataset_status[key] = {
            "active_provider": "ifind" if ifind_ready else "placeholder",
            "fallback_provider": "placeholder",
            "dataset_key": key,
        }
    return {
        "providers": {
            "public": {
                "enabled": True,
                "ready": True,
                "label": "公开源",
                "notes": "当前一期默认使用现有公开源与样板数据。",
            },
            "ifind": {
                "enabled": ifind_enabled,
                "ready": ifind_ready,
                "label": "iFind",
                "notes": "设置 VR_IFIND_ENABLED=1 与 VR_IFIND_DSN 后可切到 iFind 适配层。",
            },
            "premium_notes": {
                "enabled": premium_enabled,
                "ready": premium_ready,
                "label": "高价值纪要源",
                "notes": "设置 VR_PREMIUM_NOTES_ENABLED=1 与 VR_PREMIUM_NOTES_DSN 后，可接专家会议纪要、渠道会纪要等高价值内容。",
            },
        },
        **dataset_status,
    }
