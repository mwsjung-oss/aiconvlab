"""Elastic Beanstalk(동기) 학습 실행 — 연구실 Lab 서버 호출 금지.

현재: main._train_impl 동기 학습.

향후: AWS Batch / SageMaker 처리기를 여기서 조립 가능하도록 인터페이스 분리 유지."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from activity_service import log_activity


def train_sync_via_main_impl(
    request: Any,
    req: Any,
    ws: Any,
    current_user: Any,
    db: Session | None,
    *,
    blocked_msg: str | None,
    sync_io: Any,
    ensure_workspace_dirs: Any,
    train_impl: Any,
) -> dict[str, Any]:
    ensure_workspace_dirs(ws)
    meta = train_impl(req, ws, current_user=current_user, job_id=None)
    sync_io.snapshot_push_workspace(ws)
    if db is not None:
        log_activity(db, current_user.id, "train", {"model_id": meta.get("model_id")}, request)
    if blocked_msg:
        meta = {
            **meta,
            "execution_note": blocked_msg,
            "resolved_target": "aws",
            "ui_status_hint": "aws_fallback_auto",
        }
    return meta
