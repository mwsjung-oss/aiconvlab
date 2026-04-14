"""Pydantic 스키마."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str | None
    role: str
    is_active: bool
    is_email_verified: bool
    is_admin_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityLogOut(BaseModel):
    id: int
    user_id: int | None
    action: str
    detail: str | None
    ip_address: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class Message(BaseModel):
    message: str


class AdminPanelLogin(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class AdminPanelChangePassword(BaseModel):
    old_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)
