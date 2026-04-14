"""
지정한 이메일 사용자의 비밀번호를 DB에서 직접 갱신합니다.

백엔드가 사용하는 SQLite/DB와 동일한 머신에서 실행해야 합니다.
(로컬 개발: backend 폴더에서 실행. 연구실 서버: SSH로 접속해 해당 경로에서 실행.)

  python reset_user_password.py user@example.com "새비밀번호"
  python reset_user_password.py user@example.com "새비밀번호" --member-ready

--member-ready: member 계정이 로그인 단계에서 막히지 않도록 이메일 인증·관리자 승인 플래그를 True로 맞춥니다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(_BACKEND_ROOT / ".env")

from auth_utils import hash_password  # noqa: E402
from database import SessionLocal  # noqa: E402
from models import User  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="사용자 비밀번호 재설정")
    p.add_argument("email", help="사용자 이메일")
    p.add_argument("password", help="새 비밀번호")
    p.add_argument(
        "--member-ready",
        action="store_true",
        help="is_email_verified·is_admin_approved 를 True로 설정(member 전용)",
    )
    args = p.parse_args()

    email = args.email.strip().lower()
    if not email:
        print("이메일이 비어 있습니다.", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"DB에 해당 이메일이 없습니다: {email}", file=sys.stderr)
            return 2

        user.hashed_password = hash_password(args.password)
        if args.member_ready:
            user.is_email_verified = True
            user.is_admin_approved = True

        db.commit()
        print(f"비밀번호를 갱신했습니다: {email}")
        if args.member_ready:
            print("  (member-ready: 이메일 인증·관리자 승인 True)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
