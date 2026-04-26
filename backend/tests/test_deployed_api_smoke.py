"""HTTP smoke tests against a deployed backend (production or staging)."""
from __future__ import annotations

import os

import pytest
from smoke_remote_checks import (
    check_health,
    check_login_invalid_returns_401,
    check_login_success_if_env,
)

pytestmark = pytest.mark.remote_smoke


@pytest.fixture(scope="module")
def deployed_base() -> str:
    base = (os.environ.get("SMOKE_BACKEND_URL") or "").strip().rstrip("/")
    if not base:
        pytest.skip("SMOKE_BACKEND_URL not set")
    return base


def test_deployed_health_200(deployed_base: str) -> None:
    check_health(deployed_base)


def test_deployed_login_invalid_is_401_not_500(deployed_base: str) -> None:
    check_login_invalid_returns_401(deployed_base)


def test_deployed_login_success_smoke_if_credentials_set(deployed_base: str) -> None:
    if not (os.environ.get("AILAB_SMOKE_EMAIL") or "").strip() or not (
        os.environ.get("AILAB_SMOKE_PASSWORD") or ""
    ).strip():
        pytest.skip("AILAB_SMOKE_EMAIL / AILAB_SMOKE_PASSWORD not set")
    check_login_success_if_env(deployed_base)
