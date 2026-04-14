from __future__ import annotations

import logging
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.settings import get_settings
from providers.registry import ProviderRegistry
from runtimes.base import RuntimeDispatchRequest, RuntimeName
from runtimes.registry import RuntimeRegistry
from services.platform.job_store import InMemoryJobStore

logger = logging.getLogger(__name__)
router = APIRouter(tags=["platform"])

_runtime_registry = RuntimeRegistry()
_provider_registry = ProviderRegistry()
_jobs = InMemoryJobStore()


class DispatchRequest(BaseModel):
    runtime: RuntimeName | None = Field(default=None)
    job_type: str = Field(default="generic", min_length=1, max_length=64)
    payload: dict[str, Any] = Field(default_factory=dict)


class DispatchResponse(BaseModel):
    ok: bool
    job_id: str
    runtime: RuntimeName
    state: str
    message: str
    placeholder: bool


class JobStatusResponse(BaseModel):
    ok: bool
    job_id: str
    runtime: RuntimeName
    state: str
    message: str
    progress: int
    placeholder: bool
    result: dict[str, Any] | None = None


class RuntimeItem(BaseModel):
    name: RuntimeName
    available: bool
    selected_by_default: bool


class ProviderStatusItem(BaseModel):
    name: str
    category: Literal["llm", "cloud"]
    state: str
    enabled: bool
    configured: bool
    message: str


@router.get("/api/config")
@router.get("/config")
def get_config() -> dict[str, Any]:
    s = get_settings()
    return {
        "ok": True,
        "environment": s.ailab_env,
        "default_runtime": s.default_runtime,
        "allowed_runtimes": list(s.allowed_runtimes),
    }


@router.get("/api/runtimes")
@router.get("/runtimes")
def get_runtimes() -> dict[str, Any]:
    s = get_settings()
    items = [
        RuntimeItem(name=r, available=r in s.allowed_runtimes, selected_by_default=r == s.default_runtime).model_dump()
        for r in ("local", "lab", "cloud")
    ]
    return {"ok": True, "runtimes": items}


@router.get("/api/providers/status")
@router.get("/providers/status")
def get_providers_status() -> dict[str, Any]:
    statuses = [ProviderStatusItem(**s.__dict__).model_dump() for s in _provider_registry.statuses()]
    return {"ok": True, "providers": statuses}


@router.post("/api/jobs/dispatch", response_model=DispatchResponse)
@router.post("/jobs/dispatch", response_model=DispatchResponse)
def dispatch_job(body: DispatchRequest) -> DispatchResponse:
    runtime = _runtime_registry.choose(body.runtime)
    adapter = _runtime_registry.get(runtime)
    job_id = uuid.uuid4().hex[:12]
    logger.info("job_dispatch job_id=%s runtime=%s type=%s", job_id, runtime, body.job_type)
    result = adapter.dispatch(
        RuntimeDispatchRequest(
            job_id=job_id,
            job_type=body.job_type,
            payload=body.payload,
            runtime=runtime,
        )
    )
    _jobs.create(
        job_id=job_id,
        runtime=runtime,
        state=result.state,
        message=result.message,
        placeholder=result.placeholder,
    )
    if runtime == "local" and not result.placeholder:
        _jobs.run_local_completion(job_id, body.payload)
    return DispatchResponse(
        ok=True,
        job_id=job_id,
        runtime=runtime,
        state=result.state,
        message=result.message,
        placeholder=result.placeholder,
    )


@router.get("/api/jobs/{job_id}/status", response_model=JobStatusResponse)
@router.get("/jobs/{job_id}/status", response_model=JobStatusResponse)
def get_job_status(job_id: str) -> JobStatusResponse:
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        ok=True,
        job_id=job.job_id,
        runtime=job.runtime,
        state=job.state,
        message=job.message,
        progress=job.progress,
        placeholder=job.placeholder,
        result=job.result,
    )
