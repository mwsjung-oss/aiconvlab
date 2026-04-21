"""Structured-output AI agents for the APS platform.

Each agent wraps the LLM gateway with:
- a fixed role / system prompt
- a typed output schema (pydantic v2)
- deterministic JSON post-processing (including fallbacks)

Composite / orchestrator agents:
- :class:`ExperimentAgent` runs Data → Model → Report in sequence.
- :class:`SmartAgent` auto-augments any task with RAG context.
"""
from .base import Agent, AgentResult, AgentRunError
from .data_agent import DataAgent, DataAgentOutput
from .model_agent import ModelAgent, ModelAgentOutput
from .report_agent import ReportAgent, ReportAgentOutput
from .experiment_agent import ExperimentAgent, ExperimentAgentOutput
from .smart_agent import SmartAgent, SmartAgentOutput
from .registry import (
    AGENT_REGISTRY,
    available_agents,
    build_agent,
    run_agent,
)

__all__ = [
    "Agent",
    "AgentResult",
    "AgentRunError",
    "AGENT_REGISTRY",
    "DataAgent",
    "DataAgentOutput",
    "ExperimentAgent",
    "ExperimentAgentOutput",
    "ModelAgent",
    "ModelAgentOutput",
    "ReportAgent",
    "ReportAgentOutput",
    "SmartAgent",
    "SmartAgentOutput",
    "available_agents",
    "build_agent",
    "run_agent",
]
