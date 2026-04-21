"""ModelAgent — recommends models + evaluation setup."""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from .base import Agent


class ModelCandidate(BaseModel):
    name: str = Field(..., description="Model/algorithm name.")
    rationale: str = Field(..., description="Why this model fits the task.")
    hyperparameters: Dict[str, object] = Field(
        default_factory=dict,
        description="Initial hyperparameter hints (ranges or concrete values).",
    )


class ModelAgentOutput(BaseModel):
    task_type: str = Field(
        ...,
        description="One of classification, regression, forecasting, clustering, ranking, other.",
    )
    recommended_models: List[ModelCandidate] = Field(
        default_factory=list,
        description="Top 2-4 models ordered from best-fit first.",
    )
    evaluation_metrics: List[str] = Field(
        default_factory=list,
        description="Metrics to compute during evaluation.",
    )
    validation_strategy: str = Field(
        ...,
        description="Train/val split or cross-validation scheme.",
    )
    tracking_checklist: List[str] = Field(
        default_factory=list,
        description="What to log per run (params, metrics, artifacts).",
    )


class ModelAgent(Agent):
    name = "model"
    OutputSchema = ModelAgentOutput
    system_prompt = (
        "You are an ML engineering lead. Given a dataset summary and business "
        "objective, propose appropriate models, hyperparameter starting points, "
        "validation scheme, and evaluation metrics. Prefer battle-tested "
        "baselines before exotic choices."
    )

    def build_user_prompt(self, task: str, context: Optional[str] = None) -> str:
        parts = ["# Modeling brief", task.strip()]
        if context:
            parts += ["", "# Supplementary context", context.strip()]
        parts += [
            "",
            "# Task",
            "Recommend a modeling plan with concrete algorithms, metrics, and validation.",
        ]
        return "\n".join(parts)
