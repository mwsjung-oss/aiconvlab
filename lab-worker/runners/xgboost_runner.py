#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier


def run(cfg: dict[str, Any]) -> dict[str, Any]:
    p = cfg["local_csv_path"]
    df = pd.read_csv(p)
    target = cfg["target_column"]
    feats = cfg.get("feature_columns") or [c for c in df.columns if c != target]
    X = df[feats].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    y = pd.to_numeric(df[target], errors="coerce").fillna(0).astype(int)
    tst = float(cfg.get("test_size") or 0.2)
    rs = int(cfg.get("random_state") or 42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=tst, random_state=rs)
    clf = XGBClassifier(n_estimators=120, max_depth=6, random_state=42, eval_metric="logloss")
    clf.fit(X_train, y_train)
    preds = clf.predict(X_test)
    metrics = {"accuracy": float(accuracy_score(y_test, preds))}
    outp = Path(p).parent / "xgboost_model.joblib"
    joblib.dump({"model": clf, "features": feats, "target": target}, outp)
    return {
        "metrics": metrics,
        "trainer": "xgboost_runner",
        "model_relative": outp.name,
        "rows": len(df),
    }
