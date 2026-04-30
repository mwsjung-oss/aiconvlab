"""Colab 스타일 AI 채팅 API."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from activity_service import log_activity
from ai_chat_service import run_chat
from database import get_db
from dependencies import get_current_approved_member
from models import User
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/ai", tags=["ai-chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(default="", max_length=120_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    prefer_openai: bool | None = Field(
        default=None,
        description="구버전 호환: False면 local",
    )
    provider: Literal["openai", "gemini", "ollama", "local"] | None = Field(
        default=None,
        description="우선 사용할 백엔드",
    )


def _ollama_base_host() -> str:
    b = (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").strip().rstrip("/")
    if b.endswith("/v1"):
        b = b[:-3].rstrip("/")
    return b or "http://127.0.0.1:11434"


@router.get("/providers")
def ai_providers(
    current_user: User = Depends(get_current_approved_member),
) -> dict:
    del current_user
    openai_ok = bool((os.getenv("OPENAI_API_KEY") or "").strip())
    gemini_ok = bool(
        (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()
    )
    ollama_models: list[str] = []
    ollama_ok = False
    try:
        host = _ollama_base_host()
        req = urllib.request.Request(
            f"{host}/api/tags",
            headers={"User-Agent": "AILab/1.0"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
                ollama_ok = True
                for m in data.get("models") or []:
                    n = (m or {}).get("name")
                    if n:
                        ollama_models.append(n)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, ValueError):
        pass

    return {
        "openai_configured": openai_ok,
        "gemini_configured": gemini_ok,
        "ollama_reachable": ollama_ok,
        "ollama_models": ollama_models[:40],
        "ollama_base_url": os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434/v1",
        "ollama_model_default": os.getenv("OLLAMA_MODEL") or "llama3.2",
    }


@router.post("/chat")
def ai_chat(
    request: Request,
    body: ChatRequest,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict:
    msgs = [m.model_dump() for m in body.messages]
    out = run_chat(
        msgs,
        current_user,
        prefer_openai=body.prefer_openai,
        provider=body.provider,
    )
    log_activity(
        db,
        current_user.id,
        "ai_chat",
        {
            "mode": out.get("mode"),
            "provider": body.provider,
            "tool_count": len(out.get("tool_results") or []),
        },
        request,
    )
    return out
