"""Pytest: CI의 DATABASE_URL 우선; 없으면 SQLite 개발 폴백."""
import os

if not os.getenv("DATABASE_URL") and not os.getenv("APS_DATABASE_URL"):
    os.environ.setdefault("APS_SQLITE_FALLBACK_DEV", "1")

os.environ.setdefault("APS_DISABLE_SQS_PUBLISH", "1")
os.environ.setdefault("APS_STORAGE_LOCAL", "1")
