"""APS S3 / 레거시 object storage(R2·S3) 런타임 헬스: boto3 put / head / delete."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


def _strip(v: str | None) -> str:
    return (v or "").strip()


def _aps_region_or_missing() -> tuple[str | None, list[str]]:
    region = _strip(os.getenv("AWS_REGION")) or _strip(os.getenv("AWS_DEFAULT_REGION"))
    if not region:
        return None, ["AWS_REGION 또는 AWS_DEFAULT_REGION"]
    return region, []


def _probe_aps_buckets(datasets_bucket: str, artifacts_bucket: str) -> tuple[int, dict[str, Any]]:
    """RDS·EB IAM 역할 기본 자격증명 또는 환경 키로 APS 버킷 읽기/쓰기 검증."""

    ds = _strip(datasets_bucket)
    ar = _strip(artifacts_bucket)
    missing: list[str] = []
    if not ds:
        missing.append("S3_BUCKET_DATASETS")
    if not ar:
        missing.append("S3_BUCKET_ARTIFACTS")

    region, region_miss = _aps_region_or_missing()
    missing.extend(region_miss)

    if missing:
        return 503, {
            "status": "error",
            "reason": "aps_bucket_config_incomplete",
            "mode": "aps_s3",
            "missing_environment_variables": missing,
            "message_ko": "APS 데이터셋/아티팩트 버킷 이름 또는 AWS 리전이 비어 있습니다. EB 환경·Secrets 에 값을 채워 주세요.",
        }

    try:
        client = boto3.client("s3", region_name=region)
    except Exception as e:
        logger.exception("APS S3 health boto3 client 생성 실패 region=%s", region)
        return 503, {
            "status": "error",
            "reason": "boto_client",
            "mode": "aps_s3",
            "region": region,
            "message": str(e),
        }

    buckets_to_head = [
        ("S3_BUCKET_DATASETS", ds),
        ("S3_BUCKET_ARTIFACTS", ar),
    ]
    heads: dict[str, Any] = {}
    for var_name, bn in buckets_to_head:
        try:
            client.head_bucket(Bucket=bn)
            heads[var_name] = {"ok": True, "bucket": bn}
        except ClientError as e:
            err = e.response.get("Error") or {}
            code = err.get("Code") or repr(e)
            logger.error(
                "APS S3 헬스 실패: head_bucket — 환경변수=%s bucket=%s error_code=%s (보안그룹·VPC 엔드포인트·이름 확인)",
                var_name,
                bn,
                code,
            )
            heads[var_name] = {
                "ok": False,
                "bucket": bn,
                "error_code": code,
                "message_ko": f"버킷에 접근할 수 없거나 존재하지 않습니다. IAM(eb 역할)·버킷 정책·이름('{bn}')을 확인하세요.",
            }
        except (BotoCoreError, OSError) as e:
            logger.exception("APS S3 head_bucket 예외 env=%s bucket=%s", var_name, bn)
            heads[var_name] = {"ok": False, "bucket": bn, "message": str(e)}

    if not all(h.get("ok") for h in heads.values()):
        return 503, {
            "status": "error",
            "reason": "head_bucket_failed",
            "mode": "aps_s3",
            "region": region,
            "buckets": heads,
            "message_ko": "S3_BUCKET_DATASETS 또는 S3_BUCKET_ARTIFACTS 중 하나 이상 접근 불가(NoSuchBucket, AccessDenied 등).",
        }

    key = (
        "_health/storage/"
        f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:10]}.txt"
    )
    payload = b"ailab-storage-health-probe"

    write_bucket = ds
    try:
        client.put_object(
            Bucket=write_bucket,
            Key=key,
            Body=payload,
            ContentType="text/plain; charset=utf-8",
        )
    except ClientError as e:
        logger.exception("APS put_object 실패 bucket=%s key=%s", write_bucket, key)
        code = e.response.get("Error", {}).get("Code")
        msg = {
            "status": "error",
            "reason": "put_object",
            "bucket": write_bucket,
            "mode": "aps_s3",
            "message": str(e),
        }
        if code:
            msg["error_code"] = code
        msg["message_ko"] = f"데이터셋 버킷({write_bucket})에 쓰기 실패했습니다(IAM PutObject 허용 여부 확인)."
        return 502, msg
    except (BotoCoreError, OSError) as e:
        logger.exception("APS put_object 실패 bucket=%s key=%s", write_bucket, key)
        return 502, {
            "status": "error",
            "reason": "put_object",
            "bucket": write_bucket,
            "mode": "aps_s3",
            "message": str(e),
            "message_ko": f"데이터셋 버킷({write_bucket})에 쓰기 실패(네트워크·엔드포인트 확인).",
        }

    head_ok = False
    del_ok = False
    try:
        client.head_object(Bucket=write_bucket, Key=key)
        head_ok = True
    except (ClientError, BotoCoreError, OSError) as e:
        logger.warning("APS head_object 실패: %s", e)

    try:
        client.delete_object(Bucket=write_bucket, Key=key)
        del_ok = True
    except (ClientError, BotoCoreError, OSError) as e:
        logger.warning("APS delete_object 실패: %s", e)

    if head_ok and del_ok:
        return 200, {
            "status": "ok",
            "mode": "aps_s3",
            "region": region,
            "S3_BUCKET_DATASETS": ds,
            "S3_BUCKET_ARTIFACTS": ar,
            "put_object": "ok",
            "head_object": "ok",
            "delete_object": "ok",
        }

    return 502, {
        "status": "error",
        "mode": "aps_s3",
        "region": region,
        "bucket": write_bucket,
        "put_object": "ok",
        "head_object": "ok" if head_ok else "error",
        "delete_object": "ok" if del_ok else "error",
        "message_ko": "업로드 후 읽기/삭제 중 일부가 실패했습니다(객체 수명·권한 확인).",
    }


def _probe_legacy_object_storage() -> tuple[int, dict[str, Any]]:
    """STORAGE_BACKEND s3/r2 + STORAGE_BUCKET + (선택) 정적 키·엔드포인트."""

    sb = _strip(os.getenv("STORAGE_BACKEND") or "").lower()
    if sb not in ("s3", "r2"):
        return 503, {
            "status": "error",
            "reason": "object_storage_not_configured",
            "message": (
                "APS S3(S3_BUCKET_DATASETS / S3_BUCKET_ARTIFACTS) 또는 "
                "레거시 오브젝트 스토리지(STORAGE_BACKEND=s3|r2 + STORAGE_BUCKET)가 설정되지 않았습니다."
            ),
        }

    bucket = _strip(os.getenv("STORAGE_BUCKET") or "")
    ak = _strip(os.getenv("STORAGE_ACCESS_KEY_ID")) or _strip(os.getenv("AWS_ACCESS_KEY_ID"))
    sk = _strip(os.getenv("STORAGE_SECRET_ACCESS_KEY")) or _strip(os.getenv("AWS_SECRET_ACCESS_KEY"))
    region = (
        _strip(os.getenv("STORAGE_REGION"))
        or _strip(os.getenv("AWS_REGION"))
        or _strip(os.getenv("AWS_DEFAULT_REGION"))
    )
    endpoint = _strip(os.getenv("STORAGE_ENDPOINT_URL")) or _strip(os.getenv("CLOUDFLARE_R2_ENDPOINT"))

    miss: list[str] = []
    if not bucket:
        miss.append("STORAGE_BUCKET")
    if not ak:
        miss.append("STORAGE_ACCESS_KEY_ID 또는 AWS_ACCESS_KEY_ID")
    if not sk:
        miss.append("STORAGE_SECRET_ACCESS_KEY 또는 AWS_SECRET_ACCESS_KEY")
    if not region:
        miss.append("STORAGE_REGION 또는 AWS_REGION")
    if miss:
        return 503, {
            "status": "error",
            "reason": "config_incomplete",
            "mode": "legacy",
            "missing_environment_variables": miss,
            "message_ko": "레거시 Storage 모드(STORAGE_BACKEND=s3|r2)에서 필요한 변수가 비어 있습니다.",
        }

    kwargs: dict[str, Any] = {
        "service_name": "s3",
        "region_name": region,
        "aws_access_key_id": ak,
        "aws_secret_access_key": sk,
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint

    try:
        client = boto3.client(**kwargs)
    except Exception as e:
        logger.exception("storage health boto3 client failed (legacy)")
        return 503, {"status": "error", "reason": "boto_client", "mode": "legacy", "message": str(e)}

    key = f"_health/storage/{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:10]}.txt"
    payload = b"ailab-storage-health-probe"

    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=payload,
            ContentType="text/plain; charset=utf-8",
        )
    except (ClientError, BotoCoreError, OSError) as e:
        logger.exception("legacy put_object failed bucket=%s key=%s", bucket, key)
        return 502, {"status": "error", "reason": "put_object", "bucket": bucket, "message": str(e)}

    head_ok = False
    del_ok = False

    try:
        client.head_object(Bucket=bucket, Key=key)
        head_ok = True
    except (ClientError, BotoCoreError, OSError) as e:
        logger.warning("head_object failed: %s", e)

    try:
        client.delete_object(Bucket=bucket, Key=key)
        del_ok = True
    except (ClientError, BotoCoreError, OSError) as e:
        logger.warning("delete_object failed: %s", e)

    if head_ok and del_ok:
        return 200, {
            "status": "ok",
            "mode": "legacy",
            "bucket": bucket,
            "region": region,
            "put_object": "ok",
            "head_object": "ok",
            "delete_object": "ok",
        }

    return 502, {
        "status": "error",
        "mode": "legacy",
        "bucket": bucket,
        "region": region,
        "put_object": "ok",
        "head_object": "ok" if head_ok else "error",
        "delete_object": "ok" if del_ok else "error",
    }


def probe_storage_health() -> tuple[int, dict[str, Any]]:
    """(HTTP status code, JSON body). APS 버킷이 하나라도 있으면 APS 경로를 우선."""

    ds = _strip(os.getenv("S3_BUCKET_DATASETS"))
    ar = _strip(os.getenv("S3_BUCKET_ARTIFACTS"))
    if ds or ar:
        return _probe_aps_buckets(ds, ar)

    return _probe_legacy_object_storage()
