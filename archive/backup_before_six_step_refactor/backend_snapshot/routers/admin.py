"""마스터 관리자: 승인, 정지, 이력 조회."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from activity_service import log_activity
from database import get_db
from dependencies import get_current_master
from email_service import send_approval_notice_email
from models import ActivityLog, Announcement, User
from user_workspace import ALL_ACCESS_ROLES
from schemas_auth import ActivityLogOut, Message, UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str = ""


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = None


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_master),
) -> list[User]:
    return db.query(User).order_by(User.created_at.desc()).all()


@router.post("/users/{user_id}/approve", response_model=Message)
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    master: User = Depends(get_current_master),
) -> Message:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role in ALL_ACCESS_ROLES:
        raise HTTPException(status_code=400, detail="관리(Lead) 계정은 승인할 수 없습니다.")

    user.is_admin_approved = True
    db.commit()
    log_activity(db, master.id, "admin_approve", {"target_user_id": user_id}, None)
    try:
        send_approval_notice_email(user.email, user.full_name)
    except Exception:
        pass
    return Message(message="사용자 가입이 승인되었습니다.")


@router.post("/users/{user_id}/suspend", response_model=Message)
def suspend_user(
    user_id: int,
    db: Session = Depends(get_db),
    master: User = Depends(get_current_master),
) -> Message:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role in ALL_ACCESS_ROLES:
        raise HTTPException(status_code=400, detail="관리(Lead) 계정은 정지할 수 없습니다.")

    user.is_active = False
    db.commit()
    log_activity(db, master.id, "admin_suspend", {"target_user_id": user_id}, None)
    return Message(message="해당 사용자의 플랫폼 사용이 정지되었습니다.")


@router.post("/users/{user_id}/activate", response_model=Message)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    master: User = Depends(get_current_master),
) -> Message:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if user.role in ALL_ACCESS_ROLES:
        raise HTTPException(status_code=400, detail="관리(Lead) 계정은 이 방식으로 변경할 필요가 없습니다.")

    user.is_active = True
    db.commit()
    log_activity(db, master.id, "admin_activate", {"target_user_id": user_id}, None)
    return Message(message="해당 사용자의 플랫폼 사용이 정지 해제되었습니다.")


@router.get("/activities", response_model=list[ActivityLogOut])
def list_activities(
    user_id: int | None = Query(None, description="특정 사용자만 필터"),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_master),
) -> list[ActivityLog]:
    q = db.query(ActivityLog)
    if user_id is not None:
        q = q.filter(ActivityLog.user_id == user_id)
    return q.order_by(ActivityLog.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/announcements", response_model=list[AnnouncementOut])
def list_announcements(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_master),
) -> list[Announcement]:
    return db.query(Announcement).order_by(Announcement.created_at.desc()).all()


@router.post("/announcements", response_model=AnnouncementOut)
def create_announcement(
    body: AnnouncementCreate,
    db: Session = Depends(get_db),
    master: User = Depends(get_current_master),
) -> Announcement:
    row = Announcement(title=body.title.strip(), content=body.content or "", created_by=master.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    log_activity(db, master.id, "announcement_create", {"announcement_id": row.id}, None)
    return row


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(
    announcement_id: int,
    body: AnnouncementUpdate,
    db: Session = Depends(get_db),
    master: User = Depends(get_current_master),
) -> Announcement:
    row = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="공지를 찾을 수 없습니다.")
    if body.title is not None:
        row.title = body.title.strip()
    if body.content is not None:
        row.content = body.content
    db.commit()
    db.refresh(row)
    log_activity(db, master.id, "announcement_update", {"announcement_id": row.id}, None)
    return row


@router.delete("/announcements/{announcement_id}", response_model=Message)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    master: User = Depends(get_current_master),
) -> Message:
    row = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="공지를 찾을 수 없습니다.")
    db.delete(row)
    db.commit()
    log_activity(db, master.id, "announcement_delete", {"announcement_id": announcement_id}, None)
    return Message(message="삭제되었습니다.")
