"""Jupyter Lab 세션 API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from activity_service import log_activity
from database import get_db
from dependencies import get_current_approved_member
from models import User
from notebook_service import (
    get_or_start_session,
    is_notebook_feature_enabled,
    jupyter_runtime_available,
    shutdown_session_for_user,
)

router = APIRouter(prefix="/api/notebook", tags=["notebook"])


@router.get("/status")
def notebook_status() -> dict:
    """프론트에서 기능 노출 여부·의존성 안내용."""
    enabled = is_notebook_feature_enabled()
    return {
        "feature_enabled": enabled,
        "jupyter_installed": jupyter_runtime_available(),
    }


@router.get("/session")
def notebook_session(
    request: Request,
    user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict:
    out = get_or_start_session(user)
    if out.get("ok"):
        log_activity(
            db,
            user.id,
            "notebook_session",
            {"port": out.get("port"), "root": out.get("root")},
            request,
        )
    return out


@router.post("/shutdown")
def notebook_shutdown_my(
    request: Request,
    user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict:
    """현재 사용자 Jupyter 프로세스 종료 (선택)."""
    stopped = shutdown_session_for_user(user.id)
    if stopped:
        log_activity(db, user.id, "notebook_shutdown", None, request)
    return {"ok": True, "stopped": stopped}
