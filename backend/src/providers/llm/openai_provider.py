from __future__ import annotations

from providers.base import LLMProvider, ProviderStatus


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, enabled: bool, api_key: str) -> None:
        self._enabled = enabled
        self._api_key = (api_key or "").strip()

    def status(self) -> ProviderStatus:
        if not self._enabled:
            return ProviderStatus(
                name=self.name,
                category="llm",
                state="disabled",
                enabled=False,
                configured=bool(self._api_key),
                message="OpenAI provider is disabled by OPENAI_ENABLED=false.",
            )
        if not self._api_key:
            return ProviderStatus(
                name=self.name,
                category="llm",
                state="not_configured",
                enabled=True,
                configured=False,
                message="OPENAI_API_KEY is missing.",
            )
        return ProviderStatus(
            name=self.name,
            category="llm",
            state="connected",
            enabled=True,
            configured=True,
            message="OpenAI provider is configured.",
        )
