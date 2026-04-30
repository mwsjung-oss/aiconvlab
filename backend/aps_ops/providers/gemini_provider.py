"""Google Gemini 텍스트 생성 — Gateway용."""

from __future__ import annotations

import os
import time
from typing import Any

import google.generativeai as genai


def complete_text(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
) -> dict[str, Any]:
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")
    genai.configure(api_key=key)
    m = model or (os.getenv("GEMINI_DEFAULT_MODEL") or "gemini-1.5-flash")
    # 마지막 user 메시지만 단순 전달(게이트웨이 경량)
    user_parts = [x.get("content", "") for x in messages if x.get("role") == "user"]
    prompt = user_parts[-1] if user_parts else ""
    t0 = time.perf_counter()
    gm = genai.GenerativeModel(m)
    r = gm.generate_content(prompt)
    latency_ms = (time.perf_counter() - t0) * 1000
    text = (getattr(r, "text", None) or "").strip()
    return {
        "text": text,
        "model": m,
        "input_tokens": None,
        "output_tokens": None,
        "latency_ms": latency_ms,
        "raw": r,
    }
