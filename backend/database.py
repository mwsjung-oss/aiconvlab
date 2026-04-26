"""데이터베이스 연결 및 세션 (PostgreSQL 우선, 미설정 시 SQLite)."""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

from storage_root import STORAGE_ROOT

logger = logging.getLogger(__name__)

# standalone 스크립트/REPL에서도 backend/.env 값을 읽도록 보강
_BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(_BACKEND_ROOT / ".env")

DB_PATH = STORAGE_ROOT / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_DEFAULT_SQLITE_URL = f"sqlite:///{DB_PATH.as_posix()}"


def _normalize_postgres_url(url: str) -> str:
    """Render External URL 등 `postgresql://` → 드라이버 접두사 `postgresql+psycopg://` 로 통일."""
    u = url.strip()
    if u.startswith("postgresql+psycopg://"):
        return u
    if u.startswith("postgres://"):
        return "postgresql+psycopg://" + u[len("postgres://") :]
    if u.startswith("postgresql://"):
        return "postgresql+psycopg://" + u[len("postgresql://") :]
    return u


_RAW_DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
DATABASE_URL = (
    _normalize_postgres_url(_RAW_DATABASE_URL)
    if _RAW_DATABASE_URL
    else _DEFAULT_SQLITE_URL
)
IS_SQLITE = DATABASE_URL.startswith("sqlite:")

_CONNECT_TIMEOUT = int((os.getenv("DATABASE_CONNECT_TIMEOUT") or "10").strip() or "10")


def database_url_for_logs(url: str | None = None) -> str:
    """로그용 URL(비밀번호 마스킹)."""
    u = url or DATABASE_URL
    try:
        return re.sub(r"://([^:/@]+):([^@]+)@", r"://\1:***@", u)
    except Exception:
        return "<unparseable>"


def _warn_production_database_url() -> None:
    """운영에서 localhost/내부망 Postgres URL 사용 시 명확히 경고."""
    ailab_env = (os.getenv("AILAB_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    if ailab_env != "production":
        return
    if IS_SQLITE:
        logger.warning(
            "AILAB_ENV=production 인데 SQLite를 사용 중입니다. "
            "Render·운영에서는 PostgreSQL과 DATABASE_URL(External Database URL) 사용을 권장합니다."
        )
        return
    lowered = DATABASE_URL.lower()
    bad_local = (
        "localhost" in lowered
        or "127.0.0.1" in lowered
        or ".internal" in lowered
        or ".local" in lowered
    )
    if bad_local:
        logger.error(
            "운영(AILAB_ENV=production)에서 DATABASE_URL이 localhost/내부 호스트를 가리킵니다. "
            "Render 대시보드의 PostgreSQL **External** Database URL을 DATABASE_URL에 설정하세요. "
            "(현재=%s)",
            database_url_for_logs(),
        )


_warn_production_database_url()

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
        connect_args={
            "connect_timeout": _CONNECT_TIMEOUT,
        },
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


def test_database_connection() -> None:
    """서버 기동 시 1회: 연결 가능 여부 확인. 실패 시 예외로 기동을 중단합니다."""
    label = "SQLite" if IS_SQLITE else "PostgreSQL"
    masked = database_url_for_logs()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(
            "데이터베이스 연결 확인 완료 (backend=%s, connect_timeout_s=%s, url=%s)",
            label,
            _CONNECT_TIMEOUT if not IS_SQLITE else "N/A(sqlite)",
            masked,
        )
    except OperationalError as e:
        logger.error(
            "데이터베이스 연결 실패 (%s). "
            "Render라면 Internal이 아닌 External URL·비밀번호·DATABASE_URL 동기화를 확인하세요. "
            "url=%s 원인=%s",
            label,
            masked,
            e,
        )
        raise RuntimeError(
            f"DATABASE 연결 실패 ({label}). "
            "postgresql://… External Database URL과 DATABASE_CONNECT_TIMEOUT(기본 10초)을 확인하세요."
        ) from e
    except Exception:
        logger.exception(
            "데이터베이스 연결 테스트 중 예기치 않은 오류 (url=%s)",
            masked,
        )
        raise
