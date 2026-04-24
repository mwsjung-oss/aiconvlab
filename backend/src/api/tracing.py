"""FastAPI router · /api/tracing/* (Experiment V3)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from services import tracing_store as ts

logger = logging.getLogger("tracing_api")

router = APIRouter(prefix="/api/tracing", tags=["tracing"])


def _resolve_user_id(request: Request) -> str:
    uid = request.headers.get("x-user-id")
    if uid:
        return uid[:120]
    client = request.client
    return f"anon:{client.host if client else 'unknown'}"


class RecordRequest(BaseModel):
    id: Optional[str] = None
    stage: str = Field(..., min_length=1, max_length=40)
    activity_id: str = Field(..., min_length=1, max_length=80)
    cell_id: Optional[str] = Field(default=None, max_length=80)
    kind: str = Field(..., pattern="^(prompt|code|result|error|file)$")
    content: str = Field(..., max_length=20_000)
    outputs_json: Optional[str] = Field(default=None, max_length=200_000)
    outputs: Optional[List[Dict[str, Any]]] = None
    execution_count: Optional[int] = None
    duration_ms: Optional[int] = None
    created_at: Optional[str] = None


class RecordResponse(BaseModel):
    ok: bool
    trace: Dict[str, Any]


class ListResponse(BaseModel):
    items: List[Dict[str, Any]]
    count: int


@router.post("/record", response_model=RecordResponse)
def record(payload: RecordRequest, request: Request) -> RecordResponse:
    user_id = _resolve_user_id(request)
    outputs_json = payload.outputs_json
    if outputs_json is None and payload.outputs is not None:
        import json as _json
        try:
            outputs_json = _json.dumps(payload.outputs)[:200_000]
        except Exception:
            outputs_json = None
    try:
        trace = ts.record(
            id=payload.id,
            user_id=user_id,
            stage=payload.stage,
            activity_id=payload.activity_id,
            cell_id=payload.cell_id,
            kind=payload.kind,
            content=payload.content,
            outputs_json=outputs_json,
            execution_count=payload.execution_count,
            duration_ms=payload.duration_ms,
            created_at=payload.created_at,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("tracing record failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return RecordResponse(ok=True, trace=trace)


@router.get("/list", response_model=ListResponse)
def list_items(
    request: Request,
    stage: Optional[str] = Query(default=None),
    activity_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> ListResponse:
    user_id = _resolve_user_id(request)
    items = ts.list_traces(
        user_id=user_id, stage=stage, activity_id=activity_id, limit=limit
    )
    return ListResponse(items=items, count=len(items))


@router.get("/export")
def export_items(
    request: Request,
    stage: Optional[str] = Query(default=None),
    activity_id: Optional[str] = Query(default=None),
    format: str = Query(default="md", pattern="^(md|json)$"),
    limit: int = Query(default=500, ge=1, le=2000),
):
    user_id = _resolve_user_id(request)
    items = ts.list_traces(
        user_id=user_id, stage=stage, activity_id=activity_id, limit=limit
    )
    if format == "json":
        return {"items": items, "count": len(items)}
    text = ts.export_markdown(items)
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=text, media_type="text/markdown")


@router.delete("/{trace_id}")
def delete_item(trace_id: str, request: Request) -> Dict[str, Any]:
    ok = ts.soft_delete(trace_id)
    return {"ok": ok}
