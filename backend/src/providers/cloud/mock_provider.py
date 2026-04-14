from __future__ import annotations

from providers.base import CloudProvider, ProviderStatus


class MockCloudProvider(CloudProvider):
    name = "mock_cloud"

    def status(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            category="cloud",
            state="placeholder",
            enabled=True,
            configured=True,
            message="Mock cloud provider for placeholder execution.",
        )
