"""
정웅식 교수 가상 시나리오: Metal 20 SKU × 3년 주간 판매 → 24주 수요 예측.

- 공유 워크스페이스(instructor)에 CSV·모델·출력·잡·DB 이력·리포트를 한 번에 시드합니다.
- 기본 활성: AILAB_METAL_DEMO=1 (끄려면 0)
- 재실행: AILAB_METAL_DEMO_RESET=1 또는 `.metal_demand_demo_seeded` 삭제
"""
from __future__ import annotations

import json
import logging
import math
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path

from auth_utils import hash_password
from database import SessionLocal
from models import DatasetCatalog, Project, User
from storage_root import STORAGE_ROOT
from user_workspace import ensure_workspace_dirs, workspace_for_user

_LOG = logging.getLogger(__name__)

MARKER = STORAGE_ROOT / ".metal_demand_demo_seeded"
DEMO_EMAIL = (os.getenv("AILAB_METAL_DEMO_EMAIL") or "jungwoong-metal@ailab.demo").strip().lower()
DEMO_PASSWORD = os.getenv("AILAB_METAL_DEMO_PASSWORD") or "MetalDemo2026!"
TRAIN_CSV = "metal_sales_3y_weekly.csv"
SCORE_CSV = "metal_sales_future_24w_scoring.csv"
REPORT_MD = "metal_24w_forecast_report.md"
PROJECT_NAME = "Metal 20 SKU — 24주 수요예측 (정웅식)"


def _enabled() -> bool:
    return (os.getenv("AILAB_METAL_DEMO") or "1").strip().lower() in ("1", "true", "yes", "on")


def _reset_requested() -> bool:
    return (os.getenv("AILAB_METAL_DEMO_RESET") or "").strip().lower() in ("1", "true", "yes", "on")


def _write_train_and_score_csv(ws) -> None:
    random.seed(2026)
    rows_train = []
    for pid in range(1, 21):
        base = 100 + pid * 10
        for w in range(1, 157):
            fx = 108.0 + 3.2 * math.sin(w / 11.0) + random.gauss(0, 0.9)
            holiday_ratio = 0.0 if random.random() > 0.11 else random.choice([0.22, 0.35, 0.5, 0.65])
            list_price_index = 1.0 - 0.06 * (holiday_ratio > 0) + 0.04 * random.gauss(0, 1)
            week_sin = math.sin(2 * math.pi * w / 52.0)
            week_cos = math.cos(2 * math.pi * w / 52.0)
            demand = (
                base * (1.0 + 0.035 * week_sin)
                * (fx / 108.0) ** (-0.25)
                * (max(0.75, list_price_index) ** (-1.1))
                * (1.0 - 0.18 * holiday_ratio)
                + random.gauss(0, 7.5)
            )
            demand = max(8.0, demand)
            rows_train.append(
                [
                    pid,
                    w,
                    round(fx, 4),
                    round(holiday_ratio, 4),
                    round(list_price_index, 4),
                    round(week_sin, 6),
                    round(week_cos, 6),
                    round(demand, 2),
                ]
            )

    import csv

    train_path = ws.data / TRAIN_CSV
    with train_path.open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(
            [
                "product_code",
                "year_week",
                "fx_index",
                "holiday_ratio",
                "list_price_index",
                "week_sin",
                "week_cos",
                "sales_units",
            ]
        )
        wr.writerows(rows_train)

    rows_score = []
    for w in range(157, 181):
        fx = 109.0 + 2.8 * math.sin(w / 10.0) + random.gauss(0, 0.7)
        holiday_ratio = 0.0 if random.random() > 0.14 else random.choice([0.2, 0.33, 0.48])
        list_price_index = 1.01 + 0.02 * random.gauss(0, 1)
        week_sin = math.sin(2 * math.pi * w / 52.0)
        week_cos = math.cos(2 * math.pi * w / 52.0)
        for pid in range(1, 21):
            rows_score.append(
                [
                    pid,
                    w,
                    round(fx, 4),
                    round(holiday_ratio, 4),
                    round(list_price_index, 4),
                    round(week_sin, 6),
                    round(week_cos, 6),
                ]
            )

    score_path = ws.data / SCORE_CSV
    with score_path.open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(
            [
                "product_code",
                "year_week",
                "fx_index",
                "holiday_ratio",
                "list_price_index",
                "week_sin",
                "week_cos",
            ]
        )
        wr.writerows(rows_score)


