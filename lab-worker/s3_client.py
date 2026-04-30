#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import os

import boto3


def split_s3_uri(uri: str) -> tuple[str, str]:
    u = uri.strip()
    if not u.startswith("s3://"):
        raise ValueError("expected s3:// uri")
    rest = u[5:]
    if "/" not in rest:
        return rest.rstrip("/"), ""
    b, _, k = rest.partition("/")
    return b, k


class S3Facade:
    def __init__(self) -> None:
        self.client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION") or "ap-northeast-2",
        )

    def download_uri_to_file(self, uri: str, dest: Path) -> Path:
        b, k = split_s3_uri(uri)
        dest.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(b, k, str(dest))
        return dest

    def upload_json_manifest(self, manifest_uri: str, obj: dict) -> None:
        b, key = split_s3_uri(manifest_uri.lstrip("/"))
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.client.put_object(Bucket=b, Key=key, Body=body, ContentType="application/json")
