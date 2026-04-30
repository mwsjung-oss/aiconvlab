"""데이터베이스 연결: RDS PostgreSQL(운영), SQLite(로컬 개발 선택 폴백)."""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(_BACKEND_ROOT / ".env")


def _normalize_postgres_url(url: str) -> str:
    u = url.strip()
    if u.startswith("postgresql+psycopg://"):
        return u
    if u.startswith("postgres://"):
        return "postgresql+psycopg://" + u[len("postgres://") :]
    if u.startswith("postgresql://"):
        return "postgresql+psycopg://" + u[len("postgresql://") :]
    return u


def database_url_for_logs(url: str | None = None) -> str:
    u = url or DATABASE_URL
    try:
        if "sqlite" in u.lower():
            return re.sub(r"/([^/]+)$", "/***.sqlite3", u)
        return re.sub(r"://([^:/@]+):([^@]+)@", r"://\1:***@", u)
    except Exception:
        return "<unparseable>"


def _is_production_env() -> bool:
    return (
        (os.getenv("AILAB_ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
        in ("production", "prod")
    )


_raw = (os.getenv("APS_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
_sqlite_fb = (os.getenv("APS_SQLITE_FALLBACK_DEV") or "").strip().lower() in (
    "1",
    "true",
    "yes",
)
if not _raw and _sqlite_fb and not _is_production_env():
    _data_dir = _BACKEND_ROOT / "data"
    _data_dir.mkdir(parents=True, exist_ok=True)
    _raw = f"sqlite+pysqlite:///{(_data_dir / 'aps_dev.sqlite3').as_posix()}"
    logger.warning(
        "APS_SQLITE_FALLBACK_DEV 활성: SQLite 개발 DB 파일 %s 사용(운영 RDS 아님).",
        _data_dir / "aps_dev.sqlite3",
    )

if not _raw:
    raise RuntimeError(
        "APS_DATABASE_URL 또는 DATABASE_URL 이 필요합니다. "
        "AWS RDS PostgreSQL 연결 문자열을 설정하세요. "
        "로컬 개발 전용 SQLite는 APS_SQLITE_FALLBACK_DEV=true 와 함께 비워 둘 수 있습니다."
    )

_IS_SQLITE = _raw.lower().startswith("sqlite")

if _IS_SQLITE:
    if _is_production_env():
        raise RuntimeError(
            "운영(ENVIRONMENT=production)에서는 SQLite를 사용할 수 없습니다. RDS PostgreSQL(APS_DATABASE_URL)을 설정하세요."
        )
    DATABASE_URL = _raw
else:
    DATABASE_URL = _normalize_postgres_url(_raw)
    if not DATABASE_URL.startswith("postgresql"):
        raise RuntimeError(
            "PostgreSQL URL이어야 합니다(postgresql://… 또는 postgres://…). "
            f"현재={database_url_for_logs(DATABASE_URL)}"
        )

    _PG_URL = make_url(DATABASE_URL)
    _HOST = (
        (_PG_URL.host or "").strip().lower()
        if _PG_URL.drivername.startswith("postgresql")
        else ""
    )
    _BLOCKED_HOSTS = frozenset({"", "localhost", "127.0.0.1", "::1", "0.0.0.0"})
    _allow_local_pg = (os.getenv("ALLOW_LOCAL_DATABASE") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    _is_prod_like = _is_production_env()

    if _HOST in _BLOCKED_HOSTS:
        dev_ok = _allow_local_pg and not _is_prod_like
        if not dev_ok:
            raise RuntimeError(
                "DATABASE_URL 원격 호스트만 허용(loopback 불가). "
                "로컬 Postgres 개발만 ALLOW_LOCAL_DATABASE=true 와 함께 사용하세요. "
                f"(host={_HOST or '<비어있음>'})"
            )


_CONNECT_TIMEOUT = int((os.getenv("DATABASE_CONNECT_TIMEOUT") or "10").strip() or "10")


def _warn_production_database_url() -> None:
    if not _is_production_env():
        return
    lowered = DATABASE_URL.lower()
    bad_internal = ".internal" in lowered or ".local" in lowered
    if bad_internal and not _IS_SQLITE:
        logger.error(
            "운영 DATABASE_URL 이 내부 전용 호스트를 가리킬 수 있습니다. RDS External 엔드포인트 확인. url=%s",
            database_url_for_logs(),
        )


_warn_production_database_url()

if _IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_database_connection() -> None:
    masked = database_url_for_logs()
    backend = "SQLite(dev)" if _IS_SQLITE else "PostgreSQL"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(
            "데이터베이스 연결 확인 완료 (backend=%s, url=%s)",
            backend,
            masked,
        )
    except OperationalError as e:
        orig = getattr(e, "orig", None)
        pgcode = getattr(orig, "pgcode", None) if orig is not None else None
        logger.error(
            "PostgreSQL(RDS) 연결 실패 — url=%s | OperationalError=%r | 원인 클래스=%s | pgcode=%s",
            masked,
            e,
            type(orig).__name__ if orig is not None else None,
            pgcode,
        )
        logger.error(
            "RDS 접속 점검: RDS 엔드포인트 호스트명·포트(%s), VPC 보안그룹 inbound(5432), "
            "사용자/비밀번호, RDS Public accessibility / PrivateLink 여부.",
            DATABASE_URL.split("@")[-1][:80] if "@" in DATABASE_URL else DATABASE_URL[:80],
        )
        raise RuntimeError(
            f"데이터베이스 연결 실패입니다. {backend} URL·방화벽·보안그룹을 확인하세요."
        ) from e
    except Exception:
        logger.exception("데이터베이스 연결 테스트 예외 (url=%s)", masked)
        raise
