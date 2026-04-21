"""RAG API router: /api/rag/ingest, /api/rag/query."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.llm_gateway import LLMGatewayError
from services.rag import (
    Document,
    ingest_documents,
    rag_answer,
    semantic_search,
)
from services.rag.vector_store import (
    default_collection_name,
    default_persist_path,
    get_store,
)

logger = logging.getLogger("rag_api")

router = APIRouter(prefix="/api/rag", tags=["rag"])


class IngestDocIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=200_000)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    id: Optional[str] = Field(
        default=None, max_length=128, description="Optional stable document id."
    )


class IngestRequest(BaseModel):
    documents: List[IngestDocIn] = Field(..., min_length=1, max_length=256)
    collection: Optional[str] = Field(default=None, max_length=64)
    chunk_size: int = Field(default=600, ge=100, le=4000)
    chunk_overlap: int = Field(default=80, ge=0, le=1000)


class IngestResponse(BaseModel):
    collection: str
    persist_path: str
    ingested_chunks: int
    chunk_ids: List[str]


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    top_k: int = Field(default=4, ge=1, le=20)
    collection: Optional[str] = Field(default=None, max_length=64)
    mode: Literal["search", "answer"] = "answer"
    provider: Literal["openai", "gemini"] = "openai"
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)


class SourceOut(BaseModel):
    id: str
    score: float
    text: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    collection: str
    mode: str
    used_context: bool
    answer: Optional[str] = None
    sources: List[SourceOut] = Field(default_factory=list)


@router.post("/ingest", response_model=IngestResponse)
def ingest(payload: IngestRequest) -> IngestResponse:
    collection = payload.collection or default_collection_name()
    store = get_store(collection=collection)

    if payload.chunk_overlap >= payload.chunk_size:
        raise HTTPException(
            status_code=422,
            detail="chunk_overlap must be strictly less than chunk_size",
        )

    docs = [
        Document(text=d.text, metadata=d.metadata, id=d.id) for d in payload.documents
    ]
    try:
        ids = ingest_documents(
            docs,
            store=store,
            chunk_size=payload.chunk_size,
            chunk_overlap=payload.chunk_overlap,
        )
    except LLMGatewayError as exc:
        logger.warning("rag.ingest gateway error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("rag.ingest failed")
        raise HTTPException(status_code=500, detail="rag ingest failed") from exc

    return IngestResponse(
        collection=collection,
        persist_path=default_persist_path(),
        ingested_chunks=len(ids),
        chunk_ids=ids,
    )


@router.post("/query", response_model=QueryResponse)
def query(payload: QueryRequest) -> QueryResponse:
    collection = payload.collection or default_collection_name()
    store = get_store(collection=collection)

    try:
        if payload.mode == "search":
            hits = semantic_search(
                payload.query,
                top_k=payload.top_k,
                store=store,
                min_score=payload.min_score,
            )
            return QueryResponse(
                collection=collection,
                mode="search",
                used_context=bool(hits),
                answer=None,
                sources=[
                    SourceOut(
                        id=h.id,
                        score=h.score,
                        text=h.text,
                        metadata=dict(h.metadata or {}),
                    )
                    for h in hits
                ],
            )
        # mode == "answer"
        result = rag_answer(
            payload.query,
            top_k=payload.top_k,
            provider=payload.provider,
            store=store,
            min_score=payload.min_score,
        )
        return QueryResponse(
            collection=collection,
            mode="answer",
            used_context=result.used_context,
            answer=result.answer,
            sources=[
                SourceOut(
                    id=h.id,
                    score=h.score,
                    text=h.text,
                    metadata=dict(h.metadata or {}),
                )
                for h in result.sources
            ],
        )
    except LLMGatewayError as exc:
        logger.warning("rag.query gateway error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("rag.query failed")
        raise HTTPException(status_code=500, detail="rag query failed") from exc


@router.get("/stats")
def stats(collection: Optional[str] = None) -> dict:
    target = collection or default_collection_name()
    store = get_store(collection=target)
    return {
        "collection": target,
        "persist_path": default_persist_path(),
        "count": store.count,
    }
