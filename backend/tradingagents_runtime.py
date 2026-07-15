"""TradingAgents 深度分析运行时。

首版职责：
- 校验 A 股代码和 TradingAgents 配置
- 管理内存内任务注册表
- 以事件流形式对外暴露进度/结果
- 在运行时缺少 TradingAgents 依赖时给出清晰错误
"""

from __future__ import annotations

import contextlib
import os
import queue
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterator


STAGES = [
    "市场分析",
    "舆情分析",
    "新闻分析",
    "基本面分析",
    "政策分析",
    "游资追踪",
    "解禁监控",
    "多空辩论",
    "交易方案",
    "风险讨论",
    "最终决策",
]


@dataclass
class TaskState:
    task_id: str
    code: str
    name: str
    context: str
    cfg: dict[str, str]
    status: str = "pending"
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    done: bool = False
    seq: int = 0
    event_queue: "queue.Queue[dict[str, Any]]" = field(default_factory=queue.Queue)


Runner = Callable[[TaskState, Callable[[str, str | None], None]], dict[str, Any]]

_TASKS: dict[str, TaskState] = {}
_LOCK = threading.Lock()
_REPO_ROOT = Path(__file__).resolve().parent.parent
_PROVIDER_ALIAS = {
    "openai-compatible": "openai",
    "silicon": "openai",
    "mimo": "openai",
}
_PROVIDER_API_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "qwen": "DASHSCOPE_API_KEY",
    "glm": "ZHIPU_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "minimax": "MINIMAX_API_KEY",
    "xai": "XAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
}


def _validate_code(code: str) -> str:
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise ValueError("仅支持 A 股 6 位代码")
    return code


def _validate_cfg(cfg: dict[str, Any]) -> dict[str, str]:
    required = ["provider", "baseURL", "apiKey", "deepModel", "quickModel"]
    cleaned = {k: str(cfg.get(k, "")).strip() for k in required}
    if any(not cleaned[k] for k in required):
        raise ValueError("TradingAgents 配置不完整，请先在「接入 AI」页填写")
    return cleaned


def _resolve_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    return _PROVIDER_ALIAS.get(p, p)


def _candidate_repo_paths() -> list[Path]:
    env_path = os.environ.get("VR_TRADINGAGENTS_DIR", "").strip()
    candidates = [
        Path(env_path) if env_path else None,
        _REPO_ROOT / "backend" / ".cache" / "TradingAgents-astock",
        _REPO_ROOT / "backend" / ".cache" / "tradingagents-astock",
        _REPO_ROOT / "TradingAgents-astock",
        _REPO_ROOT / "tradingagents-astock",
        _REPO_ROOT.parent / "TradingAgents-astock",
        _REPO_ROOT.parent / "tradingagents-astock",
    ]
    return [p.resolve() for p in candidates if p]


def _find_local_repo_path() -> Path | None:
    for path in _candidate_repo_paths():
        if (path / "tradingagents").is_dir() and (path / "pyproject.toml").exists():
            return path
    return None


@contextlib.contextmanager
def _temporary_env(var: str, value: str):
    old = os.environ.get(var)
    os.environ[var] = value
    try:
        yield
    finally:
        if old is None:
            os.environ.pop(var, None)
        else:
            os.environ[var] = old


@contextlib.contextmanager
def _prepend_sys_path(path: Path | None):
    if not path:
        yield
        return
    path_str = str(path)
    if path_str in sys.path:
        yield
        return
    sys.path.insert(0, path_str)
    try:
        yield
    finally:
        if sys.path and sys.path[0] == path_str:
            sys.path.pop(0)
        elif path_str in sys.path:
            sys.path.remove(path_str)


def _normalize_result(task: TaskState, final_state: dict[str, Any], decision: Any) -> dict[str, Any]:
    def text(v: Any) -> str:
        return "" if v is None else str(v)

    analyst_sections = [
        {"title": "市场分析", "content": text(final_state.get("market_report"))},
        {"title": "舆情分析", "content": text(final_state.get("sentiment_report"))},
        {"title": "新闻分析", "content": text(final_state.get("news_report"))},
        {"title": "基本面分析", "content": text(final_state.get("fundamentals_report"))},
        {"title": "政策分析", "content": text(final_state.get("policy_report"))},
        {"title": "游资追踪", "content": text(final_state.get("hot_money_report"))},
        {"title": "解禁监控", "content": text(final_state.get("lockup_report"))},
    ]
    analyst_sections = [s for s in analyst_sections if s["content"]]

    debate_state = final_state.get("investment_debate_state") or {}
    risk_state = final_state.get("risk_debate_state") or {}
    investment_plan = text(final_state.get("investment_plan"))
    trader_plan = text(final_state.get("trader_investment_plan"))
    raw_decision = text(final_state.get("final_trade_decision") or decision)

    full_report_parts = [
        f"# {task.name or task.code} TradingAgents 深度分析",
        "## 结论摘要",
        raw_decision or "无",
    ]
    if analyst_sections:
        full_report_parts.append("## 七个分析师要点")
        for section in analyst_sections:
            full_report_parts.append(f"### {section['title']}\n{section['content']}")
    if debate_state:
        full_report_parts.append("## 多空辩论结论")
        full_report_parts.append(text(debate_state.get("judge_decision")))
    if trader_plan or risk_state:
        full_report_parts.append("## 交易与风险结论")
        if trader_plan:
            full_report_parts.append(trader_plan)
        full_report_parts.append(text(risk_state.get("judge_decision")))

    return {
        "summary": raw_decision or f"{task.code} 深度分析已完成",
        "analyst_sections": analyst_sections,
        "debate_summary": text(debate_state.get("judge_decision")),
        "risk_summary": "\n\n".join(part for part in [trader_plan, text(risk_state.get("judge_decision"))] if part),
        "full_report": "\n\n".join(part for part in full_report_parts if part),
        "raw_decision": raw_decision,
    }


