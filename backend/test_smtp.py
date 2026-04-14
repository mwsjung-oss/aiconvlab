"""
SMTP 설정 점검용. backend 폴더에서 실행:
  python test_smtp.py
  python test_smtp.py --send you@example.com   # 테스트 메일 1통 발송(선택)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent
load_dotenv(_ROOT / ".env")


def main() -> int:
    import os

    from email.header import Header
    from email.mime.text import MIMEText
    import smtplib

    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    pwd = (os.getenv("SMTP_PASSWORD") or "").strip()
    from_addr = (os.getenv("SMTP_FROM") or user or "").strip()
    port = int(os.getenv("SMTP_PORT", "587") or "587")
    use_ssl = os.getenv("SMTP_USE_SSL", "").lower() in ("1", "true", "yes") or port == 465
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
    lh = (os.getenv("SMTP_LOCAL_HOSTNAME") or "").strip() or None
    mode = (os.getenv("EMAIL_MODE") or "auto").lower()

    print("EMAIL_MODE =", mode)
    print("SMTP_HOST =", repr(host))
    print("SMTP_PORT =", port)
    print("SMTP_USER =", repr(user))
    print("SMTP_PASSWORD =", "(비어 있음)" if not pwd else f"(길이 {len(pwd)}자, 내용은 출력 안 함)")
    print("SMTP_FROM =", repr(from_addr))
    print("SMTP_USE_SSL =", use_ssl, "| SMTP_USE_TLS =", use_tls)
    print("SMTP_LOCAL_HOSTNAME =", repr(lh))
    print()

    missing = []
    if not host:
        missing.append("SMTP_HOST")
    if not user:
        missing.append("SMTP_USER")
    if not pwd:
        missing.append("SMTP_PASSWORD")
    if not from_addr:
        missing.append("SMTP_FROM 또는 SMTP_USER")
    if missing:
        print("오류: 다음 항목이 비어 있어 SMTP로 보낼 수 없습니다:", ", ".join(missing))
        print(".env 에서 해당 줄의 주석(#)을 제거하고 값을 채운 뒤 다시 실행하세요.")
        return 1

    kwargs = {"timeout": int(os.getenv("SMTP_TIMEOUT", "30"))}
    if lh:
        kwargs["local_hostname"] = lh

    print("서버 연결·로그인 시도 중...")
    server = None
    try:
        if use_ssl:
            server = smtplib.SMTP_SSL(host, port, **kwargs)
        else:
            server = smtplib.SMTP(host, port, **kwargs)
            if use_tls:
                server.starttls()
        server.login(user, pwd)
        print("로그인 성공.")
    except Exception as e:
        print("실패:", type(e).__name__, "-", e)
        return 2
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--send", metavar="EMAIL", help="이 주소로 테스트 메일 1통 발송")
    args = ap.parse_args()

    if args.send:
        subj = "[AILab] SMTP 테스트"
        body = "이 메일이 보이면 SMTP 설정이 정상입니다."
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = Header(subj, "utf-8")
        msg["From"] = from_addr
        msg["To"] = args.send
        try:
            if use_ssl:
                s2 = smtplib.SMTP_SSL(host, port, **kwargs)
            else:
                s2 = smtplib.SMTP(host, port, **kwargs)
                if use_tls:
                    s2.starttls()
            s2.login(user, pwd)
            s2.sendmail(from_addr, [args.send], msg.as_string())
            s2.quit()
            print("테스트 메일 발송 완료 →", args.send)
        except Exception as e:
            print("발송 실패:", e)
            return 3

    print("점검 완료.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
