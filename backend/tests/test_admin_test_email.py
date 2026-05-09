"""Tests for ``POST /api/admin/test-email`` (ADMIN_API_KEY header)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _prepend_backend_on_path() -> None:
    s = str(_BACKEND_DIR)
    if s not in sys.path:
        sys.path.insert(0, s)


@pytest.fixture(autouse=True)
def _clear_overrides() -> None:
    yield
    main_mod = sys.modules.get("main")
    if main_mod is not None and hasattr(main_mod, "app"):
        main_mod.app.dependency_overrides.clear()


def _client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("APS_SQLITE_FALLBACK_DEV", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APS_DATABASE_URL", raising=False)
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key-32bytes-long!!")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars!!")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5174")
    _prepend_backend_on_path()
    import importlib

    import database
    import main as main_mod

    importlib.reload(database)
    importlib.reload(main_mod)
    return TestClient(main_mod.app, raise_server_exceptions=True)


def test_test_email_missing_header_401(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    r = c.post(
        "/api/admin/test-email",
        json={
            "to": "a@b.com",
            "subject": "s",
            "message": "m",
        },
    )
    assert r.status_code == 401


def test_test_email_wrong_key_401(monkeypatch: pytest.MonkeyPatch) -> None:
    c = _client(monkeypatch)
    r = c.post(
        "/api/admin/test-email",
        headers={"X-Admin-API-Key": "test-admin-key-32bytes-wrong!!"},
        json={
            "to": "a@b.com",
            "subject": "s",
            "message": "m",
        },
    )
    assert r.status_code == 401


def test_test_email_admin_key_unconfigured_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    monkeypatch.setenv("APS_SQLITE_FALLBACK_DEV", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("APS_DATABASE_URL", raising=False)
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-at-least-32-chars!!")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5174")
    _prepend_backend_on_path()
    import importlib

    import database
    import main as main_mod

    importlib.reload(database)
    importlib.reload(main_mod)
    c = TestClient(main_mod.app, raise_server_exceptions=True)
    r = c.post(
        "/api/admin/test-email",
        headers={"X-Admin-API-Key": "anything"},
        json={"to": "a@b.com", "subject": "s", "message": "m"},
    )
    assert r.status_code == 503


def test_test_email_dry_run_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "false")
    c = _client(monkeypatch)
    r = c.post(
        "/api/admin/test-email",
        headers={"X-Admin-API-Key": "test-admin-key-32bytes-long!!"},
        json={
            "to": "recipient@example.com",
            "subject": "AICONV Lab SES SMTP Test",
            "message": "SES SMTP 테스트 메일입니다.",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "dry_run"
    assert body.get("to") == "recipient@example.com"


def test_test_email_send_path_mocked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "true")
    monkeypatch.setenv("SMTP_HOST", "email-smtp.ap-northeast-2.amazonaws.com")
    monkeypatch.setenv("SMTP_USERNAME", "user")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "no-reply@example.com")
    c = _client(monkeypatch)
    mock_ctx = MagicMock()
    mock_server = MagicMock()
    mock_ctx.__enter__.return_value = mock_server
    mock_ctx.__exit__.return_value = None
    with patch("services.email_service.smtplib.SMTP", return_value=mock_ctx) as smtp_cls:
        r = c.post(
            "/api/admin/test-email",
            headers={"X-Admin-API-Key": "test-admin-key-32bytes-long!!"},
            json={
                "to": "recipient@example.com",
                "subject": "Hi",
                "message": "Body",
            },
        )
    assert r.status_code == 200
    assert r.json().get("status") == "sent"
    smtp_cls.assert_called_once()
