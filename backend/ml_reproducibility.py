"""재현성 메타(git, 데이터 체크섬, 선택 MLflow/W&B 로깅)."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

_LOG = logging.getLogger(__name__)


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def try_git_commit(cwd: Path | None = None) -> str | None:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=cwd or Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()[:40]
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def hash_requirements(backend_root: Path) -> str | None:
    for name in ("requirements.txt", "requirements-lock.txt"):
        p = backend_root / name
        if p.is_file():
            return sha256_file(p)
    return None


def build_reproducibility_base(
    *,
    dataset_path: Path,
    filename: str,
    req_dump: dict[str, Any],
    backend_root: Path | None = None,
) -> dict[str, Any]:
    root = backend_root or Path(__file__).resolve().parent
    return {
        "dataset_filename": filename,
        "dataset_sha256": sha256_file(dataset_path),
        "git_commit": try_git_commit(root),
        "requirements_sha256": hash_requirements(root),
        "python": sys.version.split()[0],
        "train_request": req_dump,
        "started_at_unix": time.time(),
    }


def finalize_reproducibility(
    base: dict[str, Any],
    *,
    duration_sec: float,
    metrics: dict[str, Any],
    sweep_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out = {**base, "duration_sec": round(duration_sec, 4), "metrics_snapshot": metrics}
    if sweep_meta:
        out["sweep"] = sweep_meta
    return out


def optional_external_loggers(
    repro: dict[str, Any],
    *,
    params: dict[str, Any],
    metrics: dict[str, Any],
) -> dict[str, Any]:
    """환경변수가 있을 때만 MLflow/W&B에 기록하고 run id/url을 repro에 합칩니다."""
    extra: dict[str, str] = {}

    uri = (os.getenv("MLFLOW_TRACKING_URI") or "").strip()
    if uri:
        try:
            import mlflow  # type: ignore

            mlflow.set_tracking_uri(uri)
            exp = os.getenv("MLFLOW_EXPERIMENT_NAME") or "ailab"
            mlflow.set_experiment(exp)
            with mlflow.start_run():
                mlflow.log_params({k: str(v) for k, v in params.items()})
                for k, v in metrics.items():
                    if isinstance(v, (int, float)):
                        mlflow.log_metric(k, float(v))
                rid = mlflow.active_run().info.run_id
                extra["mlflow_run_id"] = rid
        except Exception as e:
            _LOG.warning("MLflow logging skipped: %s", e)

    if (os.getenv("WANDB_API_KEY") or "").strip():
        try:
            import wandb  # type: ignore

            wandb.init(
                project=os.getenv("WANDB_PROJECT") or "ailab",
                reinit=True,
                config=params,
            )
            wandb.log({k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))})
            if wandb.run:
                extra["wandb_url"] = wandb.run.get_url() or ""
            wandb.finish()
        except Exception as e:
            _LOG.warning("W&B logging skipped: %s", e)

    if extra:
        repro = {**repro, "external": extra}
    return repro
