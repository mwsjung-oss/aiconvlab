"""GET /test-s3 — boto3 전용 진단 라우터 (`blob_storage` 패키지 비의존).

`ENABLE_S3_TEST_ENDPOINT=true` 일 때만 동작(그 외 404).
모듈 import 시 AWS 환경 변수를 요구하지 않는다."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(tags=["diagnostics"])


def _s3_test_truthy(env_value: str | None) -> bool:
    if not env_value:
        return False
    return env_value.strip().lower() in ("1", "true", "yes")


def require_s3_test_endpoint_enabled() -> None:
    if _s3_test_truthy(os.getenv("ENABLE_S3_TEST_ENDPOINT")):
        return
    raise HTTPException(status_code=404, detail="Not Found")


def collect_missing_s3_test_env_vars() -> list[str]:
    """필수: S3_BUCKET_DATASETS, 액세스 키, 시크릿, 리전(또는 STORAGE_* 동등)."""
    missing: list[str] = []
    if not (os.getenv("S3_BUCKET_DATASETS") or "").strip():
        missing.append("S3_BUCKET_DATASETS")

    ak = (
        (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        or (os.getenv("STORAGE_ACCESS_KEY_ID") or "").strip()
    )
    if not ak:
        missing.append("AWS_ACCESS_KEY_ID (또는 STORAGE_ACCESS_KEY_ID)")

    sk = (
        (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        or (os.getenv("STORAGE_SECRET_ACCESS_KEY") or "").strip()
    )
    if not sk:
        missing.append("AWS_SECRET_ACCESS_KEY (또는 STORAGE_SECRET_ACCESS_KEY)")

    region = (os.getenv("AWS_REGION") or "").strip() or (os.getenv("STORAGE_REGION") or "").strip()
    if not region:
        missing.append("AWS_REGION (또는 STORAGE_REGION)")

    return missing


def _build_diag_s3_client():
    ak = (
        (os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
        or (os.getenv("STORAGE_ACCESS_KEY_ID") or "").strip()
    )
    sk = (
        (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
        or (os.getenv("STORAGE_SECRET_ACCESS_KEY") or "").strip()
    )
    region = (os.getenv("AWS_REGION") or "").strip() or (os.getenv("STORAGE_REGION") or "").strip()
    endpoint = (
        (os.getenv("STORAGE_ENDPOINT_URL") or "").strip()
        or (os.getenv("CLOUDFLARE_R2_ENDPOINT") or "").strip()
    )
    kwargs: dict[str, Any] = {
        "service_name": "s3",
        "region_name": region,
        "aws_access_key_id": ak,
        "aws_secret_access_key": sk,
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client(**kwargs)


@router.get(
    "/test-s3",
    dependencies=[Depends(require_s3_test_endpoint_enabled)],
    summary="S3 데이터셋 버킷 연결 테스트 (업로드 후 즉시 삭제)",
    description=(
        "`S3_BUCKET_DATASETS`에 작은 텍스트를 올렸다가 바로 삭제합니다. "
        "boto3만 사용하며 `blob_storage`에 의존하지 않습니다. "
        "R2 등은 `STORAGE_ENDPOINT_URL`/`CLOUDFLARE_R2_ENDPOINT`로 지정하세요."
    ),
    responses={
        200: {"description": "성공"},
        400: {"description": "환경 변수 누락"},
        404: {"description": "엔드포인트 비활성"},
        502: {"description": "S3 API 오류"},
        503: {"description": "클라이언트 생성 실패"},
    },
    name="test_s3_connectivity",
    include_in_schema=True,
)
def diagnose_s3_bucket() -> dict[str, Any]:
    missing = collect_missing_s3_test_env_vars()
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "s3_test_env_incomplete",
                "message": "S3 테스트에 필요한 환경 변수가 누락되었습니다.",
                "missing_environment_variables": missing,
            },
        )

    bucket = (os.getenv("S3_BUCKET_DATASETS") or "").strip()
    try:
        client = _build_diag_s3_client()
    except Exception as e:
        logger.exception("boto3 client build failed")
        raise HTTPException(
            status_code=503,
            detail={"error": "s3_client_build_failed", "message": str(e)},
        ) from e

    key = (
        f"_s3_test/{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_"
        f"{uuid.uuid4().hex[:8]}.txt"
    )
    body = b"ailab s3 connectivity test\n"
    upload_ok = False
    delete_ok = False

    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="text/plain; charset=utf-8",
        )
        upload_ok = True
    except (ClientError, BotoCoreError, OSError) as e:
        logger.exception("put_object failed bucket=%s key=%s", bucket, key)
        raise HTTPException(
            status_code=502,
            detail={"error": "s3_upload_failed", "message": str(e)},
        ) from e

    try:
        client.delete_object(Bucket=bucket, Key=key)
        delete_ok = True
    except (ClientError, BotoCoreError, OSError) as e:
        logger.exception("delete_object failed bucket=%s key=%s", bucket, key)
        return {
            "ok": False,
            "bucket": bucket,
            "key": key,
            "bytes_uploaded": len(body),
            "upload_ok": True,
            "delete_ok": False,
            "error": {"phase": "delete", "message": str(e)},
        }

    return {
        "ok": upload_ok and delete_ok,
        "bucket": bucket,
        "key": key,
        "bytes_uploaded": len(body),
        "upload_ok": upload_ok,
        "delete_ok": delete_ok,
    }
