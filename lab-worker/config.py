#!/usr/bin/env python3
from __future__ import annotations

import os
from dataclasses import dataclass

from backend_client import WorkerSecrets


def _default_worker_id() -> str:
    import socket

    return socket.gethostname()


@dataclass
class WorkerRuntime:
    lab_queue_url: str
    heartbeat_period_sec: int
    visibility_timeout_sec: int
    aws_region: str
    secrets: WorkerSecrets


def load_runtime() -> WorkerRuntime:
    return WorkerRuntime(
        lab_queue_url=(os.getenv("SQS_LAB_GPU_JOBS_URL") or "").strip(),
        heartbeat_period_sec=int(os.getenv("LAB_WORKER_HEARTBEAT_SECONDS") or "30"),
        visibility_timeout_sec=int(os.getenv("SQS_VISIBILITY_TIMEOUT") or "300"),
        aws_region=(os.getenv("AWS_REGION") or "ap-northeast-2").strip(),
        secrets=WorkerSecrets(
            backend_url=(os.getenv("APS_BACKEND_URL") or "").strip(),
            worker_token=(os.getenv("LAB_WORKER_SHARED_SECRET") or "").strip(),
            worker_id=(os.getenv("LAB_WORKER_ID") or "").strip() or _default_worker_id(),
        ),
    )
