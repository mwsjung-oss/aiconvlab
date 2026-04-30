"""LLM 제공자(OpenAI·Gemini·Bedrock) 설정 요약(config-only, 과금 Inference 호출 없음)."""
from __future__ import annotations

import os


def summarize_llm_config() -> dict:
    openai_k = bool((os.getenv("OPENAI_API_KEY") or "").strip())
    gemini_k = bool(
        (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip(),
    )
    region = (os.getenv("BEDROCK_REGION") or os.getenv("AWS_REGION") or "").strip()
    bedrock_region_ok = bool(region)

    lightweight = (
        os.getenv("LLM_HEALTH_TRY_BEDROCK_LISTMODELS") or ""
    ).strip().lower() in ("1", "true", "yes")

    out: dict = {
        "status": "ok",
        "providers": {
            "openai": {"configured": openai_k},
            "gemini": {"configured": gemini_k},
            "bedrock": {"configured": bedrock_region_ok, "region": region or None},
        },
        "lightweight_inference_test_requested": lightweight,
        "hint": (
            "기본 검사는 API 키·리전 존재 여부만 확인합니다. "
            "`LLM_HEALTH_TRY_BEDROCK_LISTMODELS=true` 로 Bedrock 목록 호출 테스트를 허용할 수 있습니다(IAM 필요)."
        ),
    }

    if lightweight and region:
        try:
            import boto3  # noqa: PLC0415

            br = boto3.client("bedrock", region_name=region)
            br.list_foundation_models()  # read-only IAM
            out["bedrock_ping"] = "list_foundation_models_ok"
        except Exception as e:
            out["bedrock_ping"] = f"error:{e}"

    return out
