"""실험 데이터·모델·DB 저장 위치. 연구실 서버에서 별도 디스크를 쓰려면 AILAB_STORAGE_ROOT 를 설정."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(_BACKEND_DIR / ".env")


def get_storage_root() -> Path:
    raw = (os.getenv("AILAB_STORAGE_ROOT") or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return _BACKEND_DIR


STORAGE_ROOT = get_storage_root()
