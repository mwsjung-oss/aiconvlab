"""SQLite 데이터베이스 연결 및 세션."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from storage_root import STORAGE_ROOT

DB_PATH = STORAGE_ROOT / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
