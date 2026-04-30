"""LLM 호출을 llm_usage_logs 테이블에 기록."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from models_aps import LLMUsageLog

logger = logging.getLogger(__name__)


def log_usage(
    db: Session,
    *,
    user_id: int | None,
    experiment_id: int | None,
    job_id: int | None,
    provider: str,
    model: str | None,
    prompt_summary: str | None,
    response_summary: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
    latency_ms: float | None,
    estimated_cost: float | None,
    status: str = "ok",
) -> None:
    row = LLMUsageLog(
        user_id=user_id,
        experiment_id=experiment_id,
        job_id=job_id,
        provider=provider,
        model=model,
        prompt_summary=(prompt_summary or "")[:8000] if prompt_summary else None,
        response_summary=(response_summary or "")[:8000] if response_summary else None,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        estimated_cost=estimated_cost,
        status=status,
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        logger.exception("llm_usage_logs insert failed")
        db.rollback()


def summarize_for_log(text: str | None, max_len: int = 500) -> str | None:
    if not text:
        return None
    t = text.strip().replace("\n", " ")
    return t[:max_len] + ("…" if len(t) > max_len else "")
