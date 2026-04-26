"""회원가입, 로그인, 이메일 인증."""
from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from activity_service import log_activity
from auth_utils import create_access_token, hash_password, verify_password
from database import get_db
from dependencies import get_current_active_user, get_current_user
from email_service import send_verification_email
from models import User
from user_workspace import ALL_ACCESS_ROLES
from schemas_auth import (
    Message,
    TokenResponse,
    UserChangePassword,
    UserLogin,
    UserOut,
    UserRegister,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

EMAIL_VERIFY_HOURS = int(os.getenv("EMAIL_VERIFY_HOURS", "48"))


@router.post("/register", response_model=Message)
def register(req: UserRegister, request: Request, db: Session = Depends(get_db)) -> Message:
    email = req.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다.")

    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=EMAIL_VERIFY_HOURS)

    user = User(
        email=email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        role="member",
        is_active=True,
        is_email_verified=False,
        is_admin_approved=False,
        email_verification_token=token,
        email_verification_expires=expires,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    try:
        channel = send_verification_email(email, token, req.full_name)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"인증 메일 발송에 실패했습니다. 관리자에게 문의하세요. ({e})",
        ) from e

    log_activity(db, user.id, "register", {"email": email}, request)
    base = (
        "가입 요청이 접수되었습니다. 이메일로 발송된 링크로 인증을 완료한 뒤, 관리자 승인을 기다려 주세요."
    )
    if channel == "console":
        base += (
            " [안내] 현재 설정으로는 실제 메일이 전송되지 않았습니다. "
            "백엔드 터미널 로그에 인증 링크가 출력되었는지 확인하거나, "
            "backend/.env 에 SMTP_HOST·SMTP_USER·SMTP_PASSWORD·SMTP_FROM 을 설정한 뒤 서버를 다시 시작하세요. "
            "연결 확인: backend 폴더에서 `python test_smtp.py`"
        )
    return Message(message=base)


@router.get("/verify-email", response_model=Message)
def verify_email(token: str, db: Session = Depends(get_db)) -> Message:
    user = db.query(User).filter(User.email_verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="유효하지 않은 인증 링크입니다.")

    if user.email_verification_expires and user.email_verification_expires < datetime.now(
        timezone.utc
    ):
        raise HTTPException(status_code=400, detail="인증 링크가 만료되었습니다. 다시 가입을 요청해 주세요.")

    user.is_email_verified = True
    user.email_verification_token = None
    user.email_verification_expires = None
    db.commit()
    log_activity(db, user.id, "email_verified", {"email": user.email}, None)
    return Message(
        message="이메일 인증이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다."
    )


@router.post("/login", response_model=TokenResponse)
def login(req: UserLogin, request: Request, db: Session = Depends(get_db)) -> TokenResponse:
    """JSON { email, password }. 오류 유형별 HTTP: 401/403/503/500."""
    email = req.email.lower().strip()
    try:
        try:
            user = db.query(User).filter(User.email == email).first()
        except OperationalError:
            logger.exception(
                "login: DB 연결/운영 오류 — users 조회 단계 (email=%s)",
                email,
            )
            raise HTTPException(
                status_code=503,
                detail="데이터베이스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
            ) from None
        except SQLAlchemyError:
            logger.exception(
                "login: DB 예외 — users 조회 단계 (email=%s)",
                email,
            )
            raise HTTPException(
                status_code=500,
                detail="서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
            ) from None

        if not user:
            raise HTTPException(
                status_code=401,
                detail="이메일 또는 비밀번호가 올바르지 않습니다.",
            )

        try:
            password_ok = verify_password(req.password, user.hashed_password)
        except Exception:
            logger.exception(
                "login: verify_password 실패 — bcrypt/passlib·해시 형식 등 (email=%s)",
                email,
            )
            raise HTTPException(
                status_code=500,
                detail="서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
            ) from None

        if not password_ok:
            raise HTTPException(
                status_code=401,
                detail="이메일 또는 비밀번호가 올바르지 않습니다.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=403,
                detail="플랫폼 사용이 정지된 계정입니다. 관리자에게 문의하세요.",
            )

        if user.role not in ALL_ACCESS_ROLES:
            if not user.is_email_verified:
                raise HTTPException(
                    status_code=403,
                    detail="이메일 인증을 완료해 주세요.",
                )
            if not user.is_admin_approved:
                raise HTTPException(
                    status_code=403,
                    detail="관리자 승인 대기 중입니다.",
                )

        try:
            token = create_access_token({"sub": str(user.id)})
        except Exception:
            logger.exception("login: JWT 발급 실패 (email=%s)", email)
            raise HTTPException(
                status_code=500,
                detail="서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
            ) from None

        log_activity(db, user.id, "login", {"email": user.email}, request)
        return TokenResponse(access_token=token)

    except HTTPException as exc:
        d = exc.detail
        detail_str = (
            json.dumps(d, ensure_ascii=False)
            if isinstance(d, (list, dict))
            else str(d)
        )
        logger.warning(
            "login_failure email=%s status_code=%s error_type=%s detail=%s",
            email,
            exc.status_code,
            exc.status_code,
            detail_str,
        )
        raise
    except Exception:
        logger.exception("login: 처리되지 않은 예외 (email=%s)", email)
        logger.warning(
            "login_failure email=%s status_code=%s error_type=%s detail=%s",
            email,
            500,
            500,
            "unhandled_exception",
        )
        raise HTTPException(
            status_code=500,
            detail="서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        ) from None


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)) -> UserOut:
    return current


@router.post("/change-password", response_model=Message)
def change_password(
    req: UserChangePassword,
    request: Request,
    current: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Message:
    """로그인한 계정의 비밀번호를 변경합니다. 현재 비밀번호 확인 후 갱신."""
    if req.new_password == req.current_password:
        raise HTTPException(
            status_code=400,
            detail="새 비밀번호는 기존 비밀번호와 달라야 합니다.",
        )
    try:
        if not verify_password(req.current_password, current.hashed_password):
            raise HTTPException(
                status_code=401,
                detail="현재 비밀번호가 올바르지 않습니다.",
            )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "change_password: verify_password 실패 (user_id=%s)",
            current.id,
        )
        raise HTTPException(
            status_code=500,
            detail="서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        ) from None

    current.hashed_password = hash_password(req.new_password)
    db.commit()
    log_activity(db, current.id, "password_changed", {"email": current.email}, request)
    return Message(message="비밀번호가 변경되었습니다.")
