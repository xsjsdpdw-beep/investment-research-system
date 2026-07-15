import json
import time

import pytest
from fastapi.testclient import TestClient

import app as app_module
import tradingagents_runtime as runtime


client = TestClient(app_module.app)


def valid_cfg():
    return {
        "provider": "openai-compatible",
        "baseURL": "https://example.com",
        "apiKey": "sk-test",
        "deepModel": "deep-test",
        "quickModel": "quick-test",
    }


def wait_for_done(task_id: str, timeout: float = 2.0):
    started = time.time()
    while time.time() - started < timeout:
        task = runtime.get_task(task_id)
        if task.done:
            return task
        time.sleep(0.02)
    raise AssertionError("task did not finish in time")


def test_start_task_rejects_non_astock():
    with pytest.raises(ValueError, match="仅支持 A 股 6 位代码"):
        runtime.start_task("AAPL", "", "", valid_cfg())


def test_start_task_rejects_missing_provider_fields():
    with pytest.raises(ValueError, match="TradingAgents 配置不完整"):
        runtime.start_task("600519", "", "", {"provider": "", "baseURL": "", "apiKey": "", "deepModel": "", "quickModel": ""})


def test_cancel_task_marks_running_task():
    task_id = runtime._create_task_for_test("600519")
    assert runtime.cancel_task(task_id)["ok"] is True
    assert runtime.get_task(task_id).cancel_requested is True


def test_run_task_emits_error_when_runtime_missing(monkeypatch):
    monkeypatch.setattr(runtime, "_load_tradingagents_runner", lambda: (_ for _ in ()).throw(ImportError("missing")))
    task_id = runtime.start_task("600519", "贵州茅台", "ctx", valid_cfg())
    task = wait_for_done(task_id)
    assert task.status == "error"
    assert any(event["type"] == "error" and "运行失败" in event["message"] for event in task.events)


def test_resolve_provider_aliases():
    assert runtime._resolve_provider("openai-compatible") == "openai"
    assert runtime._resolve_provider("silicon") == "openai"
    assert runtime._resolve_provider("deepseek") == "deepseek"


def test_find_local_repo_path_from_env(monkeypatch, tmp_path):
    repo = tmp_path / "TradingAgents-astock"
    (repo / "tradingagents").mkdir(parents=True)
    (repo / "pyproject.toml").write_text("[project]\nname='tradingagents-astock'\n", encoding="utf-8")
    monkeypatch.setenv("VR_TRADINGAGENTS_DIR", str(repo))
    assert runtime._find_local_repo_path() == repo.resolve()


def test_run_task_emits_result_with_fake_runner(monkeypatch):
    def fake_runner(task, publish_log):
        publish_log("任务初始化", "fake runner started")
        return {
            "summary": f"{task.code} 深度分析已完成",
            "analyst_sections": [{"title": "市场分析", "content": "ok"}],
            "debate_summary": "debate",
            "risk_summary": "risk",
            "full_report": "full",
            "raw_decision": "decision",
        }

    monkeypatch.setattr(runtime, "_load_tradingagents_runner", lambda: fake_runner)
    task_id = runtime.start_task("600519", "贵州茅台", "ctx", valid_cfg())
    task = wait_for_done(task_id)
    assert task.status == "completed"
    assert task.result is not None
    assert any(event["type"] == "result" for event in task.events)


def test_api_run_rejects_bad_code():
    r = client.post("/api/tradingagents/run", json={"code": "AAPL", "name": "", "context": "", "config": valid_cfg()})
    assert r.status_code == 400


def test_api_stream_replays_result(monkeypatch):
    def fake_runner(task, publish_log):
        publish_log("任务初始化", "fake runner started")
        return {
            "summary": "done",
            "analyst_sections": [],
            "debate_summary": "",
            "risk_summary": "",
            "full_report": "full",
            "raw_decision": "decision",
        }

    monkeypatch.setattr(runtime, "_load_tradingagents_runner", lambda: fake_runner)
    start = client.post("/api/tradingagents/run", json={"code": "600519", "name": "贵州茅台", "context": "ctx", "config": valid_cfg()})
    assert start.status_code == 200
    task_id = start.json()["taskId"]
    wait_for_done(task_id)

    stream = client.get(f"/api/tradingagents/stream/{task_id}")
    assert stream.status_code == 200
    lines = [json.loads(line) for line in stream.text.splitlines() if line.strip()]
    assert any(line["type"] == "task_started" for line in lines)
    assert any(line["type"] == "result" for line in lines)


def test_api_cancel_missing_task_404():
    r = client.post("/api/tradingagents/cancel/not-found")
    assert r.status_code == 404
