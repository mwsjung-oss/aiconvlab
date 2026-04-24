"""FastAPI router · /api/kernel/* (Experiment V3 세션 커널).

동작 규칙:
  - user_id 는 현재 운영 API 의 인증 dependency 가 있긴 하지만, V3 는 우선
    'X-User-Id' 헤더 또는 Authorization 의 jwt payload email 을 사용한다.
    (운영에서 인증 dependency 를 나중에 추가하기 쉬움)
  - 커널 호출은 블로킹이므로 FastAPI 의 threadpool (`def` 엔드포인트) 에서
    실행되게 한다 — `async def` 를 쓰면 이벤트루프가 막힌다.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from services import kernel_manager as km
from services import tracing_store as ts

logger = logging.getLogger("kernel_api")

router = APIRouter(prefix="/api/kernel", tags=["kernel"])


# -- helpers -----------------------------------------------------------
def _resolve_user_id(request: Request) -> str:
    """요청에서 사용자 식별자를 추출. 헤더가 있으면 우선, 없으면 ip."""
    uid = request.headers.get("x-user-id")
    if uid:
        return uid[:120]
    # FastAPI 운영 인증은 Authorization: Bearer <jwt> 형태일 수 있으나,
    # V3 는 게이트웨이가 열려 있어 우선 ip 로 폴백한다.
    client = request.client
    return f"anon:{client.host if client else 'unknown'}"


def _safe_workspace_file(filename: str) -> str:
    """업로드된 파일의 실제 경로를 해석. `backend/ws.data/<filename>` 기본.
    상대 경로 벗어남 방지.
    """
    base = os.environ.get(
        "UPLOAD_DIR",
        os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "ws.data")
        ),
    )
    base = os.path.abspath(base)
    candidate = os.path.abspath(os.path.join(base, filename))
    if not candidate.startswith(base + os.sep) and candidate != base:
        raise HTTPException(status_code=400, detail="invalid filename")
    if not os.path.isfile(candidate):
        # 대안 디렉터리(backend/data/uploads) 도 시도
        alt_base = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
        )
        alt = os.path.abspath(os.path.join(alt_base, filename))
        if alt.startswith(alt_base + os.sep) and os.path.isfile(alt):
            return alt
        raise HTTPException(status_code=404, detail=f"file not found: {filename}")
    return candidate


# -- schemas ------------------------------------------------------------
class KernelStartResponse(BaseModel):
    kernel_id: str
    started_at: float
    message: str = ""


class KernelStatusResponse(BaseModel):
    ready: bool
    busy: bool
    kernel_id: Optional[str] = None
    last_used: Optional[float] = None


class ExecuteRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50_000)
    activity_id: Optional[str] = None
    cell_id: Optional[str] = None
    timeout: Optional[int] = Field(default=None, ge=1, le=120)


class ExecuteResponse(BaseModel):
    status: str
    outputs: List[Dict[str, Any]]
    execution_count: Optional[int] = None
    error: Optional[str] = None
    duration_ms: int


class LoadFileRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    variable: Optional[str] = Field(default="df")


# -- endpoints ----------------------------------------------------------
@router.post("/start", response_model=KernelStartResponse)
def start_kernel(request: Request) -> KernelStartResponse:
    user_id = _resolve_user_id(request)
    try:
        k = km.KernelRegistry.get_or_create(user_id)
    except km.KernelDependencyError as exc:
        logger.warning("kernel deps missing: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except km.KernelQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("kernel start failed")
        raise HTTPException(status_code=500, detail=f"kernel start failed: {exc}") from exc
    return KernelStartResponse(
        kernel_id=user_id,
        started_at=k.last_used,
        message="kernel ready · pandas/numpy/matplotlib preloaded",
    )


@router.get("/status", response_model=KernelStatusResponse)
def kernel_status(request: Request) -> KernelStatusResponse:
    user_id = _resolve_user_id(request)
    k = km.KernelRegistry.get(user_id)
    if not k:
        return KernelStatusResponse(ready=False, busy=False, kernel_id=None)
    return KernelStatusResponse(
        ready=True,
        busy=k._lock.locked(),  # noqa: SLF001 - 단순 지시기
        kernel_id=user_id,
        last_used=k.last_used,
    )


@router.post("/execute", response_model=ExecuteResponse)
def kernel_execute(payload: ExecuteRequest, request: Request) -> ExecuteResponse:
    user_id = _resolve_user_id(request)
    try:
        k = km.KernelRegistry.get_or_create(user_id)
    except km.KernelDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except km.KernelQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    t0 = time.time()
    try:
        res = k.execute(payload.code, timeout=payload.timeout or km.DEFAULT_TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        logger.exception("kernel execute crashed")
        raise HTTPException(status_code=500, detail=f"kernel crashed: {exc}") from exc
    duration_ms = int((time.time() - t0) * 1000)

    # 자동 tracing 기록 (best-effort)
    try:
        ts.record(
            user_id=user_id,
            stage="run",  # 실제 stage 는 프론트가 따로 /api/tracing/record 에서 기록
            activity_id=payload.activity_id or "unknown",
            cell_id=payload.cell_id,
            kind="code",
            content=payload.code[:20000],
            duration_ms=duration_ms,
            execution_count=res.execution_count,
        )
        ts.record(
            user_id=user_id,
            stage="run",
            activity_id=payload.activity_id or "unknown",
            cell_id=payload.cell_id,
            kind="error" if res.status == "error" else "result",
            content=(res.error or _summarize_outputs(res.outputs))[:20000],
            outputs_json=json.dumps(res.outputs)[:20000] if res.outputs else None,
            duration_ms=duration_ms,
            execution_count=res.execution_count,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("tracing write failed: %s", exc)

    return ExecuteResponse(
        status=res.status,
        outputs=res.outputs,
        execution_count=res.execution_count,
        error=res.error,
        duration_ms=duration_ms,
    )


@router.post("/interrupt")
def kernel_interrupt(request: Request) -> Dict[str, Any]:
    user_id = _resolve_user_id(request)
    k = km.KernelRegistry.get(user_id)
    if not k:
        return {"ok": False, "reason": "no kernel"}
    k.interrupt()
    return {"ok": True}


@router.post("/shutdown")
def kernel_shutdown(request: Request) -> Dict[str, Any]:
    user_id = _resolve_user_id(request)
    ok = km.KernelRegistry.shutdown(user_id)
    return {"ok": ok}


@router.post("/load_file", response_model=ExecuteResponse)
def kernel_load_file(payload: LoadFileRequest, request: Request) -> ExecuteResponse:
    path = _safe_workspace_file(payload.filename)
    var = (payload.variable or "df").strip() or "df"
    if not var.isidentifier():
        raise HTTPException(status_code=400, detail="invalid variable name")

    ext = os.path.splitext(path)[1].lower()
    if ext in (".csv", ".tsv", ".txt"):
        sep = "\t" if ext == ".tsv" else ","
        code = (
            f"import pandas as pd\n"
            f"{var} = pd.read_csv(r'''{path}''', sep='{sep}')\n"
            f"print('loaded:', '{payload.filename}', '→ {var}', {var}.shape)\n"
            f"{var}.head()"
        )
    elif ext in (".xlsx", ".xls"):
        code = (
            f"import pandas as pd\n"
            f"{var} = pd.read_excel(r'''{path}''')\n"
            f"print('loaded:', '{payload.filename}', '→ {var}', {var}.shape)\n"
            f"{var}.head()"
        )
    elif ext in (".parquet",):
        code = (
            f"import pandas as pd\n"
            f"{var} = pd.read_parquet(r'''{path}''')\n"
            f"print('loaded:', '{payload.filename}', '→ {var}', {var}.shape)\n"
            f"{var}.head()"
        )
    else:
        raise HTTPException(status_code=400, detail=f"unsupported ext: {ext}")

    # 내부 엔드포인트 재사용
    req = ExecuteRequest(code=code, activity_id="data.ingest", cell_id=None)
    return kernel_execute(req, request)


# -- helpers -----------------------------------------------------------
def _summarize_outputs(outs: List[Dict[str, Any]]) -> str:
    parts: List[str] = []
    for o in outs or []:
        if o.get("type") == "image_png":
            parts.append("[image]")
        elif o.get("type") == "html":
            parts.append("[html]")
        else:
            parts.append(str(o.get("data", ""))[:800])
    return "\n".join(parts)[:4000]
