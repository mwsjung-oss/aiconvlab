"""FastAPI 의존성: 현재 사용자, DB."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth_utils import decode_token
from database import get_db
from models import User
from user_workspace import ALL_ACCESS_ROLES

security = HTTPBearer(auto_error=False)


def get_user_from_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다.",
        )
    return user_id


def get_current_user(
    user_id: int = Depends(get_user_from_token),
    db: Session = Depends(get_db),
) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다.")
    return user


def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="플랫폼 사용이 정지된 계정입니다. 관리자에게 문의하세요.",
        )
    return user


def get_current_approved_member(user: User = Depends(get_current_active_user)) -> User:
    """ML API 등: 이메일 인증 + 관리자 승인이 된 회원 또는 마스터·Director·Technical Lead."""
    if user.role in ALL_ACCESS_ROLES:
        return user
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이메일 인증을 완료해 주세요.",
        )
    if not user.is_admin_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 승인 대기 중입니다.",
        )
    return user


def get_current_master(user: User = Depends(get_current_active_user)) -> User:
    """마스터·Director·Technical Lead (관리 API·전체 데이터 접근 역할)."""
    if user.role not in ALL_ACCESS_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="마스터·Director·Technical Lead만 접근할 수 있습니다.",
        )
    return user


panel_security = HTTPBearer(auto_error=True)


def require_admin_panel_token(
    credentials: HTTPAuthorizationCredentials = Depends(panel_security),
) -> None:
    """Professor 옆 관리자 패널용 JWT (typ=admin_panel)."""
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("typ") != "admin_panel":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="관리자 패널 인증이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
