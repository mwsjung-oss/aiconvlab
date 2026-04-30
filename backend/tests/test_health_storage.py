"""GET /api/health/storage 및 probe_storage_health 단위 테스트."""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

from health_storage_probe import probe_storage_health


def test_probe_rejects_when_no_aps_no_legacy_backend() -> None:
    """APS 버킷도 없고 레거시 STORAGE_BACKEND 도 s3/r2 가 아니면 명시적 에러."""

    base = {"STORAGE_BACKEND": "local"}
    with patch.dict(os.environ, base, clear=True):
        code, body = probe_storage_health()
    assert code == 503
    assert body.get("reason") == "object_storage_not_configured"


def test_probe_missing_legacy_bucket() -> None:
    """레거시 s3 모드에서 bucket 비어 있을 때."""

    base = {
        "STORAGE_BACKEND": "s3",
        "STORAGE_BUCKET": "",
        "AWS_ACCESS_KEY_ID": "k",
        "AWS_SECRET_ACCESS_KEY": "s",
        "AWS_REGION": "ap-northeast-2",
    }
    with patch.dict(os.environ, base, clear=True):
        code, body = probe_storage_health()
    assert code == 503
    assert "missing_environment_variables" in body


@patch("health_storage_probe.boto3.client")
def test_probe_full_cycle_ok_legacy(mock_boto: MagicMock) -> None:
    client = MagicMock()
    mock_boto.return_value = client
    env = {
        "STORAGE_BACKEND": "s3",
        "STORAGE_BUCKET": "tb",
        "AWS_ACCESS_KEY_ID": "kid",
        "AWS_SECRET_ACCESS_KEY": "sek",
        "AWS_REGION": "ap-northeast-2",
    }
    with patch.dict(os.environ, env, clear=True):
        code, body = probe_storage_health()
    assert code == 200
    assert body == {
        "status": "ok",
        "mode": "legacy",
        "bucket": "tb",
        "region": "ap-northeast-2",
        "put_object": "ok",
        "head_object": "ok",
        "delete_object": "ok",
    }
    client.put_object.assert_called_once()
    client.head_object.assert_called_once()
    client.delete_object.assert_called_once()


@patch("health_storage_probe.boto3.client")
def test_probe_aps_buckets_ok(mock_boto: MagicMock) -> None:
    """S3_BUCKET_* 가 있으면 APS 경로(기본 자격증명)로 프로브."""

    client = MagicMock()
    mock_boto.return_value = client
    env = {
        "S3_BUCKET_DATASETS": "ds-b",
        "S3_BUCKET_ARTIFACTS": "ar-b",
        "AWS_REGION": "ap-northeast-2",
    }
    with patch.dict(os.environ, env, clear=True):
        code, body = probe_storage_health()
    assert code == 200
    assert body["mode"] == "aps_s3"
    assert body["S3_BUCKET_DATASETS"] == "ds-b"
    assert body["S3_BUCKET_ARTIFACTS"] == "ar-b"
    assert client.head_bucket.call_count == 2
    client.put_object.assert_called_once()
    client.head_object.assert_called_once()
    client.delete_object.assert_called_once()


def test_probe_aps_one_bucket_only_returns_503() -> None:
    """한쪽만 설정되면 헬스가 구성 불완료로 처리."""

    with patch.dict(os.environ, {"S3_BUCKET_DATASETS": "x", "AWS_REGION": "ap-northeast-2"}, clear=True):
        code, body = probe_storage_health()
    assert code == 503
    assert body.get("reason") == "aps_bucket_config_incomplete"
