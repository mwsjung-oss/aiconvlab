from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

RuntimeName = Literal["local", "lab", "cloud"]
JobState = Literal["queued", "running", "completed", "failed", "placeholder"]


@dataclass
class RuntimeDispatchRequest:
    job_id: str
    job_type: str
    payload: dict[str, Any]
    runtime: RuntimeName


@dataclass
class RuntimeDispatchResult:
    job_id: str
    runtime: RuntimeName
    state: JobState
    accepted: bool
    message: str
    placeholder: bool = False


@dataclass
class RuntimeJobStatus:
    job_id: str
    runtime: RuntimeName
    state: JobState
    message: str
    placeholder: bool
    progress: int = 0
    result: dict[str, Any] | None = None


class RuntimeAdapter(Protocol):
    name: RuntimeName

    def dispatch(self, req: RuntimeDispatchRequest) -> RuntimeDispatchResult:
        ...
