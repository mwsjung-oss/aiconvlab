"""APS 공통 이메일 발송(AWS SES SMTP 및 호환 서버).

환경 변수 누락은 앱 기동을 막지 않으며, 실제 발송 시점에만 검증합니다.
비밀(SMTP_PASSWORD 등)은 로그에 남기지 않습니다.
"""
from __future__ import annotations

import html as html_module
import logging
import os
import smtplib
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

logger = logging.getLogger(__name__)


class EmailConfigurationError(Exception):
    """SMTP_ENABLED=true 인 상태에서 필수 SMTP 환경 변수가 비어 있을 때."""

    pass


class EmailSendError(Exception):
    """SMTP 전송 단계 오류."""

    pass


def _strip(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _truthy(name: str, *, default_if_unset: bool) -> bool:
    v = _strip(name)
    if not v:
        return default_if_unset
    return v.lower() in ("1", "true", "yes", "on")


def smtp_enabled() -> bool:
    """SMTP_ENABLED가 명시적으로 꺼져 있지 않으면 True(EB 기본과 동일하게 동작).

    - 미설정: True
    - false/0/no/off: False (dry-run만)
    """
    v = _strip("SMTP_ENABLED")
    if not v:
        return True
    return v.lower() not in ("0", "false", "no", "off")


def smtp_username() -> str:
    return _strip("SMTP_USERNAME") or _strip("SMTP_USER")


def smtp_host() -> str:
    return _strip("SMTP_HOST")


def smtp_from_email() -> str:
    return _strip("SMTP_FROM_EMAIL") or _strip("SMTP_FROM")


def smtp_from_name() -> str:
    return _strip("SMTP_FROM_NAME")


def _smtp_password() -> str:
    return _strip("SMTP_PASSWORD")


def _port() -> int:
    raw = _strip("SMTP_PORT", "587") or "587"
    try:
        return int(raw)
    except ValueError:
        return 587


def _use_tls() -> bool:
    return _truthy("SMTP_USE_TLS", default_if_unset=True)


def _use_ssl() -> bool:
    return _truthy("SMTP_USE_SSL", default_if_unset=False) or _port() == 465


def _timeout_s() -> int:
    try:
        return int(_strip("SMTP_TIMEOUT", "30") or "30")
    except ValueError:
        return 30


def format_from_header() -> str:
    """From 헤더: SMTP_FROM_NAME <SMTP_FROM_EMAIL> 또는 이메일만."""
    addr = smtp_from_email()
    name = smtp_from_name()
    if name and addr:
        return formataddr((name, addr))
    return addr


def validate_smtp_config_for_send() -> None:
    missing: list[str] = []
    if not smtp_host():
        missing.append("SMTP_HOST")
    if not smtp_username():
        missing.append("SMTP_USERNAME")
    if not _smtp_password():
        missing.append("SMTP_PASSWORD")
    if not smtp_from_email():
        missing.append("SMTP_FROM_EMAIL")
    if missing:
        raise EmailConfigurationError(
            "SMTP 발송에 필요한 환경 변수가 없습니다: " + ", ".join(missing)
        )


def _local_hostname() -> str | None:
    lh = _strip("SMTP_LOCAL_HOSTNAME")
    return lh or None


def _build_message(
    to: str, subject: str, html_part: str | None, text_part: str | None
) -> MIMEMultipart | MIMEText:
    subject_hdr = Header(subject, "utf-8")
    from_hdr = format_from_header()
    if html_part and text_part:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject_hdr
        msg["From"] = from_hdr
        msg["To"] = to
        msg.attach(MIMEText(text_part, "plain", "utf-8"))
        msg.attach(MIMEText(html_part, "html", "utf-8"))
        return msg
    if html_part:
        msg = MIMEText(html_part, "html", "utf-8")
        msg["Subject"] = subject_hdr
        msg["From"] = from_hdr
        msg["To"] = to
        return msg
    msg = MIMEText(text_part or "", "plain", "utf-8")
    msg["Subject"] = subject_hdr
    msg["From"] = from_hdr
    msg["To"] = to
    return msg


def _send_smtp(message: MIMEMultipart | MIMEText, to: str) -> None:
    host = smtp_host()
    port = _port()
    timeout = _timeout_s()
    user = smtp_username()
    password = _smtp_password()
    envelope_from = smtp_from_email()
    kwargs: dict = {"timeout": timeout}
    lh = _local_hostname()
    if lh:
        kwargs["local_hostname"] = lh
    payload = message.as_string()
    if _use_ssl():
        with smtplib.SMTP_SSL(host, port, **kwargs) as server:
            server.login(user, password)
            server.sendmail(envelope_from, [to], payload)
        return
    with smtplib.SMTP(host, port, **kwargs) as server:
        if _use_tls():
            server.starttls()
        server.login(user, password)
        server.sendmail(envelope_from, [to], payload)


def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
) -> None:
    """HTML(필수 인자) 및 선택적 plaintext로 메일을 보냅니다.

    html_body와 text_body가 모두 비어 있으면 ValueError.
    SMTP_ENABLED=false 이면 네트워크 호출 없이 dry-run 로그만 남깁니다.
    """
    html_part = (html_body or "").strip() or None
    text_part = (text_body or "").strip() if text_body is not None else None
    if text_part == "":
        text_part = None
    if not html_part and not text_part:
        raise ValueError("html_body와 text_body 중 하나 이상에 내용이 필요합니다.")

    if not smtp_enabled():
        prov = _strip("SMTP_PROVIDER")
        logger.info(
            "SMTP dry-run (SMTP_ENABLED=false): to=%s subject=%s provider=%s html_len=%s text_len=%s",
            to,
            subject,
            prov or "(unset)",
            len(html_part or ""),
            len(text_part or ""),
        )
        return

    validate_smtp_config_for_send()
    msg = _build_message(to, subject, html_part, text_part)
    try:
        _send_smtp(msg, to)
    except smtplib.SMTPAuthenticationError as e:
        raise EmailSendError(
            "SMTP 인증에 실패했습니다. SMTP_USERNAME·SMTP_PASSWORD(SES SMTP 자격 증명)를 확인하세요."
        ) from e
    except smtplib.SMTPException as e:
        raise EmailSendError(f"SMTP 서버 오류: {e}") from e
    except OSError as e:
        raise EmailSendError(
            f"SMTP 연결 실패(방화벽·포트·호스트): {e}. "
            "회사망이면 587 차단 여부를 확인하거나 SMTP_LOCAL_HOSTNAME=localhost 를 검토하세요."
        ) from e

    logger.info("SMTP send ok to=%s subject=%s", to, subject)


