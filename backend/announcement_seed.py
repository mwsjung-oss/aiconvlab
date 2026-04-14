"""기본 공지 1건 시드(제목 중복 시 스킵)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from models import Announcement

DEFAULT_ANNOUNCEMENT_TITLE = "데이터 확보 및 Featuring 완료(4월)"


def ensure_default_announcements(db: Session) -> None:
    q = db.query(Announcement).filter(Announcement.title == DEFAULT_ANNOUNCEMENT_TITLE)
    if q.first() is not None:
        return
    db.add(
        Announcement(
            title=DEFAULT_ANNOUNCEMENT_TITLE,
            content="",
            created_by=None,
        )
    )
    db.commit()
