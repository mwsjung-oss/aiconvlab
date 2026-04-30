"""Blob 저장 정책 (운영: APS S3 또는 레거시 S3/R2, 로컬은 개발 전용)."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def _production() -> bool:
    return (
        os.getenv("AILAB_ENV") or os.getenv("ENVIRONMENT") or ""
    ).strip().lower() in ("production", "prod")


def _truthy(val: str | None) -> bool:
    if not val:
        return False
    return val.strip().lower() in ("1", "true", "yes")


def validate_storage_startup() -> None:
    sb = (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
    bucket = (os.getenv("STORAGE_BUCKET") or "").strip()
    ak = (
        os.getenv("STORAGE_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or ""
    ).strip()
    sk = (
        os.getenv("STORAGE_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY") or ""
    ).strip()
    endpoint = (
        os.getenv("STORAGE_ENDPOINT_URL") or os.getenv("CLOUDFLARE_R2_ENDPOINT") or ""
    ).strip()

    ds = (os.getenv("S3_BUCKET_DATASETS") or "").strip()
    ar = (os.getenv("S3_BUCKET_ARTIFACTS") or "").strip()
    aps_ready = bool(ds and ar)

    if not _production():
        if aps_ready:
            if not (os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "").strip():
                logger.warning(
                    "S3_BUCKET_DATASETS/ARTIFACTS 가 설정됐지만 AWS_REGION(또는 AWS_DEFAULT_REGION) 이 비어 있습니다."
                )
        if sb in ("s3", "r2") and (not bucket or not ak or not sk):
            logger.warning(
                "STORAGE_BACKEND=%s 이지만 bucket 또는 액세스 키가 비어 있습니다.",
                sb,
            )
        return

    if _truthy(os.getenv("STORAGE_ALLOW_EPHEMERAL_DISK")):
        raise RuntimeError(
            "운영에서는 STORAGE_ALLOW_EPHEMERAL_DISK 가 true 일 수 없습니다(배포 시 제거)."
        )

    if (ds or ar) and not aps_ready:
        raise RuntimeError(
            "운영 APS S3: S3_BUCKET_DATASETS 와 S3_BUCKET_ARTIFACTS 는 둘 다 비어 있지 않아야 합니다(한쪽만 설정됨)."
        )

    if aps_ready:
        region = (os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "").strip()
        if not region:
            raise RuntimeError(
                "운영 APS S3: S3_BUCKET_DATASETS / S3_BUCKET_ARTIFACTS 가 설정된 경우 "
                "AWS_REGION 또는 AWS_DEFAULT_REGION 이 필수입니다."
            )
        logger.info("APS S3 버킷 사용(데이터셋=%s, 아티팩트=%s, region=%s)", ds, ar, region)
        return

    if sb not in ("s3", "r2"):
        raise RuntimeError(
            "AILAB_ENV=production 에서는 (1) APS: S3_BUCKET_DATASETS 및 S3_BUCKET_ARTIFACTS, "
            "또는 (2) STORAGE_BACKEND=s3 또는 r2 + STORAGE_BUCKET 이 필요합니다. "
            "로컬 디스크 전용 모드는 허용되지 않습니다."
        )
    missing: list[str] = []
    if not bucket:
        missing.append("STORAGE_BUCKET")
    if not ak:
        missing.append("STORAGE_ACCESS_KEY_ID")
    if not sk:
        missing.append("STORAGE_SECRET_ACCESS_KEY")
    if sb == "r2" and not endpoint:
        missing.append("STORAGE_ENDPOINT_URL(또는 CLOUDFLARE_R2_ENDPOINT) — R2 호환 엔드포인트")

    if missing:
        raise RuntimeError(
            "Render/레거시 object storage 환경변수 누락: " + "; ".join(missing)
        )


def get_storage_backend_name() -> str:
    return (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
