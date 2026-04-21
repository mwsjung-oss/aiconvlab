"""Thin persistence layer around ChromaDB.

Design decisions:
- Embeddings are computed *outside* Chroma (via our LLM gateway) and passed in
  explicitly, so Chroma does not try to download a local ONNX model.
- The store is created lazily with a module-level LRU, keyed by
  ``(persist_path, collection_name)``, so reuse across requests is cheap.
- Telemetry is disabled to silence harmless Posthog warnings.
"""
from __future__ import annotations

import functools
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, List, Mapping, Optional, Sequence

logger = logging.getLogger("rag.vector_store")

_DEFAULT_PERSIST_PATH = os.getenv(
    "VECTOR_DB_PATH",
    str(Path(__file__).resolve().parents[3] / "data" / "vector_db"),
)
_DEFAULT_COLLECTION = os.getenv("VECTOR_DB_COLLECTION", "default")


def default_persist_path() -> str:
    """Current default on-disk path for the vector DB."""
    # Re-read the env var so tests that set it via ``monkeypatch`` win.
    return os.getenv("VECTOR_DB_PATH", _DEFAULT_PERSIST_PATH)


def default_collection_name() -> str:
    return os.getenv("VECTOR_DB_COLLECTION", _DEFAULT_COLLECTION)


@dataclass
class RetrievedDoc:
    """Result of a semantic search."""

    id: str
    text: str
    metadata: Mapping[str, Any] = field(default_factory=dict)
    score: float = 0.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "metadata": dict(self.metadata or {}),
            "score": float(self.score),
        }


class ChromaVectorStore:
    """Persistent Chroma collection with explicit-embedding ingestion/query."""

    def __init__(
        self,
        persist_path: Optional[str] = None,
        collection_name: Optional[str] = None,
    ) -> None:
        import chromadb
        from chromadb.config import Settings

        self.persist_path = persist_path or default_persist_path()
        self.collection_name = collection_name or default_collection_name()
        Path(self.persist_path).mkdir(parents=True, exist_ok=True)

        self._client = chromadb.PersistentClient(
            path=self.persist_path,
            settings=Settings(anonymized_telemetry=False, allow_reset=True),
        )
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "chroma store ready path=%s collection=%s count=%d",
            self.persist_path,
            self.collection_name,
            self._collection.count(),
        )

    @property
    def count(self) -> int:
        return self._collection.count()

    def add(
        self,
        ids: Sequence[str],
        texts: Sequence[str],
        embeddings: Sequence[Sequence[float]],
        metadatas: Optional[Sequence[Mapping[str, Any]]] = None,
    ) -> None:
        if not (len(ids) == len(texts) == len(embeddings)):
            raise ValueError("ids, texts, embeddings must have matching lengths")
        if metadatas is not None and len(metadatas) != len(ids):
            raise ValueError("metadatas length must match ids length")
        safe_metas = [
            _sanitize_metadata(m) if m else {"_": ""}
            for m in (metadatas or [{} for _ in ids])
        ]
        self._collection.upsert(
            ids=list(ids),
            documents=list(texts),
            embeddings=[list(e) for e in embeddings],
            metadatas=safe_metas,
        )

    def query(
        self,
        query_embedding: Sequence[float],
        top_k: int = 4,
        where: Optional[Mapping[str, Any]] = None,
    ) -> List[RetrievedDoc]:
        result = self._collection.query(
            query_embeddings=[list(query_embedding)],
            n_results=max(1, int(top_k)),
            where=dict(where) if where else None,
        )
        ids = (result.get("ids") or [[]])[0]
        docs = (result.get("documents") or [[]])[0]
        metas = (result.get("metadatas") or [[]])[0]
        dists = (result.get("distances") or [[]])[0]
        out: List[RetrievedDoc] = []
        for idx, doc_id in enumerate(ids):
            distance = float(dists[idx]) if idx < len(dists) else 0.0
            # Cosine distance → similarity score in [0, 1].
            score = max(0.0, 1.0 - distance)
            out.append(
                RetrievedDoc(
                    id=str(doc_id),
                    text=str(docs[idx]) if idx < len(docs) else "",
                    metadata=dict(metas[idx]) if idx < len(metas) and metas[idx] else {},
                    score=score,
                )
            )
        return out

    def delete(self, ids: Iterable[str]) -> int:
        ids_list = list(ids)
        if not ids_list:
            return 0
        self._collection.delete(ids=ids_list)
        return len(ids_list)

    def reset(self) -> None:
        """Drop and recreate this collection (destructive)."""
        self._client.delete_collection(self.collection_name)
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )


def _sanitize_metadata(meta: Mapping[str, Any]) -> dict:
    """Chroma only accepts scalar metadata values (str/int/float/bool)."""
    cleaned: dict = {}
    for key, value in meta.items():
        if value is None:
            continue
        if isinstance(value, (str, int, float, bool)):
            cleaned[str(key)] = value
        else:
            cleaned[str(key)] = str(value)
    return cleaned or {"_": ""}


@functools.lru_cache(maxsize=16)
def _cached_store(persist_path: str, collection: str) -> ChromaVectorStore:
    return ChromaVectorStore(persist_path=persist_path, collection_name=collection)


def get_store(
    persist_path: Optional[str] = None,
    collection: Optional[str] = None,
) -> ChromaVectorStore:
    """Return a cached :class:`ChromaVectorStore` singleton per (path, name)."""
    return _cached_store(
        persist_path or default_persist_path(),
        collection or default_collection_name(),
    )