def _push(task: TaskState, event: dict[str, Any]) -> None:
    task.seq += 1
    stamped = {**event, "_seq": task.seq}
    task.events.append(stamped)
    task.event_queue.put(stamped)


def get_task(task_id: str) -> TaskState:
    with _LOCK:
        task = _TASKS.get(task_id)
    if not task:
        raise KeyError(task_id)
    return task


def _load_tradingagents_runner() -> Runner:
    repo_path = _find_local_repo_path()
    try:
        with _prepend_sys_path(repo_path):
            from tradingagents.graph.trading_graph import TradingAgentsGraph
    except Exception as exc:  # noqa: BLE001
        hint = (
            f"；如未安装，请先执行 `pip install -e <TradingAgents-astock目录>` "
            f"或设置环境变量 `VR_TRADINGAGENTS_DIR` 指向源码目录"
        )
        raise RuntimeError(f"TradingAgents 运行时未安装或不可用{hint}") from exc

    def runner(task: TaskState, publish_log: Callable[[str, str | None], None]) -> dict[str, Any]:
        provider = _resolve_provider(task.cfg["provider"])
        config = {
            "llm_provider": provider,
            "backend_url": task.cfg["baseURL"],
            "deep_think_llm": task.cfg["deepModel"],
            "quick_think_llm": task.cfg["quickModel"],
            "output_language": "Chinese",
        }
        publish_log("任务初始化", "已加载 TradingAgents 运行时，开始执行多 Agent 分析")
        env_var = _PROVIDER_API_KEY_ENV.get(provider)
        if not env_var and provider != "ollama":
            raise RuntimeError(f"TradingAgents 暂不支持 provider={provider}")
        with _temporary_env(env_var, task.cfg["apiKey"]) if env_var else contextlib.nullcontext():
            graph = TradingAgentsGraph(debug=False, config=config)
            final_state, decision = graph.propagate(task.code, str(date.today()))
        return _normalize_result(task, final_state or {}, decision)

    return runner


def _run_task(task: TaskState) -> None:
    task.status = "running"
    _push(task, {"type": "task_started", "taskId": task.task_id, "code": task.code})

    def publish_log(stage: str, message: str | None = None) -> None:
        if task.cancel_requested:
            raise RuntimeError("任务已取消")
        _push(task, {"type": "log", "taskId": task.task_id, "stage": stage, "message": message or stage})

    try:
        runner = _load_tradingagents_runner()
        for stage in STAGES:
            if task.cancel_requested:
                task.status = "cancelled"
                _push(task, {"type": "cancelled", "taskId": task.task_id, "stage": stage, "message": "用户已取消"})
                return
            _push(task, {"type": "stage_started", "taskId": task.task_id, "stage": stage})
            if stage == "最终决策":
                result = runner(task, publish_log)
                task.result = result
                _push(task, {"type": "stage_completed", "taskId": task.task_id, "stage": stage})
                task.status = "completed"
                _push(task, {"type": "result", "taskId": task.task_id, "result": result})
            else:
                time.sleep(0.01)
                _push(task, {"type": "stage_completed", "taskId": task.task_id, "stage": stage})
    except RuntimeError as exc:
        if str(exc) == "任务已取消":
            task.status = "cancelled"
            _push(task, {"type": "cancelled", "taskId": task.task_id, "message": "用户已取消"})
        else:
            task.status = "error"
            task.error = str(exc)
            _push(task, {"type": "error", "taskId": task.task_id, "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        task.status = "error"
        task.error = str(exc)
        _push(task, {"type": "error", "taskId": task.task_id, "message": f"TradingAgents 运行失败：{exc}"})
    finally:
        task.done = True


def start_task(code: str, name: str, context: str, cfg: dict[str, Any]) -> str:
    code = _validate_code(code)
    cleaned = _validate_cfg(cfg)
    task = TaskState(
        task_id=uuid.uuid4().hex,
        code=code,
        name=(name or "").strip(),
        context=context or "",
        cfg=cleaned,
    )
    with _LOCK:
        _TASKS[task.task_id] = task
    threading.Thread(target=_run_task, args=(task,), daemon=True).start()
    return task.task_id


def stream_events(task_id: str) -> Iterator[dict[str, Any]]:
    task = get_task(task_id)
    snapshot = list(task.events)
    last_seq = snapshot[-1]["_seq"] if snapshot else 0
    for event in snapshot:
        yield event
    while True:
        if task.done and task.event_queue.empty():
            break
        try:
            event = task.event_queue.get(timeout=0.2)
        except queue.Empty:
            continue
        if event.get("_seq", 0) <= last_seq:
            continue
        last_seq = event["_seq"]
        yield event


def cancel_task(task_id: str) -> dict[str, Any]:
    task = get_task(task_id)
    task.cancel_requested = True
    return {"ok": True}


def _create_task_for_test(code: str) -> str:
    task = TaskState(task_id=uuid.uuid4().hex, code=code, name="", context="", cfg=_validate_cfg({
        "provider": "openai-compatible",
        "baseURL": "https://example.com",
        "apiKey": "sk-test",
        "deepModel": "deep-test",
        "quickModel": "quick-test",
    }))
    with _LOCK:
        _TASKS[task.task_id] = task
    return task.task_id
