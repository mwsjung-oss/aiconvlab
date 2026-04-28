"""로그인 사용자별 데이터 경로(object 스토리지 모드에서는 temp staging + 브라우저 동기화)."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from models import User

from storage_root import STORAGE_ROOT


def uses_object_workspace() -> bool:
    """STORAGE_BACKEND 이 s3|r2 인지(blob_storage 패키지 import 없음)."""
    return (os.getenv("STORAGE_BACKEND") or "local").strip().lower() in ("s3", "r2")


@dataclass(frozen=True)
class WorkspacePaths:
    """staging_anchor 기준 상대경로가 객체 키에 매핑됩니다(workspace_scope 접두사)."""

    workspace_scope: str
    staging_anchor: Path
    data: Path
    models: Path
    outputs: Path
    logs: Path
    history_file: Path


ALL_ACCESS_ROLES = frozenset({"master", "director", "technical_lead", "admin", "instructor"})
_SHARED_HISTORY_FILE_LEGACY = STORAGE_ROOT / "experiment_history.json"

# 부팅 시 공유 디렉터리 보장 등 레거시 import 용(STORAGE_ROOT 기준 로컬 경로만).
SHARED_DATA_DIR = STORAGE_ROOT / "data"
SHARED_MODELS_DIR = STORAGE_ROOT / "models"
SHARED_OUTPUTS_DIR = STORAGE_ROOT / "outputs"
SHARED_HISTORY_FILE = STORAGE_ROOT / "experiment_history.json"


def workspace_for_user(user: User) -> WorkspacePaths:
    if uses_object_workspace():
        if user.role in ALL_ACCESS_ROLES:
            staging = Path(tempfile.gettempdir()) / "ailab_ws_shared"
            scope = "shared/global"
        else:
            staging = Path(tempfile.gettempdir()) / "ailab_ws" / str(user.id)
            scope = f"workspaces/{user.id}"
        data = staging / "data"
        models = staging / "models"
        outputs = staging / "outputs"
        logs = staging / "logs"
        hist = staging / "experiment_history.json"
        return WorkspacePaths(
            workspace_scope=scope,
            staging_anchor=staging.resolve(),
            data=data,
            models=models,
            outputs=outputs,
            logs=logs,
            history_file=hist,
        )

    # 로컬/개발 레거시: STORAGE_ROOT 레이아웃 유지
    shared_data = STORAGE_ROOT / "data"
    shared_models = STORAGE_ROOT / "models"
    shared_outputs = STORAGE_ROOT / "outputs"
    if user.role in ALL_ACCESS_ROLES:
        return WorkspacePaths(
            workspace_scope="",
            staging_anchor=STORAGE_ROOT.resolve(),
            data=shared_data,
            models=shared_models,
            outputs=shared_outputs,
            logs=STORAGE_ROOT / "logs",
            history_file=SHARED_HISTORY_FILE.resolve(),
        )
    root = shared_data / "workspaces" / str(user.id)
    return WorkspacePaths(
        workspace_scope="",
        staging_anchor=root.resolve(),
        data=root / "data",
        models=root / "models",
        outputs=root / "outputs",
        logs=root / "logs",
        history_file=root / "experiment_history.json",
    )


def ensure_workspace_dirs(ws: WorkspacePaths) -> None:
    ws.data.mkdir(parents=True, exist_ok=True)
    ws.models.mkdir(parents=True, exist_ok=True)
    ws.outputs.mkdir(parents=True, exist_ok=True)
    ws.logs.mkdir(parents=True, exist_ok=True)
    ws.history_file.parent.mkdir(parents=True, exist_ok=True)
