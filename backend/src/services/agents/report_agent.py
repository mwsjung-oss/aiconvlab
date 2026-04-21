"""ReportAgent — summarizes experiment findings for stakeholders."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from .base import Agent


class ReportAgentOutput(BaseModel):
    executive_summary: str = Field(
        ...,
        description="3-5 sentence plain-language summary of outcomes.",
    )
    key_findings: List[str] = Field(
        default_factory=list,
        description="Most important empirical findings, one per bullet.",
    )
    recommendations: List[str] = Field(
        default_factory=list,
        description="Concrete next actions for the team.",
    )
    risks: List[str] = Field(
        default_factory=list,
        description="Limitations, caveats, or risks uncovered during the experiment.",
    )
    next_experiments: List[str] = Field(
        default_factory=list,
        description="Follow-up experiments worth running.",
    )


class ReportAgent(Agent):
    name = "report"
    OutputSchema = ReportAgentOutput
    system_prompt = (
        "You are a principal data-science communicator. Summarize experiment "
        "results for a mixed audience of engineers and business stakeholders. "
        "Be concrete, honest about limitations, and action-oriented."
    )

    def build_user_prompt(self, task: str, context: Optional[str] = None) -> str:
        parts = ["# Experiment results / logs", task.strip()]
        if context:
            parts += ["", "# Supplementary context", context.strip()]
        parts += [
            "",
            "# Task",
            "Produce a structured report with findings, recommendations, risks, and next steps.",
        ]
        return "\n".join(parts)
