from __future__ import annotations

from providers.base import CloudProvider, ProviderStatus


class AWSCloudProvider(CloudProvider):
    name = "aws"

    def __init__(
        self,
        enabled: bool,
        region: str,
        access_key_id: str,
        secret_access_key: str,
    ) -> None:
        self._enabled = enabled
        self._region = (region or "").strip()
        self._access_key_id = (access_key_id or "").strip()
        self._secret_access_key = (secret_access_key or "").strip()

    def status(self) -> ProviderStatus:
        configured = bool(self._region and self._access_key_id and self._secret_access_key)
        if not self._enabled:
            return ProviderStatus(
                name=self.name,
                category="cloud",
                state="disabled",
                enabled=False,
                configured=configured,
                message="AWS provider is disabled by AWS_ENABLED=false.",
            )
        if not configured:
            return ProviderStatus(
                name=self.name,
                category="cloud",
                state="not_configured",
                enabled=True,
                configured=False,
                message="AWS credentials or AWS_REGION are missing.",
            )
        return ProviderStatus(
            name=self.name,
            category="cloud",
            state="connected",
            enabled=True,
            configured=True,
            message="AWS provider is configured.",
        )
