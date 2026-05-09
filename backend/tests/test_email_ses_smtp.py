"""Unit tests for ``services.email_service`` (SES SMTP, dry-run, mocks)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

_SRC = Path(__file__).resolve().parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from services.email_service import (  # noqa: E402
    EmailConfigurationError,
    send_email,
    send_experiment_completed_email,
    send_password_reset_email,
    smtp_enabled,
)


def test_smtp_enabled_false_when_env_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "false")
    assert smtp_enabled() is False


def test_smtp_enabled_default_true(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SMTP_ENABLED", raising=False)
    assert smtp_enabled() is True


def test_dry_run_does_not_open_smtp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "false")
    with patch("services.email_service.smtplib.SMTP") as smtp_cls:
        send_email(
            "u@example.com",
            "sub",
            "<p>hi</p>",
            text_body="hi",
        )
        smtp_cls.assert_not_called()


def test_missing_smtp_env_raises_on_send(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "true")
    for k in (
        "SMTP_HOST",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_FROM_EMAIL",
        "SMTP_USER",
        "SMTP_FROM",
    ):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.delenv("SMTP_USER", raising=False)
    with pytest.raises(EmailConfigurationError) as ei:
        send_email("u@example.com", "s", "<p>x</p>")
    assert "SMTP_HOST" in str(ei.value)


def test_send_email_uses_starttls_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "true")
    monkeypatch.setenv("SMTP_HOST", "email-smtp.ap-northeast-2.amazonaws.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "user")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "no-reply@example.com")
    monkeypatch.setenv("SMTP_FROM_NAME", "Test")
    monkeypatch.setenv("SMTP_USE_TLS", "true")
    monkeypatch.setenv("SMTP_USE_SSL", "false")

    mock_ctx = MagicMock()
    mock_server = MagicMock()
    mock_ctx.__enter__.return_value = mock_server
    mock_ctx.__exit__.return_value = None
    with patch("services.email_service.smtplib.SMTP", return_value=mock_ctx):
        send_email("to@example.com", "Subject", "<b>HTML</b>", text_body="text")
    mock_server.starttls.assert_called_once()
    mock_server.login.assert_called_once_with("user", "secret")
    mock_server.sendmail.assert_called_once()
    args = mock_server.sendmail.call_args[0]
    assert args[0] == "no-reply@example.com"
    assert args[1] == ["to@example.com"]


def test_password_reset_calls_send_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "false")
    with patch("services.email_service.send_email") as m:
        send_password_reset_email("u@example.com", "https://x/reset?token=1")
    m.assert_called_once()
    assert "비밀번호" in m.call_args[0][1]


def test_experiment_completed_calls_send_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SMTP_ENABLED", "false")
    with patch("services.email_service.send_email") as m:
        send_experiment_completed_email("u@example.com", "exp1", "https://r")
    m.assert_called_once()
