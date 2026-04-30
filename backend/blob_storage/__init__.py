"""Storage abstraction (로컬 `STORAGE_ROOT` vs S3 호환 버킷).

운영(`STORAGE_BACKEND=s3|r2`)에서는 `blob_storage/sync_io.py`와 `blob_storage/object_store.py`가
스테이징 경로와 버킷 키를 동기화합니다. 레거시 `LocalFilesystemBackend`는 개발용입니다."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol, runtime_checkable

from storage_root import STORAGE_ROOT


@runtime_checkable
class BlobStorageBackend(Protocol):
    def logical_key_prefix(self, *parts: str) -> str: ...

    def preferred_backend_name(self) -> str: ...


class LocalFilesystemBackend:
    """개발 또는 전환 중: 로컬 ``STORAGE_ROOT``."""

    def __init__(self, root: Path | None = None) -> None:
        self._root = (root or STORAGE_ROOT).resolve()

    def logical_key_prefix(self, *parts: str) -> str:
        return "/".join(str(p).strip("/") for p in parts if p)

    def preferred_backend_name(self) -> str:
        return "local"

    def path_under_root(self, *parts: str) -> Path:
        return self._root.joinpath(*parts)


class S3CompatibleBackend(LocalFilesystemBackend):
    """설정 존재 시 boto3 업로드를 붙일 수 있는 자리표시자."""

    def __init__(self) -> None:
        super().__init__()
        self.bucket = (os.getenv("STORAGE_BUCKET") or "").strip()
        self.endpoint = (
            os.getenv("STORAGE_ENDPOINT_URL")
            or os.getenv("CLOUDFLARE_R2_ENDPOINT")
            or ""
        ).strip()
        self.region = (os.getenv("STORAGE_REGION") or os.getenv("AWS_REGION") or "").strip()

    def preferred_backend_name(self) -> str:
        return "s3"


def get_blob_backend() -> BlobStorageBackend:
    sb = get_storage_backend_name()
    return S3CompatibleBackend() if sb in ("s3", "r2") else LocalFilesystemBackend()


def get_storage_backend_name() -> str:
    return (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
