"""CORS policy for FastAPI (env: CORS_ORIGINS).

- ``AILAB_ENV=production``: ``CORS_ORIGINS`` 에 실제 SPA 오리진(스킴+호스트)을 반드시 넣습니다.
  기본적인 localhost 규칙 병합(`allow_origin_regex`)은 운영에서 기본적으로 끕니다.

- 로컬·스테이징에서는 비어 있을 때 로컬 Vite 프리셋(+ LAN 정규식)으로 완화합니다.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_DEV_ORIGIN_REGEX = (
    r"^https?://("
    r"localhost|127\.0\.0\.1|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|"
    r"100\.(64|65|66|67|68|69|6[0-9]|[89]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}"
    r"):\d+$"
)


def _is_production() -> bool:
    return (
        os.getenv("AILAB_ENV") or os.getenv("ENVIRONMENT") or ""
    ).strip().lower() in ("production", "prod")




def warn_production_cors() -> None:
    """하위 호환용. 검증은 :func:`cors_middleware_params` 가 앱 초기화 시 처리합니다."""

    return


def cors_middleware_params() -> dict:
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    prod = _is_production()

    default_dev = (
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    def _development_cors_dict(origins_list: list[str]) -> dict:
        return {
            "allow_origins": origins_list,
            "allow_origin_regex": _DEV_ORIGIN_REGEX,
            "allow_credentials": True,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
            "allow_private_network": True,
        }

    if prod and not raw:
        msg = (
            "AILAB_ENV=production 인데 CORS_ORIGINS 가 비어 있습니다. "
            "클라우드 프런트(Cloudflare 등) 도메인을 예: "
            "`CORS_ORIGINS=https://example.pages.dev` 형태로 설정하세요."
        )
        logger.error(msg)
        raise RuntimeError(msg)

    if not raw:
        origins = [o.strip() for o in default_dev.split(",") if o.strip()]
        return _development_cors_dict(origins)

    if raw == "*":
        return {
            "allow_origins": ["*"],
            "allow_credentials": False,
            "allow_methods": ["*"],
            "allow_headers": ["*"],
            "allow_private_network": True,
        }

    origins = [o.strip() for o in raw.split(",") if o.strip()]
    if not origins:
        origins = [o.strip() for o in default_dev.split(",") if o.strip()]

    _canonical_frontends = (
        "https://aiconlab.com",
        "https://www.aiconlab.com",
        "https://aiconvlab.com",
        "https://www.aiconvlab.com",
    )
    merged: list[str] = []
    seen: set[str] = set()
    for o in list(origins) + list(_canonical_frontends):
        if o not in seen:
            seen.add(o)
            merged.append(o)
    origins = merged

    if prod:
        for o in origins:
            lo = o.lower()
            if "localhost" in lo or "127.0.0.1" in lo or "::1" in lo:
                logger.warning(
                    "CORS_ORIGINS 에 로컬 루프백 포함: %s (프로덕션 SPA가 아니면 제거 검토)",
                    o,
                )

    base = {
        "allow_origins": origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
        "allow_private_network": True,
    }

    merge_regex = (os.getenv("CORS_ENABLE_DEV_ORIGIN_REGEX") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    if prod and not merge_regex:
        return base
    if not prod or merge_regex:
        base["allow_origin_regex"] = _DEV_ORIGIN_REGEX
    return base
