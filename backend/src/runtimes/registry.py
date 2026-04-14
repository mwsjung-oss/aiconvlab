from __future__ import annotations

import logging

from core.settings import get_settings
from runtimes.base import RuntimeAdapter, RuntimeName
from runtimes.cloud_runtime import CloudRuntime
from runtimes.lab_runtime import LabRuntime
from runtimes.local_runtime import LocalRuntime

logger = logging.getLogger(__name__)


class RuntimeRegistry:
    def __init__(self) -> None:
        self._adapters: dict[RuntimeName, RuntimeAdapter] = {
            "local": LocalRuntime(),
            "lab": LabRuntime(),
            "cloud": CloudRuntime(),
        }
        self._settings = get_settings()

    @property
    def available(self) -> list[RuntimeName]:
        return [r for r in ("local", "lab", "cloud") if r in self._settings.allowed_runtimes]

    def choose(self, requested: str | None) -> RuntimeName:
        candidate = (requested or self._settings.default_runtime).strip().lower()
        runtime: RuntimeName = "local"
        if candidate in {"local", "lab", "cloud"}:
            runtime = candidate  # type: ignore[assignment]
        if runtime not in self._settings.allowed_runtimes:
            logger.warning(
                "runtime_rejected requested=%s default=%s allowed=%s",
                runtime,
                self._settings.default_runtime,
                ",".join(self._settings.allowed_runtimes),
            )
            return self._settings.default_runtime
        logger.info("runtime_selected runtime=%s requested=%s", runtime, requested)
        return runtime

    def get(self, runtime: RuntimeName) -> RuntimeAdapter:
        return self._adapters[runtime]
