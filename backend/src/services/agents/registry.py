"""Single source of truth for agent instantiation.

Used by the FastAPI router and by tests. Keeps the dispatch logic in one place
so adding a new agent only requires updating this file.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

from .base import AgentResult, AgentRunError
from .data_agent import DataAgent
from .experiment_agent import ExperimentAgent
from .model_agent import ModelAgent
from .report_agent import ReportAgent
from .smart_agent import SmartAgent

AGENT_REGISTRY: Dict[str, Any] = {
    "data": DataAgent,
    "model": ModelAgent,
    "report": ReportAgent,
    "experiment": ExperimentAgent,
    "smart": SmartAgent,
}


def available_agents() -> List[str]:
    return sorted(AGENT_REGISTRY)


def build_agent(
    name: str,
    *,
    provider: str = "openai",
    model: Optional[str] = None,
    options: Optional[Mapping[str, Any]] = None,
):
    key = (name or "").strip().lower()
    if key not in AGENT_REGISTRY:
        raise AgentRunError(
            f"unknown agent '{name}'. Available: {available_agents()}"
        )
    cls = AGENT_REGISTRY[key]
    kwargs: Dict[str, Any] = {"provider": provider, "model": model}
    if key == "smart" and options:
        for opt in ("inner", "top_k", "min_score"):
            if opt in options and options[opt] is not None:
                kwargs[opt] = options[opt]
    return cls(**kwargs)


def run_agent(
    name: str,
    task: str,
    *,
    context: Optional[str] = None,
    provider: str = "openai",
    model: Optional[str] = None,
    options: Optional[Mapping[str, Any]] = None,
) -> AgentResult:
    agent = build_agent(name, provider=provider, model=model, options=options)
    return agent.run(task, context=context)
