"""S3 접근 계층 — datasets / artifacts / 모델 / 리포트.

Production: S3 버킷 미설정 시 명시적 실패.
Local: APS_STORAGE_LOCAL=1 또는 개발 환경에서 로컬 미러 폴백.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, BinaryIO

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


def _is_production() -> bool:
    return (os.getenv("ENVIRONMENT") or os.getenv("AILAB_ENV") or "").strip().lower() in (
        "production",
        "prod",
    )


def _bucket_datasets() -> str:
    return (os.getenv("S3_BUCKET_DATASETS") or os.getenv("STORAGE_BUCKET") or "").strip()


def _bucket_artifacts() -> str:
    return (os.getenv("S3_BUCKET_ARTIFACTS") or "").strip()


def _use_local_fallback() -> bool:
    """운영에서는 APS_STORAGE_LOCAL=1 일 때만 로컬 미러."""
    forced = (os.getenv("APS_STORAGE_LOCAL") or "").strip().lower() in ("1", "true", "yes")
    if _is_production():
        return forced
    return forced or (not _bucket_datasets() or not _bucket_artifacts())


def _client():
    ak = (
        os.getenv("AWS_ACCESS_KEY_ID")
        or os.getenv("STORAGE_ACCESS_KEY_ID")
        or ""
    ).strip()
    sk = (
        os.getenv("AWS_SECRET_ACCESS_KEY")
        or os.getenv("STORAGE_SECRET_ACCESS_KEY")
        or ""
    ).strip()
    region = (
        os.getenv("AWS_REGION")
        or os.getenv("STORAGE_REGION")
        or "ap-northeast-2"
    ).strip()
    endpoint = (
        os.getenv("S3_ENDPOINT_URL")
        or os.getenv("STORAGE_ENDPOINT_URL")
        or ""
    ).strip()
    kwargs: dict[str, Any] = {
        "service_name": "s3",
        "region_name": region,
        "aws_access_key_id": ak or None,
        "aws_secret_access_key": sk or None,
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client(**kwargs)


def parse_s3_uri(uri: str) -> tuple[str, str]:
    """s3://bucket/key/prefix -> (bucket, key_or_prefix)."""
    u = (uri or "").strip()
    if not u.startswith("s3://"):
        raise ValueError(f"not an s3 uri: {uri!r}")
    rest = u[5:]
    if "/" not in rest:
        return rest, ""
    bucket, key = rest.split("/", 1)
    return bucket, key


def build_s3_uri(bucket: str, key: str) -> str:
    return f"s3://{bucket}/{key.lstrip('/')}"


