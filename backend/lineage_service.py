"""학습·예측 계보 엣지 기록."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import LineageEdge


def record_edge(
    db: Session,
    *,
    user_id: int | None,
    from_kind: str,
    from_ref: str,
    to_kind: str,
    to_ref: str,
    meta: dict[str, Any] | None = None,
) -> None:
    db.add(
        LineageEdge(
            user_id=user_id,
            from_kind=from_kind,
            from_ref=from_ref[:512],
            to_kind=to_kind,
            to_ref=to_ref[:512],
            meta_json=json.dumps(meta or {}, ensure_ascii=False),
        )
    )
    db.commit()


def lineage_for_model(db: Session, model_id: str) -> list[dict[str, Any]]:
    """모델 ID와 연결된 엣지(양방향 조회)."""
    rows = (
        db.query(LineageEdge)
        .filter(
            or_(LineageEdge.from_ref == model_id, LineageEdge.to_ref == model_id)
        )
        .order_by(LineageEdge.created_at.desc())
        .limit(500)
        .all()
    )
    out = []
    for r in rows:
        try:
            meta = json.loads(r.meta_json or "{}")
        except json.JSONDecodeError:
            meta = {}
        out.append(
            {
                "id": r.id,
                "from_kind": r.from_kind,
                "from_ref": r.from_ref,
                "to_kind": r.to_kind,
                "to_ref": r.to_ref,
                "meta": meta,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
            }
        )
    return out