def _upsert_professor(db) -> User:
    u = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if u:
        u.full_name = "정웅식 (교수)"
        if u.role not in ("instructor", "master", "director", "technical_lead", "admin"):
            u.role = "instructor"
        u.is_admin_approved = True
        u.is_email_verified = True
        u.is_active = True
        db.commit()
        db.refresh(u)
        return u
    u = User(
        email=DEMO_EMAIL,
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name="정웅식 (교수)",
        role="instructor",
        is_active=True,
        is_email_verified=True,
        is_admin_approved=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _ensure_project(db, owner: User) -> None:
    p = db.query(Project).filter(Project.name == PROJECT_NAME).first()
    if p:
        p.owner_id = owner.id
        p.description = (
            "Metal 제품 20종의 3개년(주간) 판매 실적, 환율·휴일·판가지수를 반영한 수요 회귀 모델 및 "
            "향후 24주 스코어링(가상 데이터). 오너: 정웅식 교수."
        )
        db.commit()
        return
    db.add(
        Project(
            name=PROJECT_NAME,
            description=(
                "Metal 제품 20종의 3개년(주간) 판매 실적, 환율·휴일·판가지수를 반영한 수요 회귀 모델 및 "
                "향후 24주 스코어링(가상 데이터). 오너: 정웅식 교수."
            ),
            owner_id=owner.id,
        )
    )
    db.commit()


def _ensure_dataset_catalog(db, owner: User) -> None:
    name = "metal_sales_3y_weekly (정웅식 교수)"
    schema = {
        "columns": [
            "product_code",
            "year_week",
            "fx_index",
            "holiday_ratio",
            "list_price_index",
            "week_sin",
            "week_cos",
            "sales_units",
        ],
        "row_count_approx": 3120,
        "source_file": TRAIN_CSV,
        "scenario": "metal_20_sku_demand",
    }
    existing = db.query(DatasetCatalog).filter(DatasetCatalog.name == name).first()
    if existing:
        existing.schema_json = json.dumps(schema, ensure_ascii=False)
        existing.owner_id = owner.id
        existing.owner_name = owner.email
        existing.description = "Metal 20 SKU 주간 판매(가상) + 환율·휴일·판가지수"
        db.commit()
        return
    db.add(
        DatasetCatalog(
            name=name,
            description="Metal 20 SKU 주간 판매(가상) + 환율·휴일·판가지수",
            schema_json=json.dumps(schema, ensure_ascii=False),
            tags_json=json.dumps(["metal", "demand", "professor-demo"], ensure_ascii=False),
            version="v1",
            owner_id=owner.id,
            owner_name=owner.email,
            dataset_type="structured",
            sensor_columns_json=json.dumps([], ensure_ascii=False),
        )
    )
    db.commit()


def _write_report_md(ws, model_id: str, train_metrics: dict, pred_rows: int) -> None:
    rmse = train_metrics.get("rmse", 0)
    mae = train_metrics.get("mae", 0)
    r2 = train_metrics.get("r2", 0)
    body = f"""# Metal 20 SKU — 24주 수요 예측 리포트 (가상 시나리오)

**담당**: 정웅식 (교수) · **프로젝트**: {PROJECT_NAME}

## 1. 데이터
- 학습 CSV: `{TRAIN_CSV}` — SKU 20종 × 156주, 타깃 `sales_units`
- 특성: `product_code`, `year_week`, `fx_index`, `holiday_ratio`, `list_price_index`, `week_sin`, `week_cos`
- 스코어링 CSV: `{SCORE_CSV}` — 향후 24주 × 20 SKU (동일 특성, 타깃 없음)

## 2. 모델 학습
- 모델 ID: `{model_id}`
- 검증 RMSE: **{rmse:.4f}**, MAE: **{mae:.4f}**, R²: **{r2:.4f}**
- 해석: 패널(제품×주차) 수요 변동을 랜덤 포레스트가 일부 설명합니다. 실무에서는 SKU별 계절·프로모션 캘린더를 세분화하면 개선 여지가 있습니다.

## 3. 배치 예측
- 예측 출력 행 수: **{pred_rows}** (24주 × 20 SKU)
- 결과 파일: `{model_id}_predictions.csv`

## 4. Jobs / Artifacts
- Jobs 레지스트리에 학습·예측 완료 잡이 등록되어 있습니다.
- Artifacts: 모델 `.joblib`, 메타 `.json`, 예측 CSV, 학습 차트 PNG

---
*데모 시드 `metal_demand_demo_seed.py`*
"""
    (ws.outputs / REPORT_MD).write_text(body, encoding="utf-8")


def ensure_metal_demand_professor_demo() -> None:
    if not _enabled():
        _LOG.info("AILAB_METAL_DEMO disabled; skip metal demand demo")
        return
    if MARKER.is_file() and not _reset_requested():
        return
    if _reset_requested() and MARKER.is_file():
        MARKER.unlink(missing_ok=True)

    db = SessionLocal()
    try:
        prof = _upsert_professor(db)
        _ensure_project(db, prof)
        _ensure_dataset_catalog(db, prof)
    finally:
        db.close()

    db = SessionLocal()
    try:
        prof = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if not prof:
            _LOG.warning("Metal demo: professor user missing")
            return
        ws = workspace_for_user(prof)
        ensure_workspace_dirs(ws)
        _write_train_and_score_csv(ws)
    finally:
        db.close()

    from main import (  # noqa: WPS433  — lifespan 이후 로드
        PredictRequest,
        TrainRequest,
        _predict_impl,
        _set_job,
        _train_impl,
    )

    db = SessionLocal()
    try:
        prof = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if not prof:
            return
    finally:
        db.close()

    ws = workspace_for_user(prof)
    ensure_workspace_dirs(ws)

    feat = [
        "product_code",
        "year_week",
        "fx_index",
        "holiday_ratio",
        "list_price_index",
        "week_sin",
        "week_cos",
    ]
    req = TrainRequest(
        filename=TRAIN_CSV,
        target_column="sales_units",
        task="regression",
        model_type="random_forest",
        feature_columns=feat,
        test_size=0.2,
        random_state=42,
    )

    meta = _train_impl(req, ws, current_user=prof, job_id=None)
    model_id = meta["model_id"]

    job_train = str(uuid.uuid4())
    _set_job(
        job_train,
        kind="train",
        status="completed",
        phase="done",
        progress=100,
        user_id=prof.id,
        user_email=prof.email,
        payload={"filename": TRAIN_CSV, "task": "regression", "model_type": "random_forest"},
        result={"model_id": model_id, "metrics": meta.get("metrics")},
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )

    pred_req = PredictRequest(model_id=model_id, filename=SCORE_CSV)
    pred = _predict_impl(pred_req, ws, current_user=prof)

    job_pred = str(uuid.uuid4())
    _set_job(
        job_pred,
        kind="predict",
        status="completed",
        phase="done",
        progress=100,
        user_id=prof.id,
        user_email=prof.email,
        payload={"filename": SCORE_CSV, "model_id": model_id},
        result={"output_file": pred.get("output_file"), "rows": pred.get("rows")},
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )

    metrics = meta.get("metrics") or {}
    _write_report_md(ws, model_id, metrics, int(pred.get("rows") or 0))

    MARKER.write_text(
        json.dumps(
            {
                "seeded_at": datetime.now(timezone.utc).isoformat(),
                "email": DEMO_EMAIL,
                "model_id": model_id,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    _LOG.info("Metal demand professor demo seeded: %s model_id=%s", DEMO_EMAIL, model_id)
