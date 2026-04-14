from __future__ import annotations

from runtimes.base import RuntimeAdapter, RuntimeDispatchRequest, RuntimeDispatchResult


class LabRuntime(RuntimeAdapter):
    name = "lab"

    def dispatch(self, req: RuntimeDispatchRequest) -> RuntimeDispatchResult:
        return RuntimeDispatchResult(
            job_id=req.job_id,
            runtime=self.name,
            state="placeholder",
            accepted=True,
            message="Lab runtime dispatch is a safe placeholder in phase 2.",
            placeholder=True,
        )
