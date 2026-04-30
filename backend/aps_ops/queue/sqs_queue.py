"""SQS 큐 발행 및 실행 대상 라우팅.

enqueue_aws_job: resolved_target=aws 전용 (lab 큐 절대 미사용).
enqueue_lab_gpu_job: resolved_target=lab_gpu 전용 (AWS jobs 큐 미사용).

enqueue_job: 내부 통합 — resolved_target 으로 라우팅.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Literal

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy.orm import Session

from models_aps import ExecutionJob, JobEvent, LabWorkerHeartbeat

logger = logging.getLogger(__name__)

ExecTarget = Literal["aws", "lab_gpu", "auto"]
Resolved = Literal["aws", "lab_gpu"]


def _sqs():
    region = (os.getenv("AWS_REGION") or "ap-northeast-2").strip()
    return boto3.client("sqs", region_name=region)


def _queue_url_aws() -> str:
    return (os.getenv("SQS_AWS_JOBS_URL") or "").strip()


def _queue_url_lab() -> str:
    return (os.getenv("SQS_LAB_GPU_JOBS_URL") or "").strip()


def validate_queue_config() -> dict[str, Any]:
    aws = _queue_url_aws()
    lab = _queue_url_lab()
    return {
        "SQS_AWS_JOBS_URL_configured": bool(aws),
        "SQS_LAB_GPU_JOBS_URL_configured": bool(lab),
        "aws_url_prefix": aws[:48] + ("…" if len(aws) > 48 else ""),
        "lab_url_prefix": lab[:48] + ("…" if len(lab) > 48 else ""),
    }


def lab_worker_available(db: Session, stale_sec: int) -> bool:
    row = db.query(LabWorkerHeartbeat).order_by(LabWorkerHeartbeat.last_seen_at.desc()).first()
    if not row:
        return False
    ls = row.last_seen_at
    if ls.tzinfo is None:
        ls = ls.replace(tzinfo=timezone.utc)
    delta = (datetime.now(timezone.utc) - ls).total_seconds()
    if delta > stale_sec:
        return False
    return row.status in ("idle", "busy", "ready")


def resolve_targets(
    db: Session,
    execution_target: ExecTarget,
    *,
    stale_sec: int = 120,
) -> tuple[Resolved, str | None]:
    if execution_target == "aws":
        return "aws", None
    if execution_target == "lab_gpu":
        if lab_worker_available(db, stale_sec):
            return "lab_gpu", None
        return (
            "aws",
            "연구실 GPU 서버를 사용할 수 없어 AWS에서 실행합니다(정책: fallback).",
        )
    if lab_worker_available(db, stale_sec):
        return "lab_gpu", None
    return "aws", None


def build_job_message(job: ExecutionJob, model_config: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job.id,
        "experiment_id": job.experiment_id,
        "user_id": job.user_id,
        "job_type": job.job_type,
        "execution_target": job.execution_target,
        "resolved_target": job.resolved_target,
        "input_s3_uri": job.input_s3_uri,
        "output_s3_uri": job.output_s3_uri,
        "model_config": model_config,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }


# 별칭
build_message_body = build_job_message


def _send_to_queue(
    db: Session,
    job: ExecutionJob,
    queue_url: str,
    model_config: dict[str, Any],
    target_label: str,
) -> dict[str, Any]:
    if (os.getenv("APS_DISABLE_SQS_PUBLISH") or "").strip().lower() in ("1", "true", "yes"):
        db.add(
            JobEvent(
                job_id=job.id,
                event_type="sqs_publish_skipped",
                message="APS_DISABLE_SQS_PUBLISH",
                metadata_json=None,
            )
        )
        db.commit()
        return {"ok": True, "skipped": True}

    body = build_job_message(job, model_config)
    client = _sqs()

    dup = db.query(JobEvent).filter(
        JobEvent.job_id == job.id,
        JobEvent.event_type == "sqs_publish",
    ).first()
    if dup:
        logger.info("job %s already published, skipping duplicate", job.id)
        return {"ok": True, "deduplicated": True}

    if not queue_url:
        raise RuntimeError(f"{target_label} queue URL empty")

    body_str = json.dumps(body, default=str)
    send_kwargs: dict[str, Any] = {"QueueUrl": queue_url, "MessageBody": body_str}
    if ".fifo" in queue_url:
        send_kwargs["MessageGroupId"] = "aps-jobs"
        send_kwargs["MessageDeduplicationId"] = f"job-{job.id}"
    try:
        r = client.send_message(**send_kwargs)
    except (ClientError, BotoCoreError) as e:
        logger.exception("SQS send failed")
        raise RuntimeError(str(e)) from e

    ev = JobEvent(
        job_id=job.id,
        event_type="sqs_publish",
        message=f"queued to {target_label}",
        metadata_json={"sqs_message_id": r.get("MessageId"), "queue": queue_url[:64]},
    )
    db.add(ev)
    db.commit()
    return {"ok": True, "message_id": r.get("MessageId")}


def enqueue_aws_job(db: Session, job: ExecutionJob, model_config: dict[str, Any]) -> dict[str, Any]:
    if job.resolved_target != "aws":
        raise ValueError("enqueue_aws_job requires resolved_target=aws")
    return _send_to_queue(db, job, _queue_url_aws(), model_config, "aws_jobs")


def enqueue_lab_gpu_job(db: Session, job: ExecutionJob, model_config: dict[str, Any]) -> dict[str, Any]:
    if job.resolved_target != "lab_gpu":
        raise ValueError("enqueue_lab_gpu_job requires resolved_target=lab_gpu")
    return _send_to_queue(db, job, _queue_url_lab(), model_config, "lab_gpu_jobs")


def enqueue_job(
    db: Session,
    job: ExecutionJob,
    model_config: dict[str, Any],
    *,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    if job.resolved_target == "lab_gpu":
        return enqueue_lab_gpu_job(db, job, model_config)
    if job.resolved_target == "aws":
        return enqueue_aws_job(db, job, model_config)
    raise ValueError(f"invalid resolved_target={job.resolved_target!r}")


def fifo_queue(qurl: str) -> bool:
    return ".fifo" in qurl


def peek_queue_health(url: str, *, env_hint: str | None = None) -> dict[str, Any]:
    """env_hint: 빈 URL일 때 안내에 쓸 환경 변수 이름(예: SQS_AWS_JOBS_URL)."""

    if not url:
        msg = "SQS 큐 URL이 비어 있습니다."
        if env_hint:
            msg = (
                f"{env_hint} 가 비어 있습니다. AWS 콘솔에서 해당 큐의 전체 HTTPS URL을 복사해 EB/Secrets 에 넣으세요."
            )
        return {
            "configured": False,
            "ok": False,
            "detail": "missing_queue_url",
            "missing_environment_variable": env_hint or "SQS queue URL",
            "message_ko": msg,
        }
    try:
        a = _sqs().get_queue_attributes(
            QueueUrl=url,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )
        attrs = a.get("Attributes", {})
        return {
            "configured": True,
            "ok": True,
            "visible": attrs.get("ApproximateNumberOfMessages"),
            "in_flight": attrs.get("ApproximateNumberOfMessagesNotVisible"),
        }
    except (ClientError, BotoCoreError) as e:
        code = None
        if isinstance(e, ClientError):
            code = e.response.get("Error", {}).get("Code")
        payload: dict[str, Any] = {
            "configured": True,
            "ok": False,
            "queue_url_preview": url[:96] + ("…" if len(url) > 96 else ""),
            "error": str(e),
        }
        if code:
            payload["error_code"] = code
            logger.error(
                "SQS 헬스 실패 QueueUrl 접근 불가: code=%s (큐 존재·VPC 엔드포인트·IAM sqs:GetQueueAttributes 확인)",
                code,
            )
        else:
            logger.error("SQS 헬스 실패: %s", e)
        payload["message_ko"] = (
            "SQS URL은 설정됐으나 GetQueueAttributes 호출에 실패했습니다. "
            "URL이 올바른지, EB 인스턴스 역할에 sqs:* 권한이 있는지 확인하세요."
        )
        return payload
