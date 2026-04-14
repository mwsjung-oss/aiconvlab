from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

ProviderState = Literal["ready", "disabled", "not_configured", "placeholder", "connected"]


@dataclass(frozen=True)
class ProviderStatus:
    name: str
    category: Literal["llm", "cloud"]
    state: ProviderState
    enabled: bool
    configured: bool
    message: str


class LLMProvider(Protocol):
    name: str

    def status(self) -> ProviderStatus:
        ...


class CloudProvider(Protocol):
    name: str

    def status(self) -> ProviderStatus:
        ...
