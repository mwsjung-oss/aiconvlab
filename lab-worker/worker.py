#!/usr/bin/env python3
"""Lab GPU Worker — SQS(lab 큐만). 상태는 Backend HTTPS API 로만 반영."""

from __future__ import annotations

import json
import logging
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import boto3

from backend_client import post_heartbeat, post_job_status
from config import WorkerRuntime, load_runtime
from job_runner import run_train_job_from_message
from s3_client import S3Facade

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("lab-worker")

_STOP = threading.Event()


def handler(_sig: int, _f: object) -> None:
    _STOP.set()


def gpu_name() -> str | None:
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout.strip()
        return r.split("\n")[0].strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
        return None


def hb_worker(st: WorkerRuntime) -> None:
    host = socket.gethostname()
    g = gpu_name()
    while not _STOP.is_set():
        try:
            post_heartbeat(st.secrets, hostname=host, gpu_name=g)
        except Exception as e:
            log.warning("heartbeat failed: %s", e)
        if _STOP.wait(timeout=st.heartbeat_period_sec):
            return


def process_message(st: WorkerRuntime, s3f: S3Facade, raw: dict) -> None:
    ws = st.secrets
    body = json.loads(raw["Body"])
    job_id = int(body["job_id"])
    mc = dict(body.get("model_config") or {})
    inp = mc.get("input_s3_uri")
    outp = mc.get("output_s3_uri") or ""

    post_job_status(ws, job_id, "RUNNING")
    try:
        if inp:
            tmp = Path(tempfile.gettempdir()) / f"aps-{job_id}.csv"
            s3f.download_uri_to_file(inp, tmp)
            mc["local_csv_path"] = str(tmp)
        summary = run_train_job_from_message(mc)

        manifest = {"job_id": job_id, **summary}
        if outp.startswith("s3://"):
            s3f.upload_json_manifest(outp.rstrip("/") + "/manifest.json", manifest)

        post_job_status(
            ws,
            job_id,
            "COMPLETED",
            output_s3_uri=outp or None,
            result_summary=manifest,
        )
    except Exception as e:
        post_job_status(ws, job_id, "FAILED", error_message=str(e)[:8000])
        raise


def main() -> None:
    signal.signal(signal.SIGINT, handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handler)

    st = load_runtime()
    if not (st.lab_queue_url and st.secrets.backend_url and st.secrets.worker_token):
        log.error("SQS_LAB_GPU_JOBS_URL, APS_BACKEND_URL, LAB_WORKER_SHARED_SECRET 필수.")
        sys.exit(2)

    threading.Thread(target=hb_worker, args=(st,), daemon=True).start()
    sqs = boto3.client("sqs", region_name=st.aws_region)
    s3f = S3Facade()
    qurl = st.lab_queue_url
    log.info("polling %s", qurl[:80])

    while not _STOP.is_set():
        resp = sqs.receive_message(
            QueueUrl=qurl,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=18,
            VisibilityTimeout=st.visibility_timeout_sec,
        )
        msgs = resp.get("Messages") or []
        if not msgs:
            time.sleep(0.05)
            continue
        for m in msgs:
            rh = m["ReceiptHandle"]
            try:
                process_message(st, s3f, m)
            except Exception:
                log.exception("job failed")
            finally:
                sqs.delete_message(QueueUrl=qurl, ReceiptHandle=rh)


if __name__ == "__main__":
    main()
