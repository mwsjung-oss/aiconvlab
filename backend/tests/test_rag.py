"""Offline tests for the RAG subsystem.

We exercise the real Chroma persistence (so breakage in chromadb surfaces
immediately), but stub out the embedding call so no network traffic happens.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SRC_DIR = Path(__file__).resolve().parent.parent / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

from services.rag.ingestion import chunk_text  # noqa: E402


def _fake_embedder(dim: int = 8):
    """Deterministic embedding that encodes length + first char code."""

    def _fn(texts, model=None):
        vectors = []
        for t in texts:
            vec = [0.0] * dim
            vec[0] = len(t) / 1000.0
            vec[1] = (ord(t[0]) if t else 0) / 256.0
            if "apple" in t.lower():
                vec[2] = 1.0
            if "server" in t.lower():
                vec[3] = 1.0
            vectors.append(vec)
        return vectors

    return _fn


@pytest.fixture()
def temp_store(tmp_path, monkeypatch):
    from services.rag import vector_store

    vector_store._cached_store.cache_clear()
    monkeypatch.setenv("VECTOR_DB_PATH", str(tmp_path / "vdb"))
    monkeypatch.setenv("VECTOR_DB_COLLECTION", "test-col")
    store = vector_store.get_store()
    yield store
    vector_store._cached_store.cache_clear()


def test_chunk_text_handles_paragraphs_and_overlap() -> None:
    body = ("This is sentence one. " * 20).strip()
    chunks = chunk_text(body, chunk_size=120, chunk_overlap=20)
    assert len(chunks) >= 2
    assert all(len(c) <= 130 for c in chunks)
    # Overlap: there must exist at least one substring shared between
    # consecutive chunks.
    overlap_pairs = sum(
        1 for a, b in zip(chunks, chunks[1:]) if set(a.split()) & set(b.split())
    )
    assert overlap_pairs >= 1


def test_chunk_text_rejects_bad_overlap() -> None:
    with pytest.raises(ValueError):
        chunk_text("abc" * 200, chunk_size=100, chunk_overlap=150)


def test_chunk_text_empty_returns_nothing() -> None:
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_ingest_and_query_roundtrip(temp_store, monkeypatch) -> None:
    from services.rag import ingestion, retriever

    monkeypatch.setattr(ingestion, "embed_documents", _fake_embedder())
    monkeypatch.setattr(retriever, "embed_query", lambda t, model=None: _fake_embedder()([t])[0])

    docs = [
        ingestion.Document(
            text="Apples are sweet fruits grown in orchards.",
            metadata={"source": "doc-a"},
            id="doc-a",
        ),
        ingestion.Document(
            text="Our production server runs FastAPI behind a reverse proxy.",
            metadata={"source": "doc-b"},
            id="doc-b",
        ),
    ]
    ids = ingestion.ingest_documents(docs, store=temp_store, chunk_size=300, chunk_overlap=30)
    assert ids
    assert temp_store.count == len(ids)

    hits = retriever.semantic_search(
        "Tell me about apple farming", top_k=2, store=temp_store
    )
    assert hits
    assert any("apple" in h.text.lower() for h in hits)


def test_rag_answer_returns_no_context_message_when_empty(temp_store, monkeypatch) -> None:
    from services.rag import retriever

    monkeypatch.setattr(
        retriever, "semantic_search", lambda *a, **kw: []
    )
    result = retriever.rag_answer("anything", store=temp_store, provider="openai")
    assert result.used_context is False
    assert "No relevant context" in result.answer
    assert result.sources == []


def test_rag_answer_passes_context_to_llm(temp_store, monkeypatch) -> None:
    from services.rag import retriever
    from services.rag.vector_store import RetrievedDoc

    fake_hits = [
        RetrievedDoc(
            id="d1",
            text="The APS platform uses FastAPI and Chroma.",
            metadata={"source": "intro"},
            score=0.9,
        )
    ]
    monkeypatch.setattr(retriever, "semantic_search", lambda *a, **kw: fake_hits)

    captured: dict = {}

    def fake_ask(provider, prompt):
        captured["provider"] = provider
        captured["prompt"] = prompt
        return "APS uses FastAPI and Chroma [1]."

    monkeypatch.setattr(retriever, "ask_llm", fake_ask)

    result = retriever.rag_answer("What does APS use?", store=temp_store, provider="openai")
    assert result.used_context is True
    assert result.sources[0].id == "d1"
    assert "[1]" in result.answer
    assert "FastAPI" in captured["prompt"]
