"""FastAPI router for the /api/chat/* endpoints."""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.llm_gateway import (
    LLMGatewayError,
    ask_llm,
    has_gemini_key,
    has_openai_key,
)

logger = logging.getLogger("chat_api")

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatTestRequest(BaseModel):
    provider: Literal["openai", "gemini"] = Field(
        ..., description="LLM provider key. Supported: openai | gemini"
    )
    message: str = Field(
        ..., min_length=1, max_length=4000, description="Prompt text."
    )


class ChatTestResponse(BaseModel):
    provider: str
    response: str


class ChatHealthResponse(BaseModel):
    status: str
    openai_configured: bool
    gemini_configured: bool


@router.get("/health", response_model=ChatHealthResponse)
def chat_health() -> ChatHealthResponse:
    return ChatHealthResponse(
        status="ok",
        openai_configured=has_openai_key(),
        gemini_configured=has_gemini_key(),
    )


@router.post("/test", response_model=ChatTestResponse)
def chat_test(payload: ChatTestRequest) -> ChatTestResponse:
    try:
        text = ask_llm(payload.provider, payload.message)
    except LLMGatewayError as exc:
        logger.warning("chat_test error provider=%s: %s", payload.provider, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat_test unexpected error")
        raise HTTPException(status_code=500, detail="internal error") from exc
    return ChatTestResponse(provider=payload.provider, response=text)
