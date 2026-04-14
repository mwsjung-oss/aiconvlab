from __future__ import annotations

from runtimes.base import RuntimeAdapter, RuntimeDispatchRequest, RuntimeDispatchResult


class CloudRuntime(RuntimeAdapter):
    name = "cloud"

    def dispatch(self, req: RuntimeDispatchRequest) -> RuntimeDispatchResult:
        return RuntimeDispatchResult(
            job_id=req.job_id,
            runtime=self.name,
            state="placeholder",
            accepted=True,
            message="Cloud runtime dispatch is a safe placeholder in phase 2.",
            placeholder=True,
        )
