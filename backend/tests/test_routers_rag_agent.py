"""TestClient-level regression tests for the new /api/rag and /api/agent routers."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

_SRC_DIR = Path(__file__).resolve().parent.parent / "src"


def _load_gateway_app():
    src_str = str(_SRC_DIR)
    if src_str not in sys.path:
        sys.path.insert(0, src_str)
    spec = importlib.util.spec_from_file_location(
        "llm_gateway_app_main_rag", str(_SRC_DIR / "main.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["llm_gateway_app_main_rag"] = module
    spec.loader.exec_module(module)
    return module.app


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-openai")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy-gemini")
    monkeypatch.setenv("VECTOR_DB_PATH", str(tmp_path / "vdb"))
    monkeypatch.setenv("VECTOR_DB_COLLECTION", "router-test")

    from services.rag import vector_store

    vector_store._cached_store.cache_clear()
    app = _load_gateway_app()
    try:
        yield TestClient(app)
    finally:
        vector_store._cached_store.cache_clear()


def test_agent_list_reports_all_registered(client: TestClient) -> None:
    resp = client.get("/api/agent/list")
    assert resp.status_code == 200
    assert set(resp.json()["agents"]) >= {"data", "model", "report", "experiment", "smart"}


def test_root_reports_new_endpoints(client: TestClient) -> None:
    resp = client.get("/")
    assert resp.status_code == 200
    eps = resp.json()["endpoints"]
    assert "rag_ingest" in eps and "agent_run" in eps


def test_rag_ingest_and_search(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # Mock the embedding call so no outbound traffic happens.
    def _fake_embed(texts, model=None):
        return [[1.0 if "chroma" in t.lower() else 0.0] + [0.0] * 7 for t in texts]

    monkeypatch.setattr(
        "services.rag.embeddings.embed_texts",
        _fake_embed,
    )

    ingest_resp = client.post(
        "/api/rag/ingest",
        json={
            "documents": [
                {
                    "text": "Chroma is a vector database for AI apps.",
                    "metadata": {"source": "intro"},
                    "id": "d1",
                },
                {
                    "text": "FastAPI is used for the backend service.",
                    "metadata": {"source": "stack"},
                    "id": "d2",
                },
            ],
            "chunk_size": 200,
            "chunk_overlap": 20,
        },
    )
    assert ingest_resp.status_code == 200, ingest_resp.text
    assert ingest_resp.json()["ingested_chunks"] >= 2

    stats_resp = client.get("/api/rag/stats")
    assert stats_resp.status_code == 200
    assert stats_resp.json()["count"] >= 2

    search_resp = client.post(
        "/api/rag/query",
        json={
            "query": "tell me about chroma vector db",
            "mode": "search",
            "top_k": 2,
        },
    )
    assert search_resp.status_code == 200
    body = search_resp.json()
    assert body["mode"] == "search"
    assert body["sources"]
    assert any("chroma" in s["text"].lower() for s in body["sources"])


def test_rag_query_answer_mode_uses_llm(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_embed(texts, model=None):
        return [[1.0] + [0.0] * 7 for _ in texts]

    monkeypatch.setattr("services.rag.embeddings.embed_texts", _fake_embed)

    client.post(
        "/api/rag/ingest",
        json={
            "documents": [{"text": "APS uses Chroma + FastAPI.", "metadata": {}}],
        },
    ).raise_for_status()

    with patch("services.rag.retriever.ask_llm", return_value="APS uses Chroma + FastAPI [1]."):
        resp = client.post(
            "/api/rag/query",
            json={"query": "what is APS?", "mode": "answer", "top_k": 1},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "answer"
    assert body["used_context"] is True
    assert "Chroma" in body["answer"]


def test_agent_run_data_agent(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = {
        "dataset_summary": "Electricity consumption per hour for 24 months.",
        "target_candidates": ["kwh"],
        "feature_groups": ["temporal", "weather"],
        "recommended_preprocessing": ["resample to daily"],
        "data_quality_concerns": ["DST shifts"],
    }
    with patch("services.agents.base.ask_llm_json", return_value=fake):
        resp = client.post(
            "/api/agent/run",
            json={
                "agent": "data",
                "task": "hourly electricity consumption",
                "provider": "openai",
            },
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["agent"] == "data"
    assert body["output"]["dataset_summary"].startswith("Electricity")


def test_agent_run_rejects_unknown_agent(client: TestClient) -> None:
    resp = client.post(
        "/api/agent/run",
        json={"agent": "wizard", "task": "anything"},
    )
    assert resp.status_code == 422


def test_agent_run_surface_gateway_error_as_400(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services.llm_gateway import LLMGatewayError

    def _raise(*a, **kw):
        raise LLMGatewayError("quota exceeded")

    monkeypatch.setattr("services.agents.base.ask_llm_json", _raise)
    resp = client.post(
        "/api/agent/run",
        json={"agent": "data", "task": "x"},
    )
    assert resp.status_code == 400
    assert "quota" in resp.json()["detail"]
