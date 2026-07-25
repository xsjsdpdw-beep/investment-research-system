from fastapi.testclient import TestClient

from app import app


def test_field_research_transcription_status():
    response = TestClient(app).get("/api/field-research/transcription-status")
    assert response.status_code == 200
    payload = response.json()["data"]
    assert {"available", "engine", "model", "message"} <= payload.keys()


def test_field_research_rejects_unsupported_audio_type():
    response = TestClient(app).post(
        "/api/field-research/transcribe",
        files={"file": ("note.txt", b"not audio", "text/plain")},
    )
    assert response.status_code == 400
    assert "只支持" in response.json()["detail"]
