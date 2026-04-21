"""Lightweight FastAPI app exposing the unified LLM chat gateway.

- Loads the repository root ``.env`` and ``backend/.env`` automatically so the
  same keys work whether the server is launched from the project root or from
  inside ``backend/``.
- Mounts the ``/api/chat/*`` router.
- Keeps a minimal dependency footprint so it can run without the heavy ML
  stack required by ``backend/main.py``.

Run:
    cd backend
    ..\\.venv\\Scripts\\python.exe -m uvicorn src.main:app --reload  # Windows
    # or equivalently from repo root:
    backend/.venv/Scripts/python.exe -m uvicorn src.main:app --reload --app-dir backend
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Resolve repo layout: <repo>/backend/src/main.py
_SRC_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SRC_DIR.parent
_REPO_ROOT = _BACKEND_DIR.parent

# Load .env in priority order. Later calls do NOT override earlier values unless
# override=True, so the repo-root .env wins (matches user's expectation that
# the project root .env holds OPENAI_API_KEY/GEMINI_API_KEY).
load_dotenv(_REPO_ROOT / ".env", override=False)
load_dotenv(_BACKEND_DIR / ".env", override=False)

# Make ``services`` importable when uvicorn runs with ``--app-dir backend``
# (in that case ``sys.path`` contains ``backend/`` but not ``backend/src``).
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

from contextlib import asynccontextmanager  # noqa: E402
from typing import AsyncIterator  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from api.agent import router as agent_router  # noqa: E402
from api.chat import router as chat_router  # noqa: E402
from api.rag import router as rag_router  # noqa: E402
from services.llm_gateway import has_gemini_key, has_openai_key  # noqa: E402

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("llm_app")


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "startup: openai_configured=%s gemini_configured=%s",
        has_openai_key(),
        has_gemini_key(),
    )
    missing = []
    if not has_openai_key():
        missing.append("OPENAI_API_KEY")
    if not has_gemini_key():
        missing.append("GEMINI_API_KEY")
    if missing:
        logger.warning(
            "missing env vars at startup: %s (requests for those providers "
            "will return 400 until they are set)",
            ", ".join(missing),
        )
    yield


app = FastAPI(
    title="AILab LLM Gateway",
    version="1.0.0",
    description="Minimal FastAPI service wrapping OpenAI + Gemini.",
    lifespan=_lifespan,
)

_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "*").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(rag_router)
app.include_router(agent_router)


@app.get("/")
def root() -> dict:
    return {
        "service": "ailab-llm-gateway",
        "docs": "/docs",
        "endpoints": {
            "chat_health": "/api/chat/health",
            "chat_test": "/api/chat/test",
            "rag_ingest": "/api/rag/ingest",
            "rag_query": "/api/rag/query",
            "rag_stats": "/api/rag/stats",
            "agent_list": "/api/agent/list",
            "agent_run": "/api/agent/run",
        },
    }
