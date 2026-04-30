"""프로덕션·배포 직후 AWS 필수 변수 누락 안내 로그."""

from __future__ import annotations

import logging
import os
from typing import Callable, Iterable

logger = logging.getLogger("aps.aws_env")


def _strip(v: str | None) -> str:
    return (v or "").strip()


def is_production_like() -> bool:
    env = (_strip(os.getenv("ENVIRONMENT")) or _strip(os.getenv("AILAB_ENV")) or "").lower()
    return env in ("production", "prod")


def missing_required_keys_for_production() -> list[str]:
    """PostgreSQL RDS + JWT + 필수 버킷/큐 (APS 마이그레이션 표준 변수)."""

    req: Iterable[tuple[str, Callable[[], str]]] = (
        ("JWT_SECRET_KEY", lambda: _strip(os.getenv("JWT_SECRET_KEY"))),
        ("AWS_REGION", lambda: _strip(os.getenv("AWS_REGION")) or _strip(os.getenv("AWS_DEFAULT_REGION"))),
        ("S3_BUCKET_DATASETS", lambda: _strip(os.getenv("S3_BUCKET_DATASETS"))),
        ("S3_BUCKET_ARTIFACTS", lambda: _strip(os.getenv("S3_BUCKET_ARTIFACTS"))),
        ("SQS_AWS_JOBS_URL", lambda: _strip(os.getenv("SQS_AWS_JOBS_URL"))),
        ("SQS_LAB_GPU_JOBS_URL", lambda: _strip(os.getenv("SQS_LAB_GPU_JOBS_URL"))),
    )
    absent: list[str] = []
    for name, val_fn in req:
        if not val_fn():
            absent.append(name)
    db_ok = _strip(os.getenv("APS_DATABASE_URL")) or _strip(os.getenv("DATABASE_URL"))
    if not db_ok:
        absent.append("APS_DATABASE_URL 또는 DATABASE_URL")
    return absent


def log_startup_aws_environment_status() -> None:
    """앱 부팅 시 한 번 출력 — 누락 변수는 로그 레벨 ERROR."""

    sqlite_fb = (_strip(os.getenv("APS_SQLITE_FALLBACK_DEV")) or "").lower() in (
        "1",
        "true",
        "yes",
    )

    if is_production_like():
        missed = missing_required_keys_for_production()
        lab_secret = bool(_strip(os.getenv("LAB_WORKER_SHARED_SECRET")))
        if missed:
            logger.error(
                "APS 프로덕션 환경에서 다음 환경 변수가 비어 있습니다(EB/Secrets 설정 필요): %s",
                ", ".join(missed),
            )
        if sqlite_fb:
            logger.error(
                "프로덕션에서 APS_SQLITE_FALLBACK_DEV 는 허용되지 않습니다. RDS(APS_DATABASE_URL)만 사용해야 합니다."
            )

        if not lab_secret:
            logger.error(
                "LAB_WORKER_SHARED_SECRET 이 비어 있습니다. "
                "/api/lab-workers/* 및 Worker용 POST /api/jobs/*/status 는 403 으로 차단됩니다."
            )
        return

    # 개발 스킴
    if sqlite_fb:
        logger.warning(
            "개발 SQLite 폴백(APS_SQLITE_FALLBACK_DEV) 활성 — 운영 배포에서는 사용 금지."
        )
        return

    miss = missing_required_keys_for_production()
    if miss:
        logger.warning(
            "로컬/스테이징 환경: 다음 값이 비어 있으면 S3/SQS 헬스·큐 기능이 degraded 됩니다 — %s",
            ", ".join(miss),
        )