class LocalStorageMirror:
    """개발용: backend/data/local_s3_mirror/<bucket>/<key>"""

    def __init__(self, root: Path | None = None) -> None:
        base = root or Path(__file__).resolve().parents[2] / "data" / "local_s3_mirror"
        self._root = base
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, bucket: str, key: str) -> Path:
        return self._root / bucket / key

    def upload_file(self, local_path: Path, bucket: str, key: str) -> None:
        dst = self._path(bucket, key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(Path(local_path).read_bytes())

    def download_file(self, bucket: str, key: str, dest_path: Path) -> None:
        src = self._path(bucket, key)
        if not src.is_file():
            raise FileNotFoundError(str(src))
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(src.read_bytes())

    def upload_json(self, obj: Any, bucket: str, key: str) -> None:
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        dst = self._path(bucket, key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(body)

    def download_json(self, bucket: str, key: str) -> Any:
        p = self._path(bucket, key)
        return json.loads(p.read_text(encoding="utf-8"))

    def object_exists(self, bucket: str, key: str) -> bool:
        return self._path(bucket, key).is_file()

    def write_bytes(self, bucket: str, key: str, body: bytes) -> None:
        p = self._path(bucket, key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(body)

    def list_objects(self, bucket: str, prefix: str, max_keys: int = 1000) -> list[str]:
        base = self._root / bucket
        if not base.is_dir():
            return []
        out: list[str] = []
        for p in base.rglob("*"):
            if p.is_file():
                rel = p.relative_to(base).as_posix()
                if rel.startswith(prefix):
                    out.append(rel)
            if len(out) >= max_keys:
                break
        return out


class S3StorageService:
    """표준 프리픽스 — datasets, artifacts/reports, artifacts/models."""

    def __init__(self) -> None:
        self._datasets = _bucket_datasets()
        self._artifacts = _bucket_artifacts()
        self._local = LocalStorageMirror() if _use_local_fallback() else None
        if _is_production() and not (self._datasets and self._artifacts) and not self._local:
            raise RuntimeError(
                "production S3: S3_BUCKET_DATASETS and S3_BUCKET_ARTIFACTS are required "
                "(or set APS_STORAGE_LOCAL=1 only in non-prod)."
            )

    def buckets_configured(self) -> dict[str, bool]:
        return {
            "datasets": bool(self._datasets),
            "artifacts": bool(self._artifacts),
            "local_fallback": bool(self._local),
        }

    def dataset_prefix(self, user_id: int, dataset_id: int | str) -> str:
        b = self._datasets or "local-datasets"
        return f"s3://{b}/{user_id}/{dataset_id}/"

    def artifact_prefix(self, experiment_id: int, job_id: int | str) -> str:
        b = self._artifacts or "local-artifacts"
        return f"s3://{b}/{experiment_id}/{job_id}/"

    def report_uri(self, experiment_id: int) -> str:
        b = self._artifacts or "local-artifacts"
        return f"s3://{b}/reports/{experiment_id}/"

    def model_uri(self, experiment_id: int, job_id: int | str) -> str:
        b = self._artifacts or "local-artifacts"
        return f"s3://{b}/models/{experiment_id}/{job_id}/"

    def _resolve_bucket(self, bucket: str) -> str:
        if self._local:
            return bucket
        if not bucket:
            raise RuntimeError("S3 bucket empty")
        return bucket

    def upload_file(self, local_path: str | Path, bucket: str, key: str) -> str:
        bucket = self._resolve_bucket(bucket)
        lp = Path(local_path)
        if self._local:
            self._local.upload_file(lp, bucket, key)
            return build_s3_uri(bucket, key)
        c = _client()
        extra: dict[str, Any] = {}
        c.upload_file(str(lp), bucket, key, ExtraArgs=extra)
        return build_s3_uri(bucket, key)

    def download_file(self, bucket: str, key: str, dest_path: str | Path) -> None:
        bucket = self._resolve_bucket(bucket)
        dp = Path(dest_path)
        if self._local:
            self._local.download_file(bucket, key, dp)
            return
        c = _client()
        c.download_file(bucket, key, str(dp))

    def upload_json(self, obj: Any, bucket: str, key: str) -> str:
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        if self._local:
            self._local.upload_json(obj, bucket, key)
            return build_s3_uri(bucket, key)
        c = _client()
        c.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json")
        return build_s3_uri(bucket, key)

    def download_json(self, bucket: str, key: str) -> Any:
        if self._local:
            return self._local.download_json(bucket, key)
        c = _client()
        r = c.get_object(Bucket=bucket, Key=key)
        raw = r["Body"].read()
        return json.loads(raw.decode("utf-8"))

    def upload_bytes(self, bucket: str, key: str, body: bytes, content_type: str | None = None) -> str:
        bucket = self._resolve_bucket(bucket)
        if self._local:
            assert self._local is not None
            self._local.write_bytes(bucket, key, body)
            return build_s3_uri(bucket, key)
        c = _client()
        extra: dict[str, Any] = {}
        if content_type:
            extra["ContentType"] = content_type
        c.put_object(Bucket=bucket, Key=key, Body=body, **extra)
        return build_s3_uri(bucket, key)

    def download_bytes(self, bucket: str, key: str) -> bytes:
        if self._local:
            p = Path(self._local._root / bucket / key)
            return p.read_bytes()
        c = _client()
        r = c.get_object(Bucket=bucket, Key=key)
        return r["Body"].read()

    def create_presigned_url(
        self,
        bucket: str,
        key: str,
        *,
        client_method: str = "get_object",
        expires: int = 3600,
    ) -> str:
        if self._local:
            return f"file://local-mirror/{bucket}/{key}"
        return _client().generate_presigned_url(
            client_method,
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires,
        )

    def object_exists(self, bucket: str, key: str) -> bool:
        if self._local:
            return self._local.object_exists(bucket, key)
        try:
            _client().head_object(Bucket=bucket, Key=key)
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def list_objects(self, bucket: str, prefix: str, max_keys: int = 1000) -> list[str]:
        if self._local:
            return self._local.list_objects(bucket, prefix, max_keys)
        r = _client().list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=max_keys)
        return [o["Key"] for o in r.get("Contents", [])]

    def presigned_get(self, bucket: str, key: str, expires: int = 3600) -> str:
        return self.create_presigned_url(bucket, key, expires=expires)

    def exists(self, bucket: str, key: str) -> bool:
        return self.object_exists(bucket, key)

    # --- Training input helper ---
    def build_training_dataset_key(self, user_id: int, experiment_id: int, filename: str) -> tuple[str, str]:
        safe = Path(filename).name
        ds_bucket = self._datasets if not self._local else (_bucket_datasets() or "local-datasets")
        key = f"{user_id}/{experiment_id}/{safe}"
        return ds_bucket, key


def ping_bucket(bucket: str) -> dict[str, Any]:
    if not bucket:
        return {"ok": False, "reason": "bucket_not_configured"}
    if _use_local_fallback():
        return {"ok": True, "bucket": bucket, "note": "local_fallback"}
    try:
        c = _client()
        c.head_bucket(Bucket=bucket)
        key = "__aps_health__/probe.txt"
        c.put_object(Bucket=bucket, Key=key, Body=b"", ContentType="text/plain")
        c.head_object(Bucket=bucket, Key=key)
        c.delete_object(Bucket=bucket, Key=key)
        return {"ok": True, "bucket": bucket}
    except (ClientError, BotoCoreError, OSError) as e:
        logger.warning("S3 ping failed: %s", e)
        return {"ok": False, "bucket": bucket, "error": str(e)}


def content_hash_key(filename: str) -> str:
    return hashlib.sha256(filename.encode("utf-8", errors="replace")).hexdigest()[:16]
