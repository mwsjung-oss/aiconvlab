from __future__ import annotations

import threading
import time
from typing import Any

from runtimes.base import RuntimeJobStatus, RuntimeName


class InMemoryJobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, RuntimeJobStatus] = {}

    def create(self, job_id: str, runtime: RuntimeName, state: str, message: str, placeholder: bool) -> RuntimeJobStatus:
        job = RuntimeJobStatus(
            job_id=job_id,
            runtime=runtime,
            state=state,  # type: ignore[arg-type]
            message=message,
            placeholder=placeholder,
            progress=5 if state == "queued" else 100,
            result=None,
        )
        with self._lock:
            self._jobs[job_id] = job
        return job

    def update(self, job_id: str, **kwargs: Any) -> RuntimeJobStatus | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            for k, v in kwargs.items():
                setattr(job, k, v)
            return job

    def get(self, job_id: str) -> RuntimeJobStatus | None:
        with self._lock:
            return self._jobs.get(job_id)

    def run_local_completion(self, job_id: str, payload: dict[str, Any]) -> None:
        def _worker() -> None:
            self.update(job_id, state="running", progress=40, message="Local runtime is processing.")
            time.sleep(0.4)
            self.update(
                job_id,
                state="completed",
                progress=100,
                message="Local runtime completed.",
                result={"echo": payload, "note": "Phase 2 abstraction path"},
            )

        threading.Thread(target=_worker, daemon=True).start()