def send_password_reset_email(to: str, reset_url: str) -> None:
    """비밀번호 재설정 링크 메일."""
    subject = "[AICONV Lab] 비밀번호 재설정"
    safe_url = html_module.escape(reset_url, quote=True)
    html_body = (
        f"<p>AICONV Lab 계정 비밀번호를 재설정하려면 아래 링크를 클릭하세요.</p>"
        f'<p><a href="{safe_url}">비밀번호 재설정</a></p>'
        f"<p>링크가 동작하지 않으면 URL을 브라우저에 붙여 넣으세요.</p>"
        f"<p style=\"word-break:break-all;\">{safe_url}</p>"
    )
    text_body = (
        "AICONV Lab 계정 비밀번호를 재설정하려면 다음 URL을 방문하세요.\n\n"
        f"{reset_url}\n"
    )
    send_email(to, subject, html_body, text_body)


def send_experiment_completed_email(
    to: str,
    experiment_name: str,
    result_url: str | None = None,
) -> None:
    """실험 완료 알림 메일."""
    subject = f"[AICONV Lab] 실험 완료: {experiment_name}"
    name_esc = html_module.escape(experiment_name, quote=True)
    if result_url:
        ru = html_module.escape(result_url, quote=True)
        html_body = (
            f"<p>실험 <strong>{name_esc}</strong>이(가) 완료되었습니다.</p>"
            f'<p><a href="{ru}">결과 보기</a></p>'
            f"<p style=\"word-break:break-all;\">{ru}</p>"
        )
        text_body = (
            f"실험 '{experiment_name}'이(가) 완료되었습니다.\n\n결과: {result_url}\n"
        )
    else:
        html_body = f"<p>실험 <strong>{name_esc}</strong>이(가) 완료되었습니다.</p>"
        text_body = f"실험 '{experiment_name}'이(가) 완료되었습니다.\n"
    send_email(to, subject, html_body, text_body)
