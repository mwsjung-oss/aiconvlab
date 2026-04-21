"""Embedding helpers used by the RAG subsystem.

Thin wrapper over :func:`services.llm_gateway.embed_texts` that adds batching
so ingestion of many chunks does not blow through the OpenAI batch limit.
"""
from __future__ import annotations

from typing import Iterable, List, Sequence

from services.llm_gateway import embed_texts

_DEFAULT_BATCH = 96  # safely below the OpenAI embeddings batch cap


def _batched(items: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def embed_documents(
    texts: Sequence[str],
    *,
    batch_size: int = _DEFAULT_BATCH,
    model: str | None = None,
) -> List[List[float]]:
    """Embed many document chunks, auto-batching to respect provider limits."""
    if not texts:
        return []
    out: List[List[float]] = []
    for batch in _batched(list(texts), batch_size):
        out.extend(embed_texts(batch, model=model))
    return out


def embed_query(text: str, *, model: str | None = None) -> List[float]:
    """Embed a single query string."""
    return embed_texts([text], model=model)[0]
