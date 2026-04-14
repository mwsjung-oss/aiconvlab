from __future__ import annotations

from runtimes.base import RuntimeAdapter, RuntimeDispatchRequest, RuntimeDispatchResult


class LocalRuntime(RuntimeAdapter):
    name = "local"

    def dispatch(self, req: RuntimeDispatchRequest) -> RuntimeDispatchResult:
        return RuntimeDispatchResult(
            job_id=req.job_id,
            runtime=self.name,
            state="queued",
            accepted=True,
            message="Local runtime accepted job.",
            placeholder=False,
        )
