"""ExperimentAgent — orchestrates Data → Model → Report in sequence."""
from __future__ import annotations

import logging
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .base import AgentResult, AgentRunError
from .data_agent import DataAgent, DataAgentOutput
from .model_agent import ModelAgent, ModelAgentOutput
from .report_agent import ReportAgent, ReportAgentOutput

logger = logging.getLogger("agents.experiment")


class ExperimentAgentOutput(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    data_plan: DataAgentOutput
    modeling_plan: ModelAgentOutput
    report: ReportAgentOutput
    orchestration_notes: str = Field(
        default="",
        description="How the orchestrator passed context between stages.",
    )


def _safe_validate(cls, data):
    """Attempt strict validation; on failure keep raw dict for downstream use."""
    try:
        return cls.model_validate(data).model_dump()
    except ValidationError as exc:
        logger.warning(
            "experiment orchestrator: %s schema validation failed, keeping raw dict: %s",
            cls.__name__,
            exc,
        )
        return {"_schema_errors": exc.errors(include_url=False), **data}


class ExperimentAgent:
    """Composite orchestrator.

    Stages:
    1. DataAgent produces a data plan.
    2. ModelAgent takes ``task + data plan`` as context, proposes a model plan.
    3. ReportAgent consolidates all stages into a final report.
    """

    name = "experiment"

    def __init__(
        self,
        *,
        provider: str = "openai",
        model: Optional[str] = None,
    ) -> None:
        self.provider = provider
        self.model = model
        self._data = DataAgent(provider=provider, model=model)
        self._model = ModelAgent(provider=provider, model=model)
        self._report = ReportAgent(provider=provider, model=model)

    def run(
        self,
        task: str,
        *,
        context: Optional[str] = None,
        used_rag: bool = False,
    ) -> AgentResult:
        if not isinstance(task, str) or not task.strip():
            raise AgentRunError("task must be a non-empty string")
        data_res = self._data.run(task, context=context, used_rag=used_rag)

        model_ctx_parts = []
        if context:
            model_ctx_parts.append(context)
        model_ctx_parts.append("# Prior data plan\n" + _render_short(data_res.output))
        model_res = self._model.run(
            task,
            context="\n\n".join(model_ctx_parts),
            used_rag=used_rag,
        )

        report_ctx_parts = []
        if context:
            report_ctx_parts.append(context)
        report_ctx_parts.append("# Data plan\n" + _render_short(data_res.output))
        report_ctx_parts.append("# Modeling plan\n" + _render_short(model_res.output))
        report_res = self._report.run(
            task,
            context="\n\n".join(report_ctx_parts),
            used_rag=used_rag,
        )

        combined = {
            "data_plan": _safe_validate(
                DataAgentOutput, _strip_schema_errors(data_res.output)
            ),
            "modeling_plan": _safe_validate(
                ModelAgentOutput, _strip_schema_errors(model_res.output)
            ),
            "report": _safe_validate(
                ReportAgentOutput, _strip_schema_errors(report_res.output)
            ),
            "orchestration_notes": (
                "Ran data -> model -> report sequentially, "
                f"passing previous stage output as context (rag={used_rag})."
            ),
        }

        total_ms = (
            data_res.elapsed_ms + model_res.elapsed_ms + report_res.elapsed_ms
        )
        return AgentResult(
            agent=self.name,
            provider=self.provider,
            model=self.model or data_res.model,
            output=combined,
            elapsed_ms=total_ms,
            used_rag=used_rag,
            notes=(
                f"stages: data={data_res.elapsed_ms}ms, "
                f"model={model_res.elapsed_ms}ms, report={report_res.elapsed_ms}ms"
            ),
        )


def _render_short(output: dict) -> str:
    """Render a dict into compact key: value lines for cross-agent context."""
    lines = []
    for key, val in output.items():
        if key.startswith("_"):
            continue
        if isinstance(val, list):
            rendered = "; ".join(str(v) for v in val[:8]) or "(empty)"
        elif isinstance(val, dict):
            rendered = ", ".join(f"{k}={v}" for k, v in list(val.items())[:6])
        else:
            rendered = str(val)
        lines.append(f"- {key}: {rendered}")
    return "\n".join(lines)


def _strip_schema_errors(output: dict) -> dict:
    return {k: v for k, v in output.items() if not k.startswith("_")}


__all__ = ["ExperimentAgent", "ExperimentAgentOutput"]
