#!/usr/bin/env python3
"""scikit-learn 기반 학습 — 분류·회귀·(간단) 이상탐지."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, r2_score
from sklearn.model_selection import train_test_split


def run(cfg: dict[str, Any]) -> dict[str, Any]:
    p = cfg.get("local_csv_path")
    if not p:
        raise ValueError("local_csv_path required")
    df = pd.read_csv(p)
    target = cfg["target_column"]
    feats = cfg.get("feature_columns")
    if not feats:
        feats = [c for c in df.columns if c != target]

    task = cfg.get("task") or "classification"
    model_type = (cfg.get("model_type") or "").lower()

    X = df[feats].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    y = pd.to_numeric(df[target], errors="coerce").fillna(0.0)
    tst = float(cfg.get("test_size") or 0.2)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=tst, random_state=int(cfg.get("random_state") or 42)
    )

    artifacts = Path(Path(p).parent) / "_artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    model_path = artifacts / "model.joblib"

    if task == "anomaly_detection":
        from sklearn.ensemble import IsolationForest

        iso = IsolationForest(random_state=42)
        iso.fit(X_train)
        joblib.dump(
            {"model": iso, "features": feats, "target": target, "task": task, "mode": "anomaly_detection"},
            model_path,
        )
        return {
            "metrics": {},
            "model_relative": model_path.name,
            "task": task,
            "rows": len(df),
            "trainer": "sklearn_runner",
            "serialized": json.dumps({}, default=str),
        }

    if task == "classification":
        from sklearn.ensemble import RandomForestClassifier

        if "xgboost" in model_type:
            from runners import xgboost_runner

            return xgboost_runner.run(cfg)
        clf = RandomForestClassifier(n_estimators=100, random_state=42)
        clf.fit(X_train, y_train)
        preds = clf.predict(X_test)
        metrics = {"accuracy": float(accuracy_score(y_test, preds))}
        joblib.dump(
            {"model": clf, "features": feats, "target": target, "task": task},
            model_path,
        )
    else:
        from sklearn.linear_model import Ridge

        reg = Ridge(alpha=1.0, random_state=42)
        reg.fit(X_train, y_train)
        preds = reg.predict(X_test)
        metrics = {"r2": float(r2_score(y_test, preds))}
        joblib.dump(
            {"model": reg, "features": feats, "target": target, "task": task},
            model_path,
        )

    return {
        "metrics": metrics,
        "model_relative": model_path.name,
        "task": task,
        "rows": len(df),
        "trainer": "sklearn_runner",
        "serialized": json.dumps(metrics, default=float),
    }
