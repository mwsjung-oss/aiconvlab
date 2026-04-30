"""Amazon Bedrock — Converse API (텍스트)."""

from __future__ import annotations

import json
import os
import time
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError


def complete_text(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    region: str | None = None,
) -> dict[str, Any]:
    rgn = (region or os.getenv("BEDROCK_REGION") or os.getenv("AWS_REGION") or "ap-northeast-2").strip()
    m = model or (os.getenv("BEDROCK_DEFAULT_MODEL") or "anthropic.claude-3-haiku-20240307-v1:0")
    client = boto3.client("bedrock-runtime", region_name=rgn)
    # Converse — user/system 메시지 단순 병합
    sys_parts = [x["content"] for x in messages if x.get("role") == "system"]
    user_parts = [x["content"] for x in messages if x.get("role") == "user"]
    sys_msg = "\n".join(sys_parts)[:8000]
    prompt = user_parts[-1] if user_parts else ""
    t0 = time.perf_counter()
    try:
        params: dict[str, Any] = {
            "modelId": m,
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
        }
        if sys_msg:
            params["system"] = [{"text": sys_msg}]
        resp = client.converse(**params)
    except (ClientError, BotoCoreError) as e:
        raise RuntimeError(str(e)) from e
    latency_ms = (time.perf_counter() - t0) * 1000
    out = ""
    for block in resp.get("output", {}).get("message", {}).get("content", []):
        out += block.get("text", "")
    usage = resp.get("usage", {}) or {}
    return {
        "text": out.strip(),
        "model": m,
        "input_tokens": usage.get("inputTokens"),
        "output_tokens": usage.get("outputTokens"),
        "latency_ms": latency_ms,
        "raw": resp,
    }
