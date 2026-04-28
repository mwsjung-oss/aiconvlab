"""Hermetic tests for ``GET /test-s3`` (feature flag, env validation, boto3 mock).

Requires ``DATABASE_URL`` to import ``backend.main`` — same as other backend suites in CI."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

if not (os.getenv("DATABASE_URL") or "").strip():
    pytest.skip(
        "DATABASE_URL required for backend main import",
        allow_module_level=True,
    )
try:
    import boto3  # noqa: F401
except ImportError:
    pytest.skip(
        "boto3+botocore required (pip install -r requirements.txt)",
        allow_module_level=True,
    )

from fastapi.testclient import TestClient

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _prepend_backend_on_path() -> None:
    s = str(_BACKEND_DIR)
    if s not in sys.path:
        sys.path.insert(0, s)


def _load_legacy_main_app():
    _prepend_backend_on_path()
    import main as main_mod

    return main_mod.app, main_mod


@pytest.fixture(autouse=True)
def _clear_overrides() -> None:
    yield
    main_mod = sys.modules.get("main")
    if main_mod is not None and hasattr(main_mod, "app"):
        main_mod.app.dependency_overrides.clear()


def test_import_main_app_succeeds() -> None:
    """앱 모듈 로드가 실패하지 않아야 함(Render import 단계)."""
    _prepend_backend_on_path()
    import main as main_mod  # noqa: PLC0415

    assert getattr(main_mod, "app", None) is not None
    assert main_mod.app.title


def test_s3_test_disabled_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_S3_TEST_ENDPOINT", "false")
    app, main_mod = _load_legacy_main_app()
    main_mod.app.dependency_overrides.clear()
    client = TestClient(app, raise_server_exceptions=True)
    r = client.get("/test-s3")
    assert r.status_code == 404
    assert r.json().get("detail") == "Not Found"


def test_s3_test_missing_env_lists_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_S3_TEST_ENDPOINT", "true")
    monkeypatch.delenv("S3_BUCKET_DATASETS", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("STORAGE_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("STORAGE_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("AWS_REGION", raising=False)
    monkeypatch.delenv("STORAGE_REGION", raising=False)

    app, main_mod = _load_legacy_main_app()
    main_mod.app.dependency_overrides.clear()

    client = TestClient(app, raise_server_exceptions=True)
    r = client.get("/test-s3")
    assert r.status_code == 400
    body = r.json()
    detail = body.get("detail")
    assert isinstance(detail, dict)
    missing = detail.get("missing_environment_variables")
    assert isinstance(missing, list)
    assert "S3_BUCKET_DATASETS" in missing
    assert any("ACCESS_KEY_ID" in m for m in missing)
    assert any("SECRET_ACCESS_KEY" in m for m in missing)
    assert any("REGION" in m for m in missing)


def test_s3_test_put_and_delete_called(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_S3_TEST_ENDPOINT", "true")
    monkeypatch.setenv("S3_BUCKET_DATASETS", "test-bucket-datasets")
    monkeypatch.setenv("STORAGE_ACCESS_KEY_ID", "ak-test")
    monkeypatch.setenv("STORAGE_SECRET_ACCESS_KEY", "sk-test")
    monkeypatch.setenv("STORAGE_REGION", "ap-northeast-2")

    mock_client = MagicMock()
    mock_client.put_object.return_value = {"ETag": '"abc"', "ResponseMetadata": {}}
    mock_client.delete_object.return_value = {"ResponseMetadata": {}}

    from blob_storage import s3_client

    s3_client.get_s3_client.cache_clear()

    app, main_mod = _load_legacy_main_app()
    main_mod.app.dependency_overrides.clear()

    client = TestClient(app, raise_server_exceptions=True)

    with patch("blob_storage.s3_client.get_s3_client", return_value=mock_client):
        r = client.get("/test-s3")

    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert data.get("bucket") == "test-bucket-datasets"
    assert data.get("upload_ok") is True
    assert data.get("delete_ok") is True
    assert data.get("bytes_uploaded") == len(b"ailab s3 connectivity test\n")
    assert data.get("key", "").startswith("_s3_test/")

    mock_client.put_object.assert_called_once()
    mock_client.delete_object.assert_called_once()
    put_kw = mock_client.put_object.call_args[1]
    del_kw = mock_client.delete_object.call_args[1]
    assert put_kw["Bucket"] == "test-bucket-datasets"
    assert del_kw["Bucket"] == "test-bucket-datasets"
    assert put_kw["Key"] == del_kw["Key"]


def test_openapi_lists_get_test_s3(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLE_S3_TEST_ENDPOINT", "false")
    app, _main_mod = _load_legacy_main_app()
    oc = TestClient(app, raise_server_exceptions=True)
    spec = oc.get("/openapi.json")
    assert spec.status_code == 200
    paths = spec.json().get("paths") or {}
    assert "/test-s3" in paths, f"missing path; keys sample: {sorted(paths.keys())[:25]}"
    get_op = (paths["/test-s3"] or {}).get("get") or {}
    assert "diagnostics" in (get_op.get("tags") or []), get_op
