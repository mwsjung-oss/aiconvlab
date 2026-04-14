from __future__ import annotations

from providers.base import LLMProvider, ProviderStatus


class GeminiProvider(LLMProvider):
    name = "gemini"

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
                message="Gemini provider is disabled by GEMINI_ENABLED=false.",
            )
        if not self._api_key:
            return ProviderStatus(
                name=self.name,
                category="llm",
                state="not_configured",
                enabled=True,
                configured=False,
                message="GEMINI_API_KEY/GOOGLE_API_KEY is missing.",
            )
        return ProviderStatus(
            name=self.name,
            category="llm",
            state="connected",
            enabled=True,
            configured=True,
            message="Gemini provider is configured.",
        )
