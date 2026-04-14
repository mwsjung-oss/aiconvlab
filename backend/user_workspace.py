"""로그인 사용자별 데이터·모델·출력·이력 경로 (공유 워크스페이스 vs 개인 워크스페이스)."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from models import User

from storage_root import STORAGE_ROOT

# 공유(레거시) 경로: 마스터·Director·Technical Lead (AILAB_STORAGE_ROOT 기준)
SHARED_DATA_DIR = STORAGE_ROOT / "data"
SHARED_MODELS_DIR = STORAGE_ROOT / "models"
SHARED_OUTPUTS_DIR = STORAGE_ROOT / "outputs"
SHARED_HISTORY_FILE = STORAGE_ROOT / "experiment_history.json"

ALL_ACCESS_ROLES = frozenset({"master", "director", "technical_lead", "admin", "instructor"})


@dataclass(frozen=True)
class WorkspacePaths:
    data: Path
    models: Path
    outputs: Path
    logs: Path
    history_file: Path


def workspace_for_user(user: User) -> WorkspacePaths:
    if user.role in ALL_ACCESS_ROLES:
        return WorkspacePaths(
            data=SHARED_DATA_DIR,
            models=SHARED_MODELS_DIR,
            outputs=SHARED_OUTPUTS_DIR,
            logs=STORAGE_ROOT / "logs",
            history_file=SHARED_HISTORY_FILE,
        )
    root = SHARED_DATA_DIR / "workspaces" / str(user.id)
    return WorkspacePaths(
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
