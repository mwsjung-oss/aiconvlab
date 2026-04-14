"""관리자 패널 비밀번호 (파일 저장, 초기값 secu9041 또는 환경변수)."""
from __future__ import annotations

import json
import os
from pathlib import Path

from auth_utils import hash_password, verify_password
from storage_root import STORAGE_ROOT

ADMIN_PANEL_FILE = STORAGE_ROOT / "data" / "admin_panel.json"

DEFAULT_PLAIN_PASSWORD = "secu9041"


def _ensure_file_dir() -> None:
    ADMIN_PANEL_FILE.parent.mkdir(parents=True, exist_ok=True)


def ensure_admin_password_file() -> None:
    """최초 기동 시 파일이 없으면 기본 비밀번호로 해시 저장."""
    if ADMIN_PANEL_FILE.is_file():
        return
    _ensure_file_dir()
    plain = os.getenv("ADMIN_PANEL_PASSWORD", DEFAULT_PLAIN_PASSWORD)
    data = {"hashed_password": hash_password(plain)}
    ADMIN_PANEL_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_password_hash() -> str:
    ensure_admin_password_file()
    data = json.loads(ADMIN_PANEL_FILE.read_text(encoding="utf-8"))
    return data["hashed_password"]


def verify_admin_plain(plain: str) -> bool:
    plain = (plain or "").strip()
    if not plain:
        return False
    return verify_password(plain, get_password_hash())


def set_password_plain(new_plain: str) -> None:
    _ensure_file_dir()
    data = {"hashed_password": hash_password(new_plain)}
    ADMIN_PANEL_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
