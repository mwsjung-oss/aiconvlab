"""RAG (Retrieval-Augmented Generation) subsystem.

- :mod:`embeddings` — OpenAI embedding wrapper with batching.
- :mod:`vector_store` — persistent Chroma store.
- :mod:`ingestion` — chunking + document ingestion helpers.
- :mod:`retriever` — semantic search + RAG-answer builders.
"""
from .embeddings import embed_query, embed_documents
from .vector_store import (
    ChromaVectorStore,
    RetrievedDoc,
    default_collection_name,
    default_persist_path,
    get_store,
)
from .ingestion import (
    Document,
    chunk_text,
    ingest_documents,
)
from .retriever import (
    RagAnswer,
    rag_answer,
    semantic_search,
)

__all__ = [
    "ChromaVectorStore",
    "Document",
    "RagAnswer",
    "RetrievedDoc",
    "chunk_text",
    "default_collection_name",
    "default_persist_path",
    "embed_documents",
    "embed_query",
    "get_store",
    "ingest_documents",
    "rag_answer",
    "semantic_search",
]
