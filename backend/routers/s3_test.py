"""GET /test-s3 — 운영용 S3 연결 점검 (`ENABLE_S3_TEST_ENDPOINT=true` 일 때만).

인증 의존성 없음(임시 진단 전용). 기본값은 비활성화(404).

``ENABLE_S3_TEST_ENDPOINT=false`` 또는 미설정이면 존재하지 않는 리소스로 처리합니다."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter(tags=["diagnostics"])


def _s3_test_truthy(env_value: str | None) -> bool:
    if not env_value:
        return False
    return env_value.strip().lower() in ("1", "true", "yes")


def require_s3_test_endpoint_enabled() -> None:
    """기본 비활성: 미설정·false 계열이면 존재하지 않는 리소스로 처리(404)."""
    if _s3_test_truthy(os.getenv("ENABLE_S3_TEST_ENDPOINT")):
        return
    raise HTTPException(status_code=404, detail="Not Found")


def collect_missing_s3_test_env_vars() -> list[str]:
    """`/test-s3`에 필요한 환경 변수 누락 목록."""
    missing: list[str] = []
    if not (os.getenv("S3_BUCKET_DATASETS") or "").strip():
        missing.append("S3_BUCKET_DATASETS")

    ak = (os.getenv("AWS_ACCESS_KEY_ID") or "").strip() or (
        os.getenv("STORAGE_ACCESS_KEY_ID") or ""
    ).strip()
    if not ak:
        missing.append("AWS_ACCESS_KEY_ID 또는 STORAGE_ACCESS_KEY_ID")

    sk = (os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip() or (
        os.getenv("STORAGE_SECRET_ACCESS_KEY") or ""
    ).strip()
    if not sk:
        missing.append("AWS_SECRET_ACCESS_KEY 또는 STORAGE_SECRET_ACCESS_KEY")

    region = (os.getenv("AWS_REGION") or "").strip() or (os.getenv("STORAGE_REGION") or "").strip()
    if not region:
        missing.append("AWS_REGION 또는 STORAGE_REGION")

    return missing


@router.get(
    "/test-s3",
    dependencies=[Depends(require_s3_test_endpoint_enabled)],
    summary="S3 데이터셋 버킷 연결 테스트 (업로드 후 즉시 삭제)",
    description=(
        "`S3_BUCKET_DATASETS` 버킷에 작은 텍스트를 `put_object` 한 뒤 `delete_object`로 정리합니다. "
        "활성화: **`ENABLE_S3_TEST_ENDPOINT=true`** 및 `AWS_*` / `STORAGE_*` 자격 증명·리전. "
        "인증 없음(네트워크·액세스 키로만 보호)."
    ),
    responses={
        200: {"description": "성공 — `upload_ok` / `delete_ok` 포함"},
        400: {"description": "필수 환경 변수 누락 — `detail.missing_environment_variables`"},
        404: {"description": "엔드포인트 비활성 (`ENABLE_S3_TEST_ENDPOINT`)"},
        502: {"description": "S3 업로드 실패"},
        503: {"description": "boto3 클라이언트 구성 실패"},
    },
    name="test_s3_connectivity",
    include_in_schema=True,
)
def test_s3_upload() -> dict[str, Any]:
    """boto3로 소형 테스트 객체 업로드 직후 동일 객체를 삭제하고 JSON으로 반환합니다."""
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
        from blob_storage.s3_client import get_s3_client
    except Exception as e:
        logger.exception("S3 client import failed")
        raise HTTPException(
            status_code=503,
            detail={"error": "s3_client_import_failed", "message": str(e)},
        ) from e

    try:
        client = get_s3_client()
    except RuntimeError as e:
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
    except Exception as e:
        logger.exception("put_object failed bucket=%s key=%s", bucket, key)
        raise HTTPException(
            status_code=502,
            detail={"error": "s3_upload_failed", "message": str(e)},
        ) from e

    try:
        client.delete_object(Bucket=bucket, Key=key)
        delete_ok = True
    except Exception as e:
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

    ok = upload_ok and delete_ok
    return {
        "ok": ok,
        "bucket": bucket,
        "key": key,
        "bytes_uploaded": len(body),
        "upload_ok": upload_ok,
        "delete_ok": delete_ok,
    }
