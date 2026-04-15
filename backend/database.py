"""데이터베이스 연결 및 세션 (PostgreSQL 우선, 미설정 시 SQLite)."""
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

from storage_root import STORAGE_ROOT

# standalone 스크립트/REPL에서도 backend/.env 값을 읽도록 보강
_BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(_BACKEND_ROOT / ".env")

DB_PATH = STORAGE_ROOT / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_DEFAULT_SQLITE_URL = f"sqlite:///{DB_PATH.as_posix()}"
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip() or _DEFAULT_SQLITE_URL
IS_SQLITE = DATABASE_URL.startswith("sqlite:")

if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "check_same_thread": False,
            # 동시 쓰기 경합 시 즉시 실패하지 않고 잠시 대기합니다.
            "timeout": 30,
        },
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=1800,
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
    """SQLite 동시성/안정성 관련 PRAGMA를 연결 시 적용."""
    if not IS_SQLITE:
        return
    cursor = dbapi_connection.cursor()
    try:
        # 읽기/쓰기 동시성을 개선해 "database is locked" 빈도를 줄입니다.
        cursor.execute("PRAGMA journal_mode=WAL")
        # 락 해제 대기 시간을 늘려 일시적 락 경쟁을 흡수합니다.
        cursor.execute("PRAGMA busy_timeout=30000")
        # WAL 모드에서 권장되는 동기화 레벨(내구성/성능 균형).
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
