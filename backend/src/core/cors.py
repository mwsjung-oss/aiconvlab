"""CORS policy for FastAPI (env: CORS_ORIGINS)."""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def warn_production_cors() -> None:
    """운영 환경에서 CORS 미설정 시 브라우저에서 API 호출이 막히는 경우가 많아 기동 시 한 번 알립니다."""
    env = (os.getenv("AILAB_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if env not in ("production", "prod"):
        return
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if raw:
        return
    logger.warning(
        "AILAB_ENV/ENVIRONMENT 가 production 인데 CORS_ORIGINS 가 비어 있습니다. "
        "Cloudflare Pages 등 별도 도메인의 프론트에서 API를 호출하려면 "
        "예: CORS_ORIGINS=https://your-app.pages.dev,https://www.example.com "
        "처럼 실제 오리진(스킴·호스트·포트)을 콤마로 넣어 주세요."
    )


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
    # 명시 CORS(운영 오리진)이 있어도 LAN·localhost Vite(예: 192.168.x.x:5174) 는
    # allow_origin_regex 로 허용합니다. CORS 미설정 시에만 쓰면 LAN dev 가 깨집니다.
    return {
        "allow_origins": origins,
        "allow_origin_regex": _dev_origin_regex,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
