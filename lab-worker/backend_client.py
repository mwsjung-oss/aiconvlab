#!/usr/bin/env python3
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.request import Request, urlopen


def http_post_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    req = Request(url, data=payload, method="POST", headers=headers)
    with urlopen(req, timeout=120) as r:
        txt = r.read().decode()
        try:
            return json.loads(txt) if txt else {}
        except json.JSONDecodeError:
            return {"raw": txt}


@dataclass
class WorkerSecrets:
    backend_url: str
    worker_token: str
    worker_id: str


def post_job_status(
    ws: WorkerSecrets,
    job_id: int,
    status: str,
    *,
    output_s3_uri: str | None = None,
    error_message: str | None = None,
    result_summary: dict[str, Any] | None = None,
) -> None:
    url = f"{ws.backend_url.rstrip('/')}/api/jobs/{job_id}/status"
    payload: dict[str, Any] = {"status": status}
    if output_s3_uri is not None:
        payload["output_s3_uri"] = output_s3_uri
    if error_message is not None:
        payload["error_message"] = error_message
    if result_summary is not None:
        payload["result_summary"] = result_summary
    hdr = {
        "Content-Type": "application/json",
        "X-Lab-Worker-Token": ws.worker_token,
    }
    http_post_json(url, payload, hdr)


def post_heartbeat(
    ws: WorkerSecrets,
    *,
    hostname: str | None,
    gpu_name: str | None,
) -> dict[str, Any]:
    url = f"{ws.backend_url.rstrip('/')}/api/lab-workers/heartbeat"
    body = {
        "worker_id": ws.worker_id,
        "hostname": hostname,
        "gpu_name": gpu_name,
        "status": "idle",
        "metadata_json": {"source": "lab-gpu-worker"},
    }
    hdr = {
        "Content-Type": "application/json",
        "X-Lab-Worker-Token": ws.worker_token,
    }
    return http_post_json(url, body, hdr)
