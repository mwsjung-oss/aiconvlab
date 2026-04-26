"""HTTP smoke tests against a deployed backend (production or staging)."""
from __future__ import annotations

import os

import pytest
from smoke_remote_checks import (
    check_health,
    check_health_db,
    check_login_invalid_returns_401,
    check_login_success_required,
)

pytestmark = pytest.mark.remote_smoke


@pytest.fixture(scope="module")
def deployed_base() -> str:
    base = (os.environ.get("SMOKE_BACKEND_URL") or "").strip().rstrip("/")
    if not base:
        pytest.fail("SMOKE_BACKEND_URL must be set for remote_smoke tests.")
    return base


@pytest.fixture(scope="module")
def smoke_credentials_required() -> None:
    if not (os.environ.get("AILAB_SMOKE_EMAIL") or "").strip() or not (
        os.environ.get("AILAB_SMOKE_PASSWORD") or ""
    ).strip():
        pytest.fail(
            "AILAB_SMOKE_EMAIL and AILAB_SMOKE_PASSWORD must be set (no skip; required for production smoke)."
        )


def test_deployed_health_200(deployed_base: str) -> None:
    check_health(deployed_base)


def test_deployed_health_db_200(deployed_base: str) -> None:
    check_health_db(deployed_base)


def test_deployed_login_invalid_is_401_not_500(deployed_base: str) -> None:
    check_login_invalid_returns_401(deployed_base)


def test_deployed_login_success_returns_access_token(
    deployed_base: str, smoke_credentials_required: None
) -> None:
    check_login_success_required(deployed_base)
