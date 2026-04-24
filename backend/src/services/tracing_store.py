"""
Experiment V3 · Tracing 저장소 (SQLite)
------------------------------------------------------------
`backend/data/app.db` 에 전용 테이블 `experiment_traces_v3` 를 만든다.
스키마는 플랜 문서 기준.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Iterable, List, Optional

_LOG = logging.getLogger("tracing_store")

_DB_LOCK = threading.Lock()

DEFAULT_DB_PATH = os.environ.get(
    "TRACING_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "app.db"),
)


def _db_path() -> str:
    p = os.path.abspath(DEFAULT_DB_PATH)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


@contextmanager
def _connect():
    conn = sqlite3.connect(_db_path(), timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with _DB_LOCK, _connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS experiment_traces_v3 (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                activity_id TEXT NOT NULL,
                cell_id TEXT,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                outputs_json TEXT,
                execution_count INTEGER,
                duration_ms INTEGER,
                deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_traces_v3_user_stage ON experiment_traces_v3(user_id, stage, activity_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_traces_v3_created_at ON experiment_traces_v3(created_at DESC)"
        )


def _ensure_id(v: Optional[str]) -> str:
    if isinstance(v, str) and v:
        return v
    return f"trace_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"


def record(
    *,
    user_id: str,
    stage: str,
    activity_id: str,
    kind: str,
    content: str,
    cell_id: Optional[str] = None,
    outputs_json: Optional[str] = None,
    execution_count: Optional[int] = None,
    duration_ms: Optional[int] = None,
    id: Optional[str] = None,
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    """신규 트레이스 1건 기록. 기존 id 가 충돌하면 upsert(덮어쓰기)."""
    tid = _ensure_id(id)
    ts = created_at or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with _DB_LOCK, _connect() as conn:
        conn.execute(
            """
            INSERT INTO experiment_traces_v3
                (id, user_id, stage, activity_id, cell_id, kind, content,
                 outputs_json, execution_count, duration_ms, deleted, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,0,?)
            ON CONFLICT(id) DO UPDATE SET
              user_id=excluded.user_id,
              stage=excluded.stage,
              activity_id=excluded.activity_id,
              cell_id=excluded.cell_id,
              kind=excluded.kind,
              content=excluded.content,
              outputs_json=excluded.outputs_json,
              execution_count=excluded.execution_count,
              duration_ms=excluded.duration_ms,
              created_at=excluded.created_at
            """,
            (
                tid,
                user_id,
                stage,
                activity_id,
                cell_id,
                kind,
                (content or "")[:20000],
                outputs_json,
                execution_count,
                duration_ms,
                ts,
            ),
        )
    return {
        "id": tid,
        "user_id": user_id,
        "stage": stage,
        "activity_id": activity_id,
        "cell_id": cell_id,
        "kind": kind,
        "content": content,
        "outputs_json": outputs_json,
        "execution_count": execution_count,
        "duration_ms": duration_ms,
        "created_at": ts,
    }


def list_traces(
    *,
    user_id: Optional[str] = None,
    stage: Optional[str] = None,
    activity_id: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    q = "SELECT * FROM experiment_traces_v3 WHERE deleted=0"
    args: List[Any] = []
    if user_id:
        q += " AND user_id=?"
        args.append(user_id)
    if stage:
        q += " AND stage=?"
        args.append(stage)
    if activity_id:
        q += " AND activity_id=?"
        args.append(activity_id)
    q += " ORDER BY created_at DESC LIMIT ?"
    args.append(max(1, min(500, int(limit or 100))))
    with _DB_LOCK, _connect() as conn:
        rows = conn.execute(q, tuple(args)).fetchall()
    return [dict(r) for r in rows]


def soft_delete(trace_id: str) -> bool:
    with _DB_LOCK, _connect() as conn:
        cur = conn.execute(
            "UPDATE experiment_traces_v3 SET deleted=1 WHERE id=?",
            (trace_id,),
        )
        return cur.rowcount > 0


def export_markdown(items: Iterable[Dict[str, Any]]) -> str:
    lines = ["# Experiment V3 Traces", ""]
    for t in items:
        lines.append(
            f"## [{t.get('created_at')}] {t.get('stage')} / {t.get('activity_id')} · {t.get('kind')}"
        )
        if t.get("cell_id"):
            lines.append(f"- cell_id: `{t['cell_id']}`")
        if t.get("duration_ms") is not None:
            lines.append(f"- duration: {t['duration_ms']}ms")
        if t.get("execution_count") is not None:
            lines.append(f"- execution_count: {t['execution_count']}")
        content = t.get("content") or ""
        lines.append("")
        lines.append("```")
        lines.append(content)
        lines.append("```")
        outputs = t.get("outputs_json")
        if outputs:
            try:
                parsed = (
                    outputs if isinstance(outputs, list) else json.loads(outputs)
                )
                lines.append("- outputs:")
                for o in parsed:
                    lines.append(f"  - {o.get('type', '?')}")
            except Exception:
                pass
        lines.append("")
    return "\n".join(lines)


# --- migration helper ------------------------------------------------
try:
    init_db()
except Exception as exc:  # pragma: no cover - 초기화 실패는 api 마운트 시점에 노출
    _LOG.warning("tracing_store init failed: %s", exc)
