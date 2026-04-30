"""실행 라우팅: aws 동기 학습 vs lab_gpu 큐 적재(auto/fallback 정책은 resolve_targets 에 따라 main에서 결정)."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from activity_service import log_activity
from models import Experiment, User

from models_aps import ExecutionJob, JobEvent
from aps_ops.queue import sqs_queue
from aps_ops.storage.s3_storage import build_s3_uri, S3StorageService

logger = logging.getLogger(__name__)


def schedule_lab_training_job(
    *,
    db: Session,
    user: User,
    req: Any,
    ws: Any,
    blocked_msg: str | None,
    request: Any,
) -> dict[str, Any]:
    """실험 행 생성 → 입력 CSV를 S3에 적재 → job 행 업데이트 → lab 큐 enqueue."""
    fname = getattr(req, "filename", "")
    local_csv = ws.data / fname
    if not local_csv.is_file():
        raise HTTPException(status_code=400, detail=f"데이터 파일을 찾을 수 없습니다: {fname}")

    exp = Experiment(
        user_id=user.id,
        user_email=getattr(user, "email", None),
        dataset=fname,
        target_column=getattr(req, "target_column", ""),
        feature_columns_json=json.dumps(getattr(req, "feature_columns") or []),
        task_type=getattr(req, "task"),
        model_type=getattr(req, "model_type"),
        workspace_kind="user",
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)

    model_payload = {
        "filename": fname,
        "target_column": getattr(req, "target_column"),
        "task": getattr(req, "task"),
        "model_type": getattr(req, "model_type"),
        "feature_columns": getattr(req, "feature_columns"),
        "test_size": getattr(req, "test_size"),
        "random_state": getattr(req, "random_state"),
        "project_id": getattr(req, "project_id"),
    }

    job = ExecutionJob(
        user_id=user.id,
        experiment_id=exp.id,
        job_type="train",
        execution_target=getattr(req, "execution_target", "aws"),
        resolved_target="lab_gpu",
        status="QUEUED",
        input_s3_uri=None,
        output_s3_uri=None,
        error_message=None,
        model_config_json=json.dumps(model_payload),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        storage = S3StorageService()
        ds_bucket, ds_key = storage.build_training_dataset_key(user.id, exp.id, fname)
        storage.upload_file(local_csv, ds_bucket, ds_key)
        in_uri = build_s3_uri(ds_bucket, ds_key)

        prefix = storage.artifact_prefix(exp.id, job.id)
        out_uri = prefix.rstrip("/") + "/" if prefix.endswith("/") else prefix + "/"

        job.input_s3_uri = in_uri
        job.output_s3_uri = out_uri

        merged_cfg = dict(model_payload)
        merged_cfg.update(
            {
                "input_s3_uri": in_uri,
                "output_s3_uri": out_uri,
            }
        )
        job.model_config_json = json.dumps(merged_cfg)

        db.add(
            JobEvent(
                job_id=job.id,
                event_type="dataset_uploaded_to_s3",
                message=f"{in_uri} -> output base {out_uri}",
                metadata_json={"datasets_bucket": ds_bucket, "key": ds_key},
            )
        )
        db.commit()
        db.refresh(job)

        sqs_queue.enqueue_lab_gpu_job(db, job, merged_cfg)
        db.refresh(job)
        log_activity(
            db,
            user.id,
            "train_queued_lab",
            {"job_id": job.id, "experiment_id": exp.id, "input_s3": in_uri},
            request,
        )
    except RuntimeError as e:
        logger.exception("lab queue enqueue failed")
        db.add(JobEvent(job_id=job.id, event_type="queue_error", message=str(e), metadata_json=None))
        db.commit()
        raise HTTPException(status_code=503, detail=str(e)) from e

    hint = blocked_msg or "연구실 GPU 워커 큐에 등록되었습니다."

    return {
        "queued": True,
        "job_id": job.id,
        "experiment_id": exp.id,
        "status": job.status,
        "resolved_target": "lab_gpu",
        "user_message": hint,
        "input_s3_uri": job.input_s3_uri,
        "output_s3_uri": job.output_s3_uri,
        "ui_status_hint": "lab_gpu_pending",
        "resolution_message": blocked_msg,
    }
