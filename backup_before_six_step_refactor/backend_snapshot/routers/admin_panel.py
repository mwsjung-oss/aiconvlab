"""Professor 옆 관리자 패널: 별도 비밀번호 + JWT (회원 승인·탈퇴)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from admin_panel_store import set_password_plain, verify_admin_plain
from auth_utils import create_admin_panel_token
from database import get_db
from dependencies import require_admin_panel_token
from email_service import send_approval_notice_email
from models import User
from user_workspace import ALL_ACCESS_ROLES
from schemas_auth import (
    AdminPanelChangePassword,
    AdminPanelLogin,
    Message,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/api/admin-panel", tags=["admin-panel"])


@router.post("/login", response_model=TokenResponse)
def panel_login(body: AdminPanelLogin) -> TokenResponse:
    plain = (body.password or "").strip()
    if not verify_admin_plain(plain):
        raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다.")
    return TokenResponse(access_token=create_admin_panel_token())


@router.post("/change-password", response_model=Message)
def panel_change_password(
    body: AdminPanelChangePassword,
    _: None = Depends(require_admin_panel_token),
) -> Message:
    if not verify_admin_plain(body.old_password):
        raise HTTPException(status_code=400, detail="기존 비밀번호가 올바르지 않습니다.")
    set_password_plain(body.new_password)
    return Message(message="관리자 패널 비밀번호가 변경되었습니다.")


@router.get("/users", response_model=list[UserOut])
def panel_list_users(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_panel_token),
) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).all()


@router.post("/users/{user_id}/approve", response_model=Message)
def panel_approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_panel_token),
) -> Message:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role in ALL_ACCESS_ROLES:
        raise HTTPException(status_code=400, detail="관리(Lead) 계정은 승인할 수 없습니다.")
    if not user.is_email_verified:
        raise HTTPException(
            status_code=400,
            detail="이메일 인증이 완료된 회원만 승인할 수 있습니다.",
        )
    if user.is_admin_approved:
        raise HTTPException(status_code=400, detail="이미 승인된 회원입니다.")

    user.is_admin_approved = True
    db.commit()
    try:
        send_approval_notice_email(user.email, user.full_name)
    except Exception:
        pass
    return Message(message="가입이 승인되었습니다.")


@router.delete("/users/{user_id}", response_model=Message)
def panel_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_panel_token),
) -> Message:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role in ALL_ACCESS_ROLES:
        raise HTTPException(status_code=400, detail="관리(Lead) 계정은 삭제할 수 없습니다.")

    db.delete(user)
    db.commit()
    return Message(message="회원이 탈퇴 처리되었습니다.")
