"""Offline regression tests for the lightweight LLM gateway.

These tests intentionally mock the provider SDKs so they stay fast, hermetic,
and safe to run in CI without leaking API keys.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

_SRC_DIR = Path(__file__).resolve().parent.parent / "src"


def _load_gateway_app():
    """Load ``backend/src/main.py`` by absolute path to avoid colliding with
    the legacy ``backend/main.py`` module when pytest auto-adds ``backend/``
    to ``sys.path`` (happens when it discovers this package)."""
    # Ensure src/ is importable for the app's own ``from services...`` lines.
    src_str = str(_SRC_DIR)
    if src_str not in sys.path:
        sys.path.insert(0, src_str)

    spec = importlib.util.spec_from_file_location(
        "llm_gateway_app_main", str(_SRC_DIR / "main.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["llm_gateway_app_main"] = module
    spec.loader.exec_module(module)
    return module.app


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Build an app instance with dummy keys and no outbound calls."""
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-openai")
    monkeypatch.setenv("GEMINI_API_KEY", "dummy-gemini")
    app = _load_gateway_app()
    return TestClient(app)


def test_health_reports_both_providers_configured(client: TestClient) -> None:
    resp = client.get("/api/chat/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "status": "ok",
        "openai_configured": True,
        "gemini_configured": True,
    }


def test_chat_test_rejects_unknown_provider(client: TestClient) -> None:
    resp = client.post(
        "/api/chat/test",
        json={"provider": "claude", "message": "hi"},
    )
    # Pydantic literal rejects non-matching provider at the schema layer.
    assert resp.status_code == 422


def test_chat_test_rejects_empty_message(client: TestClient) -> None:
    resp = client.post(
        "/api/chat/test",
        json={"provider": "openai", "message": ""},
    )
    assert resp.status_code == 422


def test_chat_test_openai_happy_path(client: TestClient) -> None:
    with patch("services.llm_gateway.ask_openai", return_value="pong-mock") as m:
        resp = client.post(
            "/api/chat/test",
            json={"provider": "openai", "message": "ping"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"provider": "openai", "response": "pong-mock"}
    # ask_llm dispatches to ask_openai(prompt, model=model).
    m.assert_called_once_with("ping", model=None)


def test_chat_test_gemini_happy_path(client: TestClient) -> None:
    # ask_llm dispatches to ask_gemini; patch the dispatcher for simplicity.
    with patch("services.llm_gateway.ask_gemini", return_value="world-mock"):
        resp = client.post(
            "/api/chat/test",
            json={"provider": "gemini", "message": "hello"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"provider": "gemini", "response": "world-mock"}


def test_chat_test_surface_gateway_error_as_400(client: TestClient) -> None:
    from services.llm_gateway import LLMGatewayError

    with patch(
        "services.llm_gateway.ask_openai",
        side_effect=LLMGatewayError("boom"),
    ):
        resp = client.post(
            "/api/chat/test",
            json={"provider": "openai", "message": "ping"},
        )
    assert resp.status_code == 400
    assert resp.json() == {"detail": "boom"}


def test_mask_never_leaks_key_material() -> None:
    from services.llm_gateway import _mask  # type: ignore[attr-defined]

    # Use a length-1 "secret" to guarantee no substring of a real key is returned.
    assert _mask("sk-THIS-SHOULD-NEVER-APPEAR-1234567890") == "<configured>"
    assert _mask("") == "<empty>"


def test_chat_test_uses_unified_dispatcher(client: TestClient) -> None:
    """Ensure the API goes through ``ask_llm`` so both providers share one code path."""
    with patch("api.chat.ask_llm", return_value="dispatched") as m:
        resp = client.post(
            "/api/chat/test",
            json={"provider": "openai", "message": "ping"},
        )
    assert resp.status_code == 200
    assert resp.json()["response"] == "dispatched"
    m.assert_called_once_with("openai", "ping")
