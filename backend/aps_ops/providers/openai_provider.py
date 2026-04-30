"""OpenAI Chat Completions (기존 ai_chat 경로와 별도 — APS LLM Gateway용)."""

from __future__ import annotations

import os
import time
from typing import Any

from openai import OpenAI


def complete_text(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
) -> dict[str, Any]:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    client = OpenAI(api_key=key)
    m = model or (os.getenv("OPENAI_DEFAULT_MODEL") or "gpt-4o-mini")
    t0 = time.perf_counter()
    r = client.chat.completions.create(model=m, messages=messages)
    latency_ms = (time.perf_counter() - t0) * 1000
    text = (r.choices[0].message.content or "").strip()
    u = r.usage
    return {
        "text": text,
        "model": m,
        "input_tokens": getattr(u, "prompt_tokens", None),
        "output_tokens": getattr(u, "completion_tokens", None),
        "latency_ms": latency_ms,
        "raw": r,
    }
