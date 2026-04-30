#!/usr/bin/env python3
from __future__ import annotations

from typing import Any


def run_train_job_from_message(cfg: dict[str, Any]) -> dict[str, Any]:
    task = cfg.get("task") or "classification"
    mt = (cfg.get("model_type") or "").lower()

    if task == "time_series" or mt in ("tft",):
        from runners import tft_runner

        return tft_runner.run(cfg)

    if "xgboost" in mt:
        from runners import xgboost_runner

        return xgboost_runner.run(cfg)

    if mt.startswith("torch") or "pytorch" in mt:
        from runners import pytorch_runner

        return pytorch_runner.run(cfg)

    if mt in ("yolo", "yolov8"):
        from runners import yolo_runner

        return yolo_runner.run(cfg)

    from runners import sklearn_runner

    return sklearn_runner.run(cfg)
