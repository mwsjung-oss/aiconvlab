"""SQLite -> PostgreSQL 전체 데이터 마이그레이션 유틸리티.

사용 예시:
  python migrate_sqlite_to_postgres.py --pg-url "postgresql+psycopg://user:pass@host:5432/ailab" --truncate-target

기본 SQLite 경로:
  STORAGE_ROOT/data/app.db
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import MetaData, create_engine, func, select, text
from sqlalchemy.engine import Engine

import models  # noqa: F401
from database import Base
from storage_root import STORAGE_ROOT

DEFAULT_SQLITE_PATH = STORAGE_ROOT / "data" / "app.db"


@dataclass
class TableStat:
    table: str
    source_count: int
    target_count: int


def _count_rows(engine: Engine, metadata: MetaData, table_name: str) -> int:
    table = metadata.tables[table_name]
    with engine.connect() as conn:
        return int(conn.execute(select(func.count()).select_from(table)).scalar_one())


def _truncate_target(conn, metadata: MetaData) -> None:  # type: ignore[no-untyped-def]
    """FK 순서를 피하기 위해 PostgreSQL에서는 TRUNCATE ... CASCADE 사용."""
    table_names = list(metadata.tables.keys())
    if not table_names:
        return
    quoted = ", ".join(f'"{name}"' for name in table_names)
    conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))


def _reset_postgres_sequences(conn, metadata: MetaData) -> None:  # type: ignore[no-untyped-def]
    for table in metadata.sorted_tables:
        pk_cols = [c for c in table.columns if c.primary_key]
        if len(pk_cols) != 1:
            continue
        pk_col = pk_cols[0]
        if not str(pk_col.type).upper().startswith(("INTEGER", "BIGINT", "SMALLINT")):
            continue
        table_name = table.name
        col_name = pk_col.name
        # SERIAL/IDENTITY 시퀀스를 찾아 현재 max(pk) 이후로 맞춥니다.
        seq_sql = text("SELECT pg_get_serial_sequence(:table_name, :column_name)")
        seq_name = conn.execute(
            seq_sql, {"table_name": table_name, "column_name": col_name}
        ).scalar_one_or_none()
        if not seq_name:
            continue
        setval_sql = text(
            f"SELECT setval(:seq_name, COALESCE((SELECT MAX(\"{col_name}\") FROM \"{table_name}\"), 1), true)"
        )
        conn.execute(setval_sql, {"seq_name": seq_name})


def _copy_table_data(
    source_engine: Engine,
    source_meta: MetaData,
    target_conn,
    target_meta: MetaData,
    table_name: str,
    batch_size: int = 1000,
) -> int:
    src = source_meta.tables[table_name]
    dst = target_meta.tables[table_name]
    dst_cols = {c.name for c in dst.columns}
    inserted = 0
    with source_engine.connect() as source_conn:
        result = source_conn.execute(select(src))
        while True:
            rows = result.fetchmany(batch_size)
            if not rows:
                break
            payload = [
                {k: v for k, v in dict(r._mapping).items() if k in dst_cols}
                for r in rows
            ]
            target_conn.execute(dst.insert(), payload)
            inserted += len(payload)
    return inserted


def migrate(sqlite_url: str, postgres_url: str, truncate_target: bool) -> list[TableStat]:
    src_engine = create_engine(sqlite_url)
    dst_engine = create_engine(postgres_url, pool_pre_ping=True)

    src_meta = MetaData()
    src_meta.reflect(bind=src_engine)
    if not src_meta.tables:
        raise RuntimeError("SQLite 소스 DB에 테이블이 없습니다.")

    # PostgreSQL 스키마는 애플리케이션 SQLAlchemy 모델을 기준으로 생성합니다.
    dst_meta = MetaData()
    Base.metadata.create_all(bind=dst_engine)
    dst_meta.reflect(bind=dst_engine)

    src_tables = set(src_meta.tables.keys())
    dst_tables = set(dst_meta.tables.keys())
    missing = sorted(src_tables - dst_tables)
    if missing:
        raise RuntimeError(f"대상 PostgreSQL에 생성되지 않은 테이블이 있습니다: {missing}")

    stats: list[TableStat] = []
    with dst_engine.begin() as conn:
        if truncate_target:
            _truncate_target(conn, dst_meta)
        else:
            # 덮어쓰기 방지: 테이블 중 하나라도 데이터가 있으면 중단
            for t in dst_meta.sorted_tables:
                cnt = int(conn.execute(select(func.count()).select_from(t)).scalar_one())
                if cnt > 0:
                    raise RuntimeError(
                        "대상 PostgreSQL이 비어있지 않습니다. --truncate-target 옵션으로 재실행하세요."
                    )

        ordered_table_names = [t.name for t in dst_meta.sorted_tables if t.name in src_meta.tables]
        for table_name in ordered_table_names:
            copied = _copy_table_data(
                source_engine=src_engine,
                source_meta=src_meta,
                target_conn=conn,
                target_meta=dst_meta,
                table_name=table_name,
            )
            stats.append(TableStat(table=table_name, source_count=copied, target_count=copied))

        _reset_postgres_sequences(conn, dst_meta)

    # 트랜잭션 커밋 후 검증(행 수 비교)
    verified: list[TableStat] = []
    for s in stats:
        src_count = _count_rows(src_engine, src_meta, s.table)
        dst_count = _count_rows(dst_engine, dst_meta, s.table)
        verified.append(TableStat(table=s.table, source_count=src_count, target_count=dst_count))
        if src_count != dst_count:
            raise RuntimeError(
                f"검증 실패: {s.table} source={src_count}, target={dst_count}"
            )

    src_engine.dispose()
    dst_engine.dispose()
    return verified


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate SQLite database to PostgreSQL.")
    parser.add_argument(
        "--sqlite-path",
        default=str(DEFAULT_SQLITE_PATH),
        help="소스 SQLite 파일 경로 (기본: STORAGE_ROOT/data/app.db)",
    )
    parser.add_argument(
        "--pg-url",
        default=(os.getenv("DATABASE_URL") or "").strip(),
        help="대상 PostgreSQL SQLAlchemy URL. 미입력 시 DATABASE_URL 사용.",
    )
    parser.add_argument(
        "--truncate-target",
        action="store_true",
        help="대상 DB를 TRUNCATE(RESTART IDENTITY CASCADE) 후 이관.",
    )
    args = parser.parse_args()

    sqlite_path = Path(args.sqlite_path).resolve()
    if not sqlite_path.is_file():
        print(f"[ERROR] SQLite 파일이 없습니다: {sqlite_path}", file=sys.stderr)
        return 1
    sqlite_url = f"sqlite:///{sqlite_path.as_posix()}"

    pg_url = args.pg_url
    if not pg_url:
        print("[ERROR] PostgreSQL URL이 필요합니다. --pg-url 또는 DATABASE_URL 설정", file=sys.stderr)
        return 1
    if not pg_url.startswith(("postgresql://", "postgresql+psycopg://")):
        print(
            "[ERROR] --pg-url 은 PostgreSQL URL이어야 합니다. 예: postgresql+psycopg://user:pass@host:5432/db",
            file=sys.stderr,
        )
        return 1

    print(f"[INFO] Source SQLite: {sqlite_path}")
    print("[INFO] Target PostgreSQL: configured")
    print(f"[INFO] truncate_target={args.truncate_target}")
    try:
        stats = migrate(
            sqlite_url=sqlite_url,
            postgres_url=pg_url,
            truncate_target=args.truncate_target,
        )
    except Exception as exc:
        print(f"[ERROR] Migration failed: {exc}", file=sys.stderr)
        return 2

    print("[OK] Migration + verification completed")
    for s in stats:
        print(f"  - {s.table}: {s.source_count} -> {s.target_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
