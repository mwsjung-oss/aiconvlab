from __future__ import annotations

import logging

from core.settings import get_settings
from providers.base import ProviderStatus
from providers.cloud.aws_provider import AWSCloudProvider
from providers.cloud.mock_provider import MockCloudProvider
from providers.llm.gemini_provider import GeminiProvider
from providers.llm.mock_provider import MockLLMProvider
from providers.llm.openai_provider import OpenAIProvider

logger = logging.getLogger(__name__)


class ProviderRegistry:
    def __init__(self) -> None:
        s = get_settings()
        self._providers = [
            OpenAIProvider(enabled=s.openai_enabled, api_key=s.openai_api_key),
            GeminiProvider(enabled=s.gemini_enabled, api_key=s.gemini_api_key),
            AWSCloudProvider(
                enabled=s.aws_enabled,
                region=s.aws_region,
                access_key_id=s.aws_access_key_id,
                secret_access_key=s.aws_secret_access_key,
            ),
            MockLLMProvider(),
            MockCloudProvider(),
        ]

    def statuses(self) -> list[ProviderStatus]:
        statuses = [p.status() for p in self._providers]
        for st in statuses:
            logger.info(
                "provider_status name=%s state=%s enabled=%s configured=%s",
                st.name,
                st.state,
                st.enabled,
                st.configured,
            )
        return statuses
