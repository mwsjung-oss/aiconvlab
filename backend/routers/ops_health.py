"""확장 운영 헬스 (storage / queue / llm / lab worker). 기본 /api/health 은 main.py."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from config.aws_env_validation import is_production_like
from database import get_db

from health_storage_probe import probe_storage_health
from models_aps import LabWorkerHeartbeat
from aps_ops.llm.llm_status import summarize_llm_config
from aps_ops.queue.sqs_queue import _queue_url_aws, _queue_url_lab, peek_queue_health

router = APIRouter(tags=["health"])


@router.get("/api/health/storage")
def health_storage_route() -> JSONResponse:
    code, payload = probe_storage_health()
    return JSONResponse(status_code=code, content=payload)


@router.get("/api/health/queue")
def health_queue() -> JSONResponse:
    aws_q = peek_queue_health(_queue_url_aws(), env_hint="SQS_AWS_JOBS_URL")
    lab_q = peek_queue_health(_queue_url_lab(), env_hint="SQS_LAB_GPU_JOBS_URL")
    body: dict = {
        "status": "ok",
        "aws_jobs_queue": aws_q,
        "lab_gpu_jobs_queue": lab_q,
    }
    aws_ok = bool(aws_q.get("ok"))
    lab_ok = bool(lab_q.get("ok"))
    if is_production_like():
        if not aws_ok or not lab_ok:
            body["status"] = "error"
            body["message_ko"] = (
                "프로덕션에서 SQS 큐 하나 이상이 비어 있거나 IAM/URL 오류입니다. "
                "SQS_AWS_JOBS_URL·SQS_LAB_GPU_JOBS_URL·sqs:GetQueueAttributes 권한을 확인하세요."
            )
            return JSONResponse(status_code=503, content=body)
        return JSONResponse(content=body)
    # 로컬/스테이징: 허술해도 200
    if not aws_ok or not lab_ok:
        body["status"] = "degraded"
    return JSONResponse(content=body)


@router.get("/api/health/llm")
def health_llm() -> dict:
    return summarize_llm_config()


@router.get("/api/health/lab-worker-status")
def health_lab_worker(db: Session = Depends(get_db)) -> dict:
    row = db.query(LabWorkerHeartbeat).order_by(LabWorkerHeartbeat.last_seen_at.desc()).first()
    stale_after = float(os.getenv("LAB_WORKER_STALE_SECONDS") or "120")
    if not row:
        return {"status": "ok", "worker": "unknown", "detail": "no_heartbeat_record"}
    last = row.last_seen_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - last).total_seconds()
    if age > stale_after:
        return {
            "status": "ok",
            "availability": "unavailable",
            "worker_id": row.worker_id,
            "last_seen_age_sec": round(age, 1),
        }
    return {
        "status": "ok",
        "availability": "available",
        "worker_id": row.worker_id,
        "gpu_name": row.gpu_name,
        "heartbeat_status": row.status,
        "last_seen_age_sec": round(age, 1),
    }
