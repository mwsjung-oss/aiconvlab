"""이메일 인증 링크 발송 (SMTP 또는 콘솔 출력)."""
from __future__ import annotations

import logging
import os
import smtplib
from email.header import Header
from email.mime.text import MIMEText
from typing import Literal

logger = logging.getLogger(__name__)

EmailChannel = Literal["smtp", "console"]


def _smtp_config() -> dict:
    port_raw = os.getenv("SMTP_PORT", "587") or "587"
    try:
        port = int(port_raw)
    except ValueError:
        port = 587
    use_ssl_env = os.getenv("SMTP_USE_SSL", "").lower() in ("1", "true", "yes")
    pwd = os.getenv("SMTP_PASSWORD", "")
    if isinstance(pwd, str):
        pwd = pwd.strip()
    local_host = os.getenv("SMTP_LOCAL_HOSTNAME", "").strip() or None
    return {
        "host": os.getenv("SMTP_HOST", "").strip(),
        "port": port,
        "user": os.getenv("SMTP_USER", "").strip(),
        "password": pwd,
        "from_addr": (os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or "").strip(),
        "timeout": int(os.getenv("SMTP_TIMEOUT", "30")),
        "use_ssl": use_ssl_env or port == 465,
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes"),
        "backend_url": os.getenv("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/"),
        "local_hostname": local_host,
    }


def _email_mode() -> str:
    return os.getenv("EMAIL_MODE", "auto").lower().strip()


def _smtp_ready(cfg: dict) -> bool:
    return bool(cfg["host"] and cfg["user"] and cfg["password"] and cfg["from_addr"])


def _log_why_console_if_auto(cfg: dict) -> None:
    mode = _email_mode()
    if mode != "auto":
        return
    missing = []
    if not cfg["host"]:
        missing.append("SMTP_HOST")
    if not cfg["user"]:
        missing.append("SMTP_USER")
    if not cfg["password"]:
        missing.append("SMTP_PASSWORD")
    if not cfg["from_addr"]:
        missing.append("SMTP_FROM 또는 SMTP_USER")
    if missing:
        logger.warning(
            "이메일이 실제로 발송되지 않습니다(auto 모드). .env에 다음을 설정하세요: %s",
            ", ".join(missing),
        )


def _send_via_smtp(to_email: str, subject: str, body: str, cfg: dict) -> None:
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = cfg["from_addr"]
    msg["To"] = to_email
    text = msg.as_string()

    host, port = cfg["host"], cfg["port"]
    timeout = cfg["timeout"]
    lh = cfg.get("local_hostname")

    kwargs = {"timeout": timeout}
    if lh:
        kwargs["local_hostname"] = lh

    if cfg["use_ssl"]:
        with smtplib.SMTP_SSL(host, port, **kwargs) as server:
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_addr"], [to_email], text)
    else:
        with smtplib.SMTP(host, port, **kwargs) as server:
            if cfg["use_tls"]:
                server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_addr"], [to_email], text)


def _should_send_smtp(cfg: dict) -> bool:
    mode = _email_mode()
    if mode == "console":
        return False
    if mode == "smtp":
        return True
    return _smtp_ready(cfg)


def send_verification_email(
    to_email: str, token: str, full_name: str | None = None
) -> EmailChannel:
    """회원가입 후 이메일 인증 링크를 보냅니다. 반환: smtp(실제 발송) 또는 console."""
    cfg = _smtp_config()
    link = f'{cfg["backend_url"]}/api/auth/verify-email?token={token}'
    subject = "[AI Experiment Platform] 이메일 인증"
    body = f"""안녕하세요{', ' + full_name if full_name else ''}.

아래 링크를 클릭하여 이메일 인증을 완료해 주세요.
인증 후 관리자 승인이 있으면 로그인할 수 있습니다.

{link}

이 링크는 일정 시간 후 만료될 수 있습니다.
"""

    if _should_send_smtp(cfg):
        if not _smtp_ready(cfg):
            raise ValueError(
                "EMAIL_MODE=smtp 인데 SMTP_HOST, SMTP_USER, SMTP_PASSWORD, "
                "SMTP_FROM(또는 SMTP_USER와 동일) 설정이 필요합니다."
            )
        try:
            _send_via_smtp(to_email, subject, body, cfg)
        except smtplib.SMTPAuthenticationError as e:
            raise ValueError(
                "SMTP 로그인 실패: 아이디·비밀번호(앱 비밀번호)와 SMTP_USER/SMTP_FROM 일치 여부를 확인하세요."
            ) from e
        except smtplib.SMTPException as e:
            raise ValueError(f"SMTP 오류: {e}") from e
        except OSError as e:
            raise ValueError(
                f"SMTP 연결 실패(방화벽/포트/호스트명): {e}. "
                "회사망이면 587·465 차단 여부를 확인하거나 SMTP_LOCAL_HOSTNAME=localhost 를 시도해 보세요."
            ) from e
        logger.info("Verification email sent to %s", to_email)
        return "smtp"

    _log_why_console_if_auto(cfg)
    logger.info("--- EMAIL (console mode) ---\nTo: %s\n%s\n%s", to_email, subject, body)
    return "console"


def send_approval_notice_email(to_email: str, full_name: str | None = None) -> None:
    """관리자 승인 완료 알림 (선택)."""
    cfg = _smtp_config()
    subject = "[AI Experiment Platform] 가입이 승인되었습니다"
    body = f"""안녕하세요{', ' + full_name if full_name else ''}.

관리자에 의해 가입이 승인되었습니다. 로그인하여 플랫폼을 이용하실 수 있습니다.
"""
    if _should_send_smtp(cfg):
        if not _smtp_ready(cfg):
            logger.warning("승인 알림 메일: SMTP 미설정으로 콘솔에만 출력합니다.")
            logger.info("--- APPROVAL EMAIL (console) ---\nTo: %s\n%s", to_email, body)
            return
        try:
            _send_via_smtp(to_email, subject, body, cfg)
        except Exception:
            logger.exception("승인 알림 SMTP 발송 실패, 콘솔로 대체합니다.")
            logger.info("--- APPROVAL EMAIL (console) ---\nTo: %s\n%s", to_email, body)
            return
        logger.info("Approval notice sent to %s", to_email)
    else:
        _log_why_console_if_auto(cfg)
        logger.info("--- APPROVAL EMAIL (console) ---\nTo: %s\n%s", to_email, body)
