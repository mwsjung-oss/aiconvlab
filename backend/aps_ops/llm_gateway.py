"""OpenAI/Gemini/Bedrock 선택·fallback 및 사용량 기록."""

from __future__ import annotations

import logging
from typing import Any, Literal

from sqlalchemy.orm import Session

from aps_ops import llm_usage_tracker
from aps_ops.providers import bedrock_provider, gemini_provider, openai_provider

logger = logging.getLogger(__name__)

ProviderName = Literal["openai", "gemini", "bedrock", "auto"]


def complete_with_gateway(
    db: Session,
    messages: list[dict[str, str]],
    *,
    provider: ProviderName | str,
    model: str | None,
    user_id: int | None = None,
    experiment_id: int | None = None,
    job_id: int | None = None,
) -> dict[str, Any]:
    """텍스트 완성. auto 시 openai→gemini→bedrock 순."""
    order = _resolve_provider_order(provider)
    errors: list[str] = []

    last: dict[str, Any] | None = None
    for p in order:
        try:
            if p == "openai":
                last = openai_provider.complete_text(messages, model=model)
            elif p == "gemini":
                last = gemini_provider.complete_text(messages, model=model)
            else:
                last = bedrock_provider.complete_text(messages, model=model)

            lt = llm_usage_tracker.summarize_for_log(messages[-1].get("content") if messages else None)
            rt = llm_usage_tracker.summarize_for_log(last.get("text"))
            llm_usage_tracker.log_usage(
                db,
                user_id=user_id,
                experiment_id=experiment_id,
                job_id=job_id,
                provider=p,
                model=str(last.get("model")),
                prompt_summary=lt,
                response_summary=rt,
                input_tokens=last.get("input_tokens"),
                output_tokens=last.get("output_tokens"),
                latency_ms=last.get("latency_ms"),
                estimated_cost=None,
                status="ok",
            )
            last["chosen_provider"] = p
            return last
        except Exception as e:  # noqa: BLE001 — fallback chain
            errors.append(f"{p}:{e}")
            logger.warning("gateway provider %s failed: %s", p, e)
            llm_usage_tracker.log_usage(
                db,
                user_id=user_id,
                experiment_id=experiment_id,
                job_id=job_id,
                provider=p,
                model=model,
                prompt_summary=llm_usage_tracker.summarize_for_log(
                    messages[-1].get("content") if messages else None,
                ),
                response_summary=None,
                input_tokens=None,
                output_tokens=None,
                latency_ms=None,
                estimated_cost=None,
                status=f"error:{type(e).__name__}",
            )

    raise RuntimeError("all_llm_providers_failed: " + " | ".join(errors))


def _resolve_provider_order(provider: str) -> list[str]:
    pv = (provider or "auto").strip().lower()
    if pv == "auto":
        return ["openai", "gemini", "bedrock"]
    if pv in ("openai", "gemini", "bedrock"):
        return [pv]
    raise ValueError(f"unknown provider: {provider}")
