"""Low-level boto3 S3 client (AWS S3 또는 Cloudflare R2 호환 엔드포인트)."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config


@lru_cache(maxsize=1)
def get_s3_client() -> Any:
    region = (os.getenv("STORAGE_REGION") or os.getenv("AWS_REGION") or "auto").strip()
    endpoint = (
        os.getenv("STORAGE_ENDPOINT_URL")
        or os.getenv("CLOUDFLARE_R2_ENDPOINT")
        or ""
    ).strip()
    ak = (os.getenv("STORAGE_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or "").strip()
    sk = (os.getenv("STORAGE_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY") or "").strip()
    if not ak or not sk:
        raise RuntimeError(
            "S3/R2 스토리지에 필요한 STORAGE_ACCESS_KEY_ID 및 STORAGE_SECRET_ACCESS_KEY(또는 AWS_*)가 없습니다."
        )
    # R2: region auto, 고정 아이오 스레드 호환 설정
    session = boto3.session.Session(region_name="us-east-1" if region in ("auto", "") else region)
    return session.client(
        "s3",
        endpoint_url=endpoint or None,
        aws_access_key_id=ak,
        aws_secret_access_key=sk,
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "adaptive"}),
    )


def get_bucket() -> str:
    b = (os.getenv("STORAGE_BUCKET") or "").strip()
    if not b:
        raise RuntimeError("STORAGE_BUCKET 이 설정되어 있어야 합니다.")
    return b
