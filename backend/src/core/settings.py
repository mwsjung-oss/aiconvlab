"""Centralized environment-backed settings.

Phase 2 adds runtime/provider toggles used by abstraction layers.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal


def _strip(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


@dataclass(frozen=True)
class Settings:
    ailab_env: str
    backend_public_url: str
    default_runtime: Literal["local", "lab", "cloud"]
    allowed_runtimes: tuple[str, ...]
    openai_enabled: bool
    gemini_enabled: bool
    aws_enabled: bool
    openai_api_key: str
    gemini_api_key: str
    aws_region: str
    aws_access_key_id: str
    aws_secret_access_key: str


def _bool(name: str, default: bool = False) -> bool:
    v = (os.getenv(name) or "").strip().lower()
    if not v:
        return default
    return v in {"1", "true", "yes", "on"}


def _runtime(value: str) -> Literal["local", "lab", "cloud"]:
    if value in {"local", "lab", "cloud"}:
        return value
    return "local"


def _allowed_runtimes(raw: str) -> tuple[str, ...]:
    allowed = tuple(
        r for r in (part.strip().lower() for part in raw.split(",")) if r in {"local", "lab", "cloud"}
    )
    return allowed or ("local",)


@lru_cache
def get_settings() -> Settings:
    gemini_key = _strip("GEMINI_API_KEY", _strip("GOOGLE_API_KEY", ""))
    return Settings(
        ailab_env=_strip("AILAB_ENV", _strip("ENVIRONMENT", "local")),
        backend_public_url=_strip("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000"),
        default_runtime=_runtime(_strip("AILAB_DEFAULT_RUNTIME", "local").lower()),
        allowed_runtimes=_allowed_runtimes(_strip("AILAB_ALLOWED_RUNTIMES", "local,lab,cloud")),
        openai_enabled=_bool("OPENAI_ENABLED", False),
        gemini_enabled=_bool("GEMINI_ENABLED", False),
        aws_enabled=_bool("AWS_ENABLED", False),
        openai_api_key=_strip("OPENAI_API_KEY", ""),
        gemini_api_key=gemini_key,
        aws_region=_strip("AWS_REGION", ""),
        aws_access_key_id=_strip("AWS_ACCESS_KEY_ID", ""),
        aws_secret_access_key=_strip("AWS_SECRET_ACCESS_KEY", ""),
    )
