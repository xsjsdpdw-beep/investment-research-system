from __future__ import annotations

import json
import threading
from pathlib import Path

import knowledge


def test_atomic_json_survives_concurrent_writes(monkeypatch, tmp_path):
    target = tmp_path / "state.json"
    original_write_text = Path.write_text
    barrier = threading.Barrier(2)

    def wrapped_write_text(self: Path, data: str, *args, **kwargs):
        result = original_write_text(self, data, *args, **kwargs)
        if self.parent == target.parent and self.name.startswith(target.name):
            barrier.wait(timeout=2)
        return result

    monkeypatch.setattr(Path, "write_text", wrapped_write_text)

    errors: list[Exception] = []

    def worker(payload: dict[str, str]):
        try:
            knowledge._atomic_json(target, payload)
        except Exception as exc:  # pragma: no cover - failure path asserted below
            errors.append(exc)

    threads = [
        threading.Thread(target=worker, args=({"writer": "a"},)),
        threading.Thread(target=worker, args=({"writer": "b"},)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not errors
    final_payload = json.loads(target.read_text(encoding="utf-8"))
    assert final_payload["writer"] in {"a", "b"}
