"""활동 이력 기록."""
from __future__ import annotations

import json
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from models import ActivityLog


def log_activity(
    db: Session,
    user_id: int | None,
    action: str,
    detail: Any = None,
    request: Request | None = None,
) -> None:
    ip = None
    if request and request.client:
        ip = request.client.host
    detail_str = None
    if detail is not None:
        if isinstance(detail, str):
            detail_str = detail
        else:
            try:
                detail_str = json.dumps(detail, ensure_ascii=False, default=str)
            except Exception:
                detail_str = str(detail)
    row = ActivityLog(
        user_id=user_id,
        action=action,
        detail=detail_str,
        ip_address=ip,
    )
    db.add(row)
    db.commit()
