"""Document ingestion utilities: chunking + Chroma insertion."""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterable, List, Mapping, Optional, Sequence

from .embeddings import embed_documents
from .vector_store import ChromaVectorStore, get_store

logger = logging.getLogger("rag.ingestion")


@dataclass
class Document:
    """Input document for ingestion."""

    text: str
    metadata: Mapping[str, Any] = field(default_factory=dict)
    id: Optional[str] = None


def chunk_text(
    text: str,
    *,
    chunk_size: int = 600,
    chunk_overlap: int = 80,
) -> List[str]:
    """Split ``text`` into overlapping character-level chunks.

    The chunker keeps it simple but is sentence-aware: it prefers to break on
    paragraph/sentence boundaries inside the target size window.
    """
    if not isinstance(text, str):
        raise TypeError("text must be str")
    text = text.strip()
    if not text:
        return []
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be in [0, chunk_size)")

    # Normalize whitespace runs so chunk boundaries are consistent.
    normalized = re.sub(r"[ \t]+", " ", text)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)

    chunks: List[str] = []
    start = 0
    n = len(normalized)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            window = normalized[start:end]
            # Prefer a paragraph break, then a sentence break, then whitespace.
            for candidate in (
                window.rfind("\n\n"),
                window.rfind(". "),
                window.rfind("? "),
                window.rfind("! "),
                window.rfind("\n"),
                window.rfind(" "),
            ):
                if candidate > chunk_size * 0.5:
                    end = start + candidate + 1
                    break
        chunks.append(normalized[start:end].strip())
        if end >= n:
            break
        start = max(end - chunk_overlap, start + 1)
    return [c for c in chunks if c]


def _stable_id(text: str, metadata: Mapping[str, Any], chunk_idx: int) -> str:
    h = hashlib.sha1()
    h.update(text.encode("utf-8", errors="ignore"))
    h.update(str(sorted((metadata or {}).items())).encode("utf-8"))
    h.update(f":{chunk_idx}".encode("utf-8"))
    return h.hexdigest()[:24]


def ingest_documents(
    documents: Sequence[Document],
    *,
    store: Optional[ChromaVectorStore] = None,
    chunk_size: int = 600,
    chunk_overlap: int = 80,
    embedding_model: Optional[str] = None,
) -> List[str]:
    """Chunk + embed + upsert ``documents``, returning the inserted chunk ids."""
    if not documents:
        return []
    target = store or get_store()

    all_texts: List[str] = []
    all_metas: List[dict] = []
    all_ids: List[str] = []

    for doc in documents:
        if not isinstance(doc, Document):
            raise TypeError("documents must contain Document instances")
        chunks = chunk_text(doc.text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        if not chunks:
            continue
        doc_id_prefix = doc.id or uuid.uuid4().hex[:12]
        for idx, chunk in enumerate(chunks):
            chunk_id = f"{doc_id_prefix}:{idx:04d}:{_stable_id(chunk, doc.metadata, idx)}"
            meta = dict(doc.metadata or {})
            meta.setdefault("source_id", doc_id_prefix)
            meta["chunk_index"] = idx
            meta["chunk_count"] = len(chunks)
            all_texts.append(chunk)
            all_metas.append(meta)
            all_ids.append(chunk_id)

    if not all_texts:
        return []

    logger.info(
        "ingest: %d source docs → %d chunks (avg %.0f chars)",
        len(documents),
        len(all_texts),
        sum(len(t) for t in all_texts) / max(1, len(all_texts)),
    )

    embeddings = embed_documents(all_texts, model=embedding_model)
    target.add(ids=all_ids, texts=all_texts, embeddings=embeddings, metadatas=all_metas)
    return all_ids


def ingest_raw(
    items: Iterable[Mapping[str, Any]],
    *,
    store: Optional[ChromaVectorStore] = None,
    chunk_size: int = 600,
    chunk_overlap: int = 80,
) -> List[str]:
    """Convenience: ingest a list of ``{"text": ..., "metadata": {...}, "id": ?}`` dicts."""
    docs: List[Document] = []
    for i, item in enumerate(items):
        if not isinstance(item, Mapping):
            raise TypeError(f"item at index {i} must be a mapping")
        text = item.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"item at index {i} missing non-empty 'text'")
        docs.append(
            Document(
                text=text,
                metadata=dict(item.get("metadata") or {}),
                id=item.get("id"),
            )
        )
    return ingest_documents(
        docs,
        store=store,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
