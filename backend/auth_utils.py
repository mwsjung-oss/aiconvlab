"""비밀번호 해시 및 JWT."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7일
ADMIN_PANEL_TOKEN_HOURS = int(os.getenv("ADMIN_PANEL_TOKEN_HOURS", "24"))


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def _jwt_encode(claims: dict[str, Any]) -> str:
    """python-jose는 exp에 datetime을 넣으면 환경에 따라 직렬화 오류(500)가 날 수 있어 숫자로 넣음."""
    raw = jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)
    return raw.decode("utf-8") if isinstance(raw, bytes) else raw


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": int(expire.timestamp())})
    return _jwt_encode(to_encode)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def create_admin_panel_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=ADMIN_PANEL_TOKEN_HOURS)
    payload = {
        "sub": "admin_panel",
        "typ": "admin_panel",
        "exp": int(expire.timestamp()),
    }
    return _jwt_encode(payload)
