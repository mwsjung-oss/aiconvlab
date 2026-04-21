"""SmartAgent — auto-augments any sub-agent with RAG context."""
from __future__ import annotations

import logging
from typing import List, Optional

from pydantic import BaseModel, Field

from services.rag import RetrievedDoc, semantic_search

from .base import AgentResult, AgentRunError
from .data_agent import DataAgent
from .experiment_agent import ExperimentAgent
from .model_agent import ModelAgent
from .report_agent import ReportAgent

logger = logging.getLogger("agents.smart")

_INNER_AGENTS = {
    "data": DataAgent,
    "model": ModelAgent,
    "report": ReportAgent,
    "experiment": ExperimentAgent,
}


class _SourceDoc(BaseModel):
    id: str
    score: float
    snippet: str
    source: Optional[str] = None


class SmartAgentOutput(BaseModel):
    inner_agent: str = Field(..., description="Which sub-agent was invoked.")
    inner_output: dict = Field(default_factory=dict)
    retrieved_sources: List[_SourceDoc] = Field(default_factory=list)


class SmartAgent:
    """Combines semantic search with a sub-agent.

    1. Runs semantic search against the shared Chroma store for ``task``.
    2. Prepends the retrieved chunks to the sub-agent's ``context``.
    3. Delegates execution to the selected sub-agent.
    """

    name = "smart"

    def __init__(
        self,
        *,
        inner: str = "experiment",
        provider: str = "openai",
        model: Optional[str] = None,
        top_k: int = 4,
        min_score: float = 0.0,
    ) -> None:
        inner_key = (inner or "experiment").strip().lower()
        if inner_key not in _INNER_AGENTS:
            raise ValueError(
                f"unknown inner agent '{inner}'. "
                f"Options: {sorted(_INNER_AGENTS)}"
            )
        self.inner_key = inner_key
        self.provider = provider
        self.model = model
        self.top_k = max(1, int(top_k))
        self.min_score = float(min_score)
        self._inner = _INNER_AGENTS[inner_key](provider=provider, model=model)

    def run(
        self,
        task: str,
        *,
        context: Optional[str] = None,
    ) -> AgentResult:
        if not isinstance(task, str) or not task.strip():
            raise AgentRunError("task must be a non-empty string")

        try:
            hits = semantic_search(task, top_k=self.top_k, min_score=self.min_score)
        except Exception as exc:  # noqa: BLE001
            logger.warning("SmartAgent RAG search failed, continuing without: %s", exc)
            hits = []

        rag_context = _render_hits(hits)
        merged = _merge_context(rag_context, context)

        inner_result = self._inner.run(
            task,
            context=merged,
            used_rag=bool(hits),
        )

        smart_output = SmartAgentOutput(
            inner_agent=self.inner_key,
            inner_output=inner_result.output,
            retrieved_sources=[
                _SourceDoc(
                    id=h.id,
                    score=h.score,
                    snippet=(h.text or "")[:280],
                    source=_source_of(h),
                )
                for h in hits
            ],
        ).model_dump()

        return AgentResult(
            agent=self.name,
            provider=inner_result.provider,
            model=inner_result.model,
            output=smart_output,
            elapsed_ms=inner_result.elapsed_ms,
            used_rag=bool(hits),
            notes=(
                f"inner_agent={self.inner_key} rag_hits={len(hits)} "
                f"top_k={self.top_k}"
            ),
        )


def _render_hits(hits: List[RetrievedDoc]) -> str:
    if not hits:
        return ""
    lines = ["# Retrieved knowledge base context"]
    for i, h in enumerate(hits, start=1):
        src = _source_of(h) or "unknown"
        snippet = (h.text or "").strip()
        if len(snippet) > 800:
            snippet = snippet[:800] + "..."
        lines.append(f"[{i}] (source={src}, score={h.score:.2f})\n{snippet}")
    return "\n\n".join(lines)


def _merge_context(rag_context: str, user_context: Optional[str]) -> Optional[str]:
    chunks = [c for c in (rag_context, user_context) if c]
    return "\n\n".join(chunks) if chunks else None


def _source_of(doc: RetrievedDoc) -> Optional[str]:
    if not doc.metadata:
        return None
    for key in ("source", "source_id", "title", "path"):
        val = doc.metadata.get(key)
        if val:
            return str(val)
    return None


__all__ = ["SmartAgent", "SmartAgentOutput"]
