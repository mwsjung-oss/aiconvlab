"""APS 작업(Job) 생성·큐 적재·Worker 상태 갱신."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_approved_member, verify_lab_worker_token
from models import Experiment, User
from models_aps import ExecutionJob, JobEvent

from aps_ops.queue import sqs_queue

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class ExperimentJobCreate(BaseModel):
    experiment_id: int
    job_type: str = "train"
    execution_target: Literal["aws", "lab_gpu", "auto"] = "aws"
    job_name: str | None = None


@router.post("/experiment")
def create_experiment_job(
    body: ExperimentJobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_approved_member),
) -> dict[str, Any]:
    exp = db.query(Experiment).filter(Experiment.id == body.experiment_id).first()
    if not exp or exp.user_id != user.id:
        raise HTTPException(status_code=404, detail="experiment not found")

    resolved, blocked_msg = sqs_queue.resolve_targets(db, body.execution_target)
    fallback = bool(
        blocked_msg and body.execution_target != "aws" and resolved == "aws",
    )
    initial_status = "FALLBACK_TO_AWS" if fallback else "QUEUED"

    j = ExecutionJob(
        user_id=user.id,
        experiment_id=body.experiment_id,
        job_type=body.job_type,
        execution_target=body.execution_target,
        resolved_target=resolved,
        status=initial_status,
        input_s3_uri=None,
        output_s3_uri=None,
        error_message=None,
        model_config_json=json.dumps({"job_name": body.job_name}),
    )
    db.add(j)
    db.commit()
    db.refresh(j)

    if blocked_msg:
        db.add(
            JobEvent(
                job_id=j.id,
                event_type="FALLBACK_TO_AWS" if fallback else "routing_notice",
                message=blocked_msg,
                metadata_json={"requested": body.execution_target, "resolved": resolved},
            ),
        )
        db.commit()

    try:
        sqs_queue.enqueue_job(db, j, {})
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    db.refresh(j)
    return {
        "job_id": j.id,
        "status": j.status,
        "resolved_target": j.resolved_target,
        "user_message": blocked_msg or "",
        "experiment_id": body.experiment_id,
    }


class WorkerJobStatusPayload(BaseModel):
    status: Literal["RUNNING", "COMPLETED", "FAILED"]
    output_s3_uri: str | None = None
    error_message: str | None = None
    result_summary: dict[str, Any] | None = None


@router.post("/{job_id}/status")
def post_job_status_worker(
    job_id: int,
    body: WorkerJobStatusPayload,
    db: Session = Depends(get_db),
    _: None = Depends(verify_lab_worker_token),
) -> dict[str, Any]:
    """Lab Worker 전용 — X-Lab-Worker-Token 필요."""

    j = db.query(ExecutionJob).filter(ExecutionJob.id == job_id).first()
    if not j:
        raise HTTPException(status_code=404, detail="job not found")

    now = datetime.utcnow()
    j.status = body.status
    if body.output_s3_uri is not None:
        j.output_s3_uri = body.output_s3_uri
    if body.error_message is not None:
        j.error_message = body.error_message
    if body.status == "RUNNING" and j.started_at is None:
        j.started_at = now
    if body.status in ("COMPLETED", "FAILED"):
        j.completed_at = now
    msg = body.error_message if body.status == "FAILED" else json.dumps(body.result_summary or {})[:2000]
    db.add(
        JobEvent(
            job_id=j.id,
            event_type=f"worker_{body.status.lower()}",
            message=msg,
            metadata_json={
                "output_s3_uri": body.output_s3_uri,
                "result_summary_keys": list((body.result_summary or {}).keys()),
            },
        ),
    )
    db.commit()
    db.refresh(j)
    return {"job_id": j.id, "status": j.status}


@router.get("/{job_id}")
def get_job_detail(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_approved_member),
) -> dict[str, Any]:
    j = (
        db.query(ExecutionJob)
        .filter(ExecutionJob.id == job_id, ExecutionJob.user_id == user.id)
        .first()
    )
    if not j:
        raise HTTPException(status_code=404, detail="job not found")
    evs = (
        db.query(JobEvent)
        .filter(JobEvent.job_id == j.id)
        .order_by(JobEvent.created_at.asc())
        .all()
    )
    mc: Any = {}
    try:
        mc = json.loads(j.model_config_json or "{}")
    except json.JSONDecodeError:
        mc = {}

    return {
        "job_id": j.id,
        "status": j.status,
        "resolved_target": j.resolved_target,
        "execution_target": j.execution_target,
        "experiment_id": j.experiment_id,
        "error_message": j.error_message,
        "input_s3_uri": j.input_s3_uri,
        "output_s3_uri": j.output_s3_uri,
        "model_config": mc,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "updated_at": j.updated_at.isoformat() if j.updated_at else None,
        "started_at": j.started_at.isoformat() if j.started_at else None,
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        "events": [
            {
                "event_type": e.event_type,
                "message": e.message,
                "metadata_json": e.metadata_json,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in evs
        ],
        "ui_status_hint": _ui_status_hint(j),
    }


def _ui_status_hint(j: ExecutionJob) -> str:
    st = (j.status or "").upper()
    rt = (j.resolved_target or "").lower()
    et = (j.execution_target or "").lower()

    if st == "COMPLETED":
        return "completed"
    if st == "FAILED":
        return "failed"
    if st == "FALLBACK_TO_AWS" or (
        et in ("lab_gpu", "auto") and rt == "aws" and st in ("QUEUED", "CREATED")
    ):
        return "fallback_to_aws"
    if st in ("QUEUED", "CREATED") and rt == "lab_gpu":
        return "lab_gpu_pending"
    if st == "RUNNING" and rt == "lab_gpu":
        return "lab_gpu_running"
    if st == "RUNNING" and rt == "aws":
        return "aws_running_sync"
    return "unknown"
