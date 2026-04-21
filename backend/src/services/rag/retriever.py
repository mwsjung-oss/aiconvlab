"""Semantic search + RAG answer synthesis."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Mapping, Optional

from services.llm_gateway import ask_llm

from .embeddings import embed_query
from .vector_store import ChromaVectorStore, RetrievedDoc, get_store

logger = logging.getLogger("rag.retriever")

RAG_SYSTEM_PROMPT = (
    "You are a precise research assistant. Answer the user's question strictly "
    "using the supplied context. If the context does not cover the answer, say "
    "so explicitly. Cite supporting sources inline with [#] markers that refer "
    "to the numbered context chunks."
)


def semantic_search(
    query: str,
    *,
    top_k: int = 4,
    store: Optional[ChromaVectorStore] = None,
    where: Optional[Mapping[str, object]] = None,
    min_score: float = 0.0,
) -> List[RetrievedDoc]:
    """Return the top-K most similar chunks for ``query``."""
    if not isinstance(query, str) or not query.strip():
        return []
    target = store or get_store()
    embedding = embed_query(query)
    hits = target.query(embedding, top_k=top_k, where=where)
    if min_score > 0:
        hits = [h for h in hits if h.score >= min_score]
    logger.info("rag.search query_len=%d hits=%d", len(query), len(hits))
    return hits


def _format_context(hits: List[RetrievedDoc], max_chars: int = 4500) -> str:
    pieces: List[str] = []
    budget = max_chars
    for i, hit in enumerate(hits, start=1):
        label = f"[{i}]"
        source_hint = ""
        if hit.metadata:
            src = hit.metadata.get("source") or hit.metadata.get("source_id")
            if src:
                source_hint = f" (source={src})"
        snippet = hit.text.strip()
        if len(snippet) > budget:
            snippet = snippet[: max(0, budget - 3)] + "..."
        entry = f"{label}{source_hint}\n{snippet}"
        pieces.append(entry)
        budget -= len(entry)
        if budget <= 0:
            break
    return "\n\n---\n\n".join(pieces)


@dataclass
class RagAnswer:
    answer: str
    sources: List[RetrievedDoc] = field(default_factory=list)
    used_provider: str = ""
    used_context: bool = True

    def to_dict(self) -> dict:
        return {
            "answer": self.answer,
            "used_provider": self.used_provider,
            "used_context": self.used_context,
            "sources": [s.to_dict() for s in self.sources],
        }


def rag_answer(
    query: str,
    *,
    top_k: int = 4,
    provider: str = "openai",
    store: Optional[ChromaVectorStore] = None,
    min_score: float = 0.0,
    max_context_chars: int = 4500,
) -> RagAnswer:
    """Retrieve top-K context, then synthesize a grounded answer via the LLM."""
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-empty string")

    hits = semantic_search(
        query, top_k=top_k, store=store, min_score=min_score
    )
    if not hits:
        return RagAnswer(
            answer="No relevant context found in the knowledge base.",
            sources=[],
            used_provider=provider,
            used_context=False,
        )

    context = _format_context(hits, max_chars=max_context_chars)
    prompt = (
        f"{RAG_SYSTEM_PROMPT}\n\n"
        f"Context chunks (numbered):\n{context}\n\n"
        f"Question: {query}\n"
        f"Answer (cite chunks as [#]):"
    )
    answer = ask_llm(provider, prompt)
    return RagAnswer(
        answer=answer.strip(),
        sources=hits,
        used_provider=provider,
        used_context=True,
    )
