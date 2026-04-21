"""Agent API router: /api/agent/run."""
from __future__ import annotations

import logging
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from services.agents import (
    AgentRunError,
    available_agents,
    run_agent,
)
from services.llm_gateway import LLMGatewayError

logger = logging.getLogger("agent_api")

router = APIRouter(prefix="/api/agent", tags=["agent"])


class SmartAgentOptions(BaseModel):
    inner: Literal["data", "model", "report", "experiment"] = "experiment"
    top_k: int = Field(default=4, ge=1, le=20)
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)


class AgentRunRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    agent: Literal["data", "model", "report", "experiment", "smart"]
    task: str = Field(..., min_length=1, max_length=8000)
    context: Optional[str] = Field(default=None, max_length=16_000)
    provider: Literal["openai", "gemini"] = "openai"
    model: Optional[str] = Field(default=None, max_length=128)
    options: Optional[SmartAgentOptions] = None


class AgentRunResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    agent: str
    provider: str
    model: str
    output: Dict[str, Any]
    elapsed_ms: int
    used_rag: bool
    notes: Optional[str] = None


@router.get("/list")
def list_agents() -> dict:
    return {"agents": available_agents()}


@router.post("/run", response_model=AgentRunResponse)
def run(payload: AgentRunRequest) -> AgentRunResponse:
    options = payload.options.model_dump() if payload.options else None
    try:
        result = run_agent(
            payload.agent,
            payload.task,
            context=payload.context,
            provider=payload.provider,
            model=payload.model,
            options=options,
        )
    except AgentRunError as exc:
        logger.warning("agent.run error (%s): %s", payload.agent, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMGatewayError as exc:
        logger.warning("agent.run LLM error (%s): %s", payload.agent, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("agent.run unexpected error")
        raise HTTPException(status_code=500, detail="agent run failed") from exc

    return AgentRunResponse(
        agent=result.agent,
        provider=result.provider,
        model=result.model,
        output=result.output,
        elapsed_ms=result.elapsed_ms,
        used_rag=result.used_rag,
        notes=result.notes,
    )
