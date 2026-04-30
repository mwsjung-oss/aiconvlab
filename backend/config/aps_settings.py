"""
APS 운영 설정 로더.
Production: AWS Secrets Manager / SSM Parameter Store 연동은 TODO — 현재는 환경 변수.
Local: backend/.env 우선.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env")


def _strip(v: str | None) -> str:
    return (v or "").strip()


def load_secrets_manager_json(secret_id: str | None) -> dict[str, Any]:
    """Secrets Manager JSON secret (optional)."""
    if not secret_id:
        return {}
    try:
        import boto3  # noqa: PLC0415

        client = boto3.client("secretsmanager", region_name=_strip(os.getenv("AWS_REGION")) or None)
        resp = client.get_secret_value(SecretId=secret_id)
        raw = resp.get("SecretString") or ""
        return json.loads(raw) if raw.startswith("{") else {}
    except Exception as e:
        logger.warning("Secrets Manager load failed secret_id=%s: %s", secret_id, e)
        return {}


@lru_cache
def get_aps_environment() -> str:
    return _strip(os.getenv("ENVIRONMENT") or os.getenv("AILAB_ENV") or "development").lower()


def is_production() -> bool:
    return get_aps_environment() in ("production", "prod")


def get_database_url_candidates() -> tuple[str, str]:
    """(primary key name, url). APS_DATABASE_URL 우선."""
    aps = _strip(os.getenv("APS_DATABASE_URL"))
    legacy = _strip(os.getenv("DATABASE_URL"))
    if aps:
        return ("APS_DATABASE_URL", aps)
    if legacy:
        return ("DATABASE_URL", legacy)
    return ("", "")


def get_cors_origins_raw() -> str:
    return _strip(os.getenv("CORS_ORIGINS"))


def lab_worker_stale_seconds() -> int:
    return int(_strip(os.getenv("LAB_WORKER_STALE_SECONDS")) or "120")


def get_execution_defaults() -> dict[str, str]:
    return {
        "default_execution_target": _strip(os.getenv("DEFAULT_EXECUTION_TARGET") or "aws"),
    }
