"""YOLO 감지·세그먼트 — 선택 설치 필요."""
from __future__ import annotations

from typing import Any


def run(_cfg: dict[str, Any]) -> dict[str, Any]:
    raise NotImplementedError("yolo_runner: ultralytics 패키지 설치 필요")
