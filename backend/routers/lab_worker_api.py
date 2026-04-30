"""연구실 GPU Worker 의 heartbeat(AP API).

`/api/internal/lab-worker/heartbeat` — 레거시.

`/api/lab-workers/heartbeat` — 새 경로.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models_aps import LabWorkerHeartbeat

router = APIRouter(prefix="/api/internal", tags=["lab-worker"])
public_router = APIRouter(prefix="/api/lab-workers", tags=["lab-workers"])


class HeartbeatPayload(BaseModel):
    worker_id: str
    hostname: str | None = None
    gpu_name: str | None = None
    status: str = "idle"
    metadata_json: dict | None = None


def _verify_token(token: str | None) -> None:
    secret = (os.getenv("LAB_WORKER_SHARED_SECRET") or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="연구실 Worker API가 비활성화되어 있습니다. LAB_WORKER_SHARED_SECRET 미설정(EB Secrets 확인).",
        )
    if (token or "").strip() != secret:
        raise HTTPException(status_code=401, detail="invalid_lab_worker_secret")


def _heartbeat_inner(body: HeartbeatPayload, db: Session) -> dict:
    existing = db.query(LabWorkerHeartbeat).filter(LabWorkerHeartbeat.worker_id == body.worker_id).first()
    now = datetime.now(timezone.utc)
    naive = now.replace(tzinfo=None)
    if existing:
        existing.hostname = body.hostname
        existing.gpu_name = body.gpu_name
        existing.status = body.status
        existing.last_seen_at = naive
        existing.metadata_json = body.metadata_json
    else:
        db.add(
            LabWorkerHeartbeat(
                worker_id=body.worker_id,
                hostname=body.hostname,
                gpu_name=body.gpu_name,
                status=body.status,
                last_seen_at=naive,
                metadata_json=body.metadata_json,
            ),
        )
    db.commit()
    return {"status": "ok", "accepted_at": now.isoformat()}


def _heartbeat_common(
    body: HeartbeatPayload,
    db: Session,
    x_lab_worker_token: str | None,
) -> dict:
    _verify_token(x_lab_worker_token)
    return _heartbeat_inner(body, db)


@router.post("/lab-worker/heartbeat")
def post_heartbeat_legacy(
    body: HeartbeatPayload,
    db: Session = Depends(get_db),
    x_lab_worker_token: str | None = Header(default=None, alias="X-Lab-Worker-Token"),
) -> dict:
    return _heartbeat_common(body, db, x_lab_worker_token)


@public_router.post("/heartbeat")
def post_heartbeat_public(
    body: HeartbeatPayload,
    db: Session = Depends(get_db),
    x_lab_worker_token: str | None = Header(default=None, alias="X-Lab-Worker-Token"),
) -> dict:
    return _heartbeat_common(body, db, x_lab_worker_token)
