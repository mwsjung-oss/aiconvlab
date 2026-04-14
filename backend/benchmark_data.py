"""내장 벤치마크 CSV 생성(리더보드 검증용)."""
from __future__ import annotations

from pathlib import Path

from storage_root import STORAGE_ROOT

BENCHMARK_DIR = STORAGE_ROOT / "benchmarks"
# 키 → 파일명 (data/benchmarks 또는 STORAGE_ROOT/benchmarks)
BUILTIN_DATASETS: dict[str, str] = {
    "builtin_iris_binary": "builtin_iris_binary.csv",
}


def ensure_builtin_datasets() -> None:
    BENCHMARK_DIR.mkdir(parents=True, exist_ok=True)
    target = BENCHMARK_DIR / BUILTIN_DATASETS["builtin_iris_binary"]
    if target.is_file():
        return
    try:
        from sklearn.datasets import load_iris
        import pandas as pd
    except ImportError:
        return
    X, y = load_iris(return_X_y=True, as_frame=True)
    df = X.copy()
    df["target"] = y.astype(int)
    # 이진 분류로 단순화: 클래스 0 vs 나머지
    df["target"] = (df["target"] > 0).astype(int)
    df.to_csv(target, index=False)


def path_for_dataset_key(key: str) -> Path | None:
    fname = BUILTIN_DATASETS.get(key)
    if not fname:
        return None
    return BENCHMARK_DIR / fname
