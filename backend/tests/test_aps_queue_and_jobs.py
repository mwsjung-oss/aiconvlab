"""APS SQS enqueue 규칙 테스트."""
from __future__ import annotations

from datetime import datetime

import pytest

from aps_ops.queue import sqs_queue
from models_aps import ExecutionJob


def test_enqueue_aws_rejects_lab_resolved() -> None:
    j = ExecutionJob(
        resolved_target="lab_gpu",
        user_id=1,
        experiment_id=None,
        job_type="t",
        execution_target="aws",
        status="QUEUED",
        input_s3_uri=None,
        output_s3_uri=None,
        error_message=None,
        model_config_json="{}",
    )
    pytest.raises(ValueError, lambda: sqs_queue.enqueue_aws_job(None, j, {}))


def test_enqueue_lab_requires_lab_target() -> None:
    j = ExecutionJob(
        resolved_target="aws",
        user_id=1,
        experiment_id=None,
        job_type="t",
        execution_target="lab_gpu",
        status="QUEUED",
        input_s3_uri=None,
        output_s3_uri=None,
        error_message=None,
        model_config_json="{}",
    )
    pytest.raises(ValueError, lambda: sqs_queue.enqueue_lab_gpu_job(None, j, {}))


def test_build_job_message_structure() -> None:
    j = ExecutionJob()
    j.id = 44
    j.user_id = 2
    j.experiment_id = 3
    j.job_type = "train"
    j.execution_target = "auto"
    j.resolved_target = "aws"
    j.input_s3_uri = "s3://b/in.csv"
    j.output_s3_uri = "s3://b/out/"
    j.created_at = datetime.utcnow()
    m = sqs_queue.build_job_message(j, {"task": "classification"})
    assert m["job_id"] == 44 and "model_config" in m


def test_auto_no_worker_falls_back_to_aws(monkeypatch: pytest.MonkeyPatch, db_sess) -> None:
    monkeypatch.setattr(sqs_queue, "lab_worker_available", lambda _db, _s: False)
    resolved, blocked = sqs_queue.resolve_targets(db_sess, "auto")
    assert resolved == "aws" and blocked is None


@pytest.fixture(scope="session")
def db_sess():
    from sqlalchemy.orm import Session

    from database import SessionLocal

    s = SessionLocal()
    assert isinstance(s, Session)
    return s
