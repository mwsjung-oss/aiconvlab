"""CORS policy for FastAPI (env: CORS_ORIGINS)."""
from __future__ import annotations

import os


def cors_middleware_params() -> dict:
    """CORS_ORIGINS: comma-separated origins, or * (credentials off).

    If unset, allow common localhost preview ports and a private-network origin regex
    so LAN Vite URLs still work.
    """
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    default = (
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )
    _dev_origin_regex = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}"
        r"):\d+$"
    )
    if not raw:
        origins = [o.strip() for o in default.split(",") if o.strip()]
        return {
            "allow_origins": origins,
            "allow_origin_regex": _dev_origin_regex,
            "allow_credentials": True,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
        }
    if raw == "*":
        return {
            "allow_origins": ["*"],
            "allow_credentials": False,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
        }
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if not origins:
        origins = [o.strip() for o in default.split(",") if o.strip()]
    return {
        "allow_origins": origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
