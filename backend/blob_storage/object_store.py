"""S3 호환 버킷 put/get/delete/list."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

from botocore.exceptions import ClientError

from .s3_client import get_bucket, get_s3_client


def object_key(workspace_scope: str, *segments: str) -> str:
    cleaned = [(workspace_scope or "").strip("/")]
    for segment in segments:
        for part in str(segment).replace("\\", "/").split("/"):
            p = part.strip()
            if p:
                cleaned.append(p)
    return "/".join(cleaned)


class ObjectStoreOps:
    __slots__ = ("client", "bucket")

    def __init__(self) -> None:
        self.client = get_s3_client()
        self.bucket = get_bucket()

    def put_bytes(self, key: str, data: bytes, content_type: str | None = None) -> None:
        extras: dict = {}
        if content_type:
            extras["ContentType"] = content_type
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, **extras)

    def get_bytes(self, key: str) -> bytes | None:
        try:
            r = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as e:
            code = str(e.response.get("Error", {}).get("Code", ""))
            if code in ("NoSuchKey", "404", "NotFound") or code == "404":
                return None
            raise
        return r["Body"].read()

    def delete_objects_with_prefix(self, prefix: str) -> None:
        keys = self.list_prefix_keys(prefix)
        self.delete_keys(keys)

    def delete_keys(self, keys: Iterable[str]) -> None:
        ks = list(keys)
        if not ks:
            return
        for i in range(0, len(ks), 1000):
            chunk = [{"Key": k} for k in ks[i : i + 1000]]
            self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": chunk})

    def list_prefix_keys(self, prefix: str, limit: int = 12000) -> list[str]:
        """prefix 이하 모든 키(페이지네이션)."""
        normalized = prefix if prefix.endswith("/") or "." in prefix.split("/")[-1] else prefix
        normalized = normalized.lstrip("/")
        out: list[str] = []
        token = None
        while True:
            kwargs: dict = {"Bucket": self.bucket, "Prefix": normalized}
            kwargs["MaxKeys"] = min(1000, max(1, limit - len(out)))
            if token:
                kwargs["ContinuationToken"] = token
            r = self.client.list_objects_v2(**kwargs)
            for ent in r.get("Contents") or []:
                k = ent.get("Key") or ""
                if k:
                    out.append(k)
                    if len(out) >= limit:
                        return out
            if not r.get("IsTruncated"):
                break
            token = r.get("NextContinuationToken")
        return out

    def list_prefix_summaries(
        self, prefix: str, limit: int = 12000
    ) -> list[tuple[str, int, datetime | None]]:
        """ListObjects 결과에 Size·LastModified 를 유지합니다(데이터셋 목록 UI용)."""
        normalized = prefix if prefix.endswith("/") or "." in prefix.split("/")[-1] else prefix
        normalized = normalized.lstrip("/")
        out: list[tuple[str, int, datetime | None]] = []
        token = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": self.bucket, "Prefix": normalized}
            kwargs["MaxKeys"] = min(1000, max(1, limit - len(out)))
            if token:
                kwargs["ContinuationToken"] = token
            r = self.client.list_objects_v2(**kwargs)
            for ent in r.get("Contents") or []:
                k = ent.get("Key") or ""
                if not k or k.endswith("/"):
                    continue
                sz = int(ent.get("Size") or 0)
                lm = ent.get("LastModified")
                if lm is not None and getattr(lm, "tzinfo", None) is None:
                    lm = lm.replace(tzinfo=timezone.utc)
                out.append((k, sz, lm if isinstance(lm, datetime) else None))
                if len(out) >= limit:
                    return out
            if not r.get("IsTruncated"):
                break
            token = r.get("NextContinuationToken")
        return out


_ops: ObjectStoreOps | None = None


def ops() -> ObjectStoreOps:
    global _ops
    if _ops is None:
        _ops = ObjectStoreOps()
    return _ops


def reset_ops_for_tests() -> None:
    """테스트 등에서 초기화가 필요하면 사용."""
    global _ops
    _ops = None
