"""Agent base class shared by every structured-output agent."""
from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, ClassVar, Dict, Optional, Type

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from services.llm_gateway import (
    DEFAULT_OPENAI_MODEL,
    LLMGatewayError,
    ask_llm_json,
)

logger = logging.getLogger("agents")


class AgentRunError(RuntimeError):
    """Raised when an agent cannot produce a valid structured response."""


class AgentResult(BaseModel):
    """Standard envelope for every agent invocation."""

    model_config = ConfigDict(extra="allow")

    agent: str
    provider: str
    model: str
    output: Dict[str, Any] = Field(default_factory=dict)
    elapsed_ms: int = 0
    used_rag: bool = False
    notes: Optional[str] = None


class Agent(ABC):
    """Base class.

    Subclasses must define:
    - ``name`` (str) — short identifier used by the router
    - ``OutputSchema`` (pydantic BaseModel) — validates the LLM's JSON
    - ``system_prompt`` (str) — persona / rules
    - :meth:`build_user_prompt` — formats task + context into a user message
    """

    name: ClassVar[str] = "agent"
    OutputSchema: ClassVar[Type[BaseModel]]
    system_prompt: ClassVar[str] = ""

    def __init__(
        self,
        *,
        provider: str = "openai",
        model: Optional[str] = None,
    ) -> None:
        self.provider = provider
        self.model = model or DEFAULT_OPENAI_MODEL

    @abstractmethod
    def build_user_prompt(self, task: str, context: Optional[str] = None) -> str:
        """Compose the user-facing prompt for a single run."""

    def _schema_instructions(self) -> str:
        """Compact JSON-schema description to steer the model's output.

        We include the full JSON Schema (with ``$defs``) as a fenced code
        block so models faithfully produce nested objects, not flattened
        strings. The explicit key listing above it acts as a checklist.
        """
        schema = self.OutputSchema.model_json_schema()
        props = schema.get("properties", {}) or {}
        required = schema.get("required", []) or []
        lines = ["Respond ONLY with a JSON object. Required top-level fields:"]
        for key, spec in props.items():
            kind = spec.get("type") or spec.get("anyOf") or spec.get("$ref", "any")
            if isinstance(kind, list):
                kind = "|".join(
                    k.get("type", "any") if isinstance(k, dict) else str(k) for k in kind
                )
            desc = spec.get("description") or spec.get("title") or ""
            flag = " (required)" if key in required else ""
            lines.append(f"- {key} [{kind}]{flag}: {desc}")
        lines.append("")
        lines.append("Match this full JSON Schema exactly (nested objects must be objects, not strings):")
        lines.append(json.dumps(schema, ensure_ascii=False))
        lines.append("Do not include markdown, code fences, or commentary in your response.")
        return "\n".join(lines)

    def run(
        self,
        task: str,
        *,
        context: Optional[str] = None,
        used_rag: bool = False,
    ) -> AgentResult:
        if not isinstance(task, str) or not task.strip():
            raise AgentRunError("task must be a non-empty string")

        user_prompt = self.build_user_prompt(task, context=context)
        full_prompt = f"{user_prompt}\n\n{self._schema_instructions()}"

        started = time.perf_counter()
        try:
            raw = ask_llm_json(
                self.provider,
                full_prompt,
                model=self.model,
                system=self.system_prompt or None,
            )
        except LLMGatewayError as exc:
            logger.warning("agent %s LLM error: %s", self.name, exc)
            raise AgentRunError(str(exc)) from exc

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        output = self._validate_output(raw)

        return AgentResult(
            agent=self.name,
            provider=self.provider,
            model=self.model,
            output=output,
            elapsed_ms=elapsed_ms,
            used_rag=used_rag,
        )

    def _validate_output(self, raw: Any) -> Dict[str, Any]:
        if not isinstance(raw, dict):
            raise AgentRunError(
                f"agent {self.name}: model returned non-object JSON: {type(raw).__name__}"
            )
        try:
            parsed = self.OutputSchema.model_validate(raw)
        except ValidationError as exc:
            logger.warning(
                "agent %s schema validation failed: %s\nraw=%s",
                self.name,
                exc,
                json.dumps(raw, ensure_ascii=False)[:800],
            )
            # Lenient fallback: keep the raw dict so callers still get value.
            return {"_schema_errors": exc.errors(include_url=False), **raw}
        return parsed.model_dump()


__all__ = ["Agent", "AgentResult", "AgentRunError"]
