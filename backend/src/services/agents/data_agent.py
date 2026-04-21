"""DataAgent — interprets a dataset or data brief."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from .base import Agent


class DataAgentOutput(BaseModel):
    dataset_summary: str = Field(..., description="1-3 sentence overview of the data.")
    target_candidates: List[str] = Field(
        default_factory=list,
        description="Likely target/label columns or prediction objectives.",
    )
    feature_groups: List[str] = Field(
        default_factory=list,
        description="Logical groupings of features (e.g. 'demographic', 'temporal').",
    )
    recommended_preprocessing: List[str] = Field(
        default_factory=list,
        description="Concrete preprocessing steps to apply before modeling.",
    )
    data_quality_concerns: List[str] = Field(
        default_factory=list,
        description="Risks such as imbalance, missingness, leakage, drift.",
    )


class DataAgent(Agent):
    name = "data"
    OutputSchema = DataAgentOutput
    system_prompt = (
        "You are a senior data scientist. Given a dataset description or schema, "
        "you identify the prediction target, group features, flag quality risks, "
        "and propose preprocessing. Be specific and actionable."
    )

    def build_user_prompt(self, task: str, context: Optional[str] = None) -> str:
        parts = ["# Dataset brief", task.strip()]
        if context:
            parts += ["", "# Supplementary context", context.strip()]
        parts += [
            "",
            "# Task",
            "Analyze the dataset and return a structured data plan.",
        ]
        return "\n".join(parts)
