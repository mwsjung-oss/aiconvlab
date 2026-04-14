from __future__ import annotations

from providers.base import LLMProvider, ProviderStatus


class MockLLMProvider(LLMProvider):
    name = "mock_llm"

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            category="llm",
            state="placeholder",
            enabled=True,
            configured=True,
            message="Mock LLM provider for safe local fallback.",
        )
