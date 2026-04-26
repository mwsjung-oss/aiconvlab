"""
Local AILab — FastAPI backend for CSV-based ML (education).
"""
from __future__ import annotations

import io
import json
import logging
import math
import os
import sys
import platform
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from urllib.parse import quote
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# 작업 디렉터리와 무관하게 backend/.env 로드 (ADMIN_PANEL_PASSWORD 등)
_BACKEND_ROOT = Path(__file__).resolve().parent
load_dotenv(_BACKEND_ROOT / ".env")
_SRC_ROOT = _BACKEND_ROOT / "src"
if str(_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT))
from typing import Any, Dict, List, Literal

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import psutil

import models  # noqa: F401 — Alembic/메타데이터 등록
from activity_service import log_activity
from auth_utils import hash_password
from database import SessionLocal, engine, get_db, test_database_connection
from dependencies import get_current_approved_member
from models import DatasetCatalog, Experiment, ExperimentRecord, ExperimentRun, Project, ProjectMember, User
from admin_panel_store import ensure_admin_password_file
from routers import admin as admin_router
from routers import admin_panel as admin_panel_router
from routers import auth as auth_router
from routers import ai_chat as ai_chat_router
from routers import ml_platform as ml_platform_router
from routers import notebook as notebook_router
from routers import portal as portal_router
from api.v1 import platform as platform_router
from storage_root import STORAGE_ROOT
from user_workspace import (
    ALL_ACCESS_ROLES,
    SHARED_DATA_DIR as DATA_DIR,
    SHARED_HISTORY_FILE as HISTORY_PATH,
    SHARED_MODELS_DIR as MODELS_DIR,
    SHARED_OUTPUTS_DIR as OUTPUTS_DIR,
    WorkspacePaths,
    ensure_workspace_dirs,
    workspace_for_user,
)
from pydantic import BaseModel, Field
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    GradientBoostingClassifier,
    GradientBoostingRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    IsolationForest,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import (
    ElasticNet,
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
)
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder
from sklearn.svm import SVC, SVR
from xgboost import XGBClassifier, XGBRegressor

BASE_DIR = Path(__file__).resolve().parent

for d in (DATA_DIR, MODELS_DIR, OUTPUTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

SAFE_NAME = re.compile(r"^[\w\-. ]+$")

PILOT_DEMAND_TRAIN_CSV = "pilot_demand_train.csv"
PILOT_DEMAND_SCORING_CSV = "pilot_demand_scoring.csv"


def _sanitize_for_json(obj: Any) -> Any:
    """nan/inf는 JSON·Starlette 응답에서 허용되지 않아 None으로 바꿉니다."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def _metrics_interpretation_ko(task: str, metrics: dict[str, Any]) -> str:
    """검증 지표에 대한 한국어 해석(Colab 노트북 서술 스타일)."""
    if task == "regression":
        r2 = metrics.get("r2")
        rmse = metrics.get("rmse")
        mae = metrics.get("mae")
        parts: list[str] = []
        if r2 is not None:
            r2f = float(r2)
            if math.isnan(r2f) or math.isinf(r2f):
                parts.append(
                    "**R²** — 검증 구간에서 정의되지 않았습니다(타깃 분산이 0에 가깝거나 예측이 동일한 경우 등)."
                )
            elif r2f >= 0.75:
                parts.append(
                    f"**R² = {r2f:.4f}** — 검증 구간에서 타깃 변동의 많은 부분을 모델이 설명합니다. "
                    "Pilot 단계에서 주간 수요 수준·추세를 참고용으로 쓰기에 무난합니다."
                )
            elif r2f >= 0.45:
                parts.append(
                    f"**R² = {r2f:.4f}** — 설명력이 중간입니다. 가격·프로모션 외 변수(재고, 캠페인, 경쟁사 가격 등)를 "
                    "특성으로 추가하거나 모델·전처리를 조정하면 개선 여지가 있습니다."
                )
            else:
                parts.append(
                    f"**R² = {r2f:.4f}** — 설명력이 낮습니다. 이상치·결측, 특성 공학, 또는 더 긴 기간 데이터를 검토해 보세요."
                )
        elif rmse is not None or mae is not None:
            parts.append(
                "**R²** — 검증 구간에서 유효한 값으로 기록되지 않았습니다(수치 불안정 또는 분산 부족)."
            )
        if rmse is not None:
            parts.append(
                f"**RMSE = {float(rmse):.4f}** — 큰 오차에 패널티가 커서, 단위(주간 수량) 기준 평균적 오차 규모를 볼 때 참고합니다."
            )
        if mae is not None:
            parts.append(
                f"**MAE = {float(mae):.4f}** — 예측과 실제의 평균 절대 차이로, 이상치에 RMSE보다 덜 민감합니다."
            )
        parts.append(
            "**Actual vs Predicted 산점도** — 빨간 점선은 완벽 예측선입니다. 점군이 선에 가까울수록 검증 분할에서의 일반화가 양호합니다."
        )
        return "\n\n".join(parts)
    if task == "classification":
        acc = metrics.get("accuracy")
        f1w = metrics.get("f1_weighted")
        parts_c: list[str] = []
        if acc is not None:
            parts_c.append(
                f"**Accuracy = {float(acc):.4f}** — 전체 샘플 중 올바르게 분류한 비율입니다."
            )
        if f1w is not None:
            parts_c.append(
                f"**F1 (weighted) = {float(f1w):.4f}** — 클래스 불균형이 있을 때 정밀도·재현율 균형을 함께 봅니다."
            )
        return "\n\n".join(parts_c) if parts_c else "분류 지표 해석을 생성하지 못했습니다."
    return "해석 템플릿이 없는 과제 유형입니다."


def _append_pilot_demand_report(ws: WorkspacePaths, title: str, body_lines: list[str]) -> None:
    path = ws.outputs / "pilot_demand_lab_report.md"
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    block = f"\n## {title}\n*{ts}*\n\n" + "\n".join(body_lines) + "\n"
    header = (
        "# Pilot — 제품 주간 구매 수요 예측\n\n"
        "샘플 `pilot_demand_train.csv` 학습 및 `pilot_demand_scoring.csv` 예측 시 이 파일이 자동 갱신됩니다. "
        "**Reports** 탭의 **원문 요약**에서 동일 내용을 볼 수 있습니다.\n"
    )
    if path.is_file():
        path.write_text(path.read_text(encoding="utf-8") + block, encoding="utf-8")
    else:
        path.write_text(header + block, encoding="utf-8")


def _ensure_master_user() -> None:
    """환경변수 MASTER_EMAIL / MASTER_PASSWORD 로 마스터 계정을 시드합니다.

    MASTER_PASSWORD_RESYNC=1(또는 true)이면 이미 존재하는 동일 이메일 계정의
    비밀번호 해시를 MASTER_PASSWORD로 갱신합니다(연구실 서버에서 1회 적용 후 끄세요).
    """
    email = (os.getenv("MASTER_EMAIL") or "").strip().lower()
    password = os.getenv("MASTER_PASSWORD") or ""
    if not email or not password:
        return
    resync = os.getenv("MASTER_PASSWORD_RESYNC", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing is not None:
            if resync:
                existing.hashed_password = hash_password(password)
                db.commit()
            return
        u = User(
            email=email,
            hashed_password=hash_password(password),
            full_name="Master Admin",
            role="master",
            is_active=True,
            is_email_verified=True,
            is_admin_approved=True,
        )
        db.add(u)
        db.commit()
    finally:
        db.close()


def _sync_lead_roles_from_env() -> None:
    """DIRECTOR_EMAILS / TECHNICAL_LEAD_EMAILS(콤마·세미콜론 구분)에 맞춰 역할을 갱신합니다."""
    db = SessionLocal()
    try:
        for env_key, role in (
            ("DIRECTOR_EMAILS", "director"),
            ("TECHNICAL_LEAD_EMAILS", "technical_lead"),
        ):
            raw = os.getenv(env_key) or ""
            for part in raw.replace(";", ",").split(","):
                email = part.strip().lower()
                if not email:
                    continue
                u = db.query(User).filter(User.email == email).first()
                if u:
                    u.role = role
        db.commit()
    finally:
        db.close()


def _ensure_experiment_schema() -> None:
    """SQLite에 필요한 컬럼을 안전하게 추가(이미 있으면 skip)."""
    if engine.url.get_backend_name() != "sqlite":
        return

    def _cols(table: str) -> set[str]:
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return {r[1] for r in rows}

    # experiment_runs 컬럼 보강
    if "experiment_runs" in _tables():
        cols = _cols("experiment_runs")
        alter_sql = []
        if "run_id" not in cols:
            alter_sql.append("ALTER TABLE experiment_runs ADD COLUMN run_id TEXT")
        if "started_at" not in cols:
            alter_sql.append("ALTER TABLE experiment_runs ADD COLUMN started_at DATETIME")
        if "finished_at" not in cols:
            alter_sql.append("ALTER TABLE experiment_runs ADD COLUMN finished_at DATETIME")
        if "params_json" not in cols:
            alter_sql.append("ALTER TABLE experiment_runs ADD COLUMN params_json TEXT DEFAULT '{}'")
        if "log_path" not in cols:
            alter_sql.append("ALTER TABLE experiment_runs ADD COLUMN log_path TEXT")
        if "output_path" not in cols:
            alter_sql.append("ALTER TABLE experiment_runs ADD COLUMN output_path TEXT")
        if alter_sql:
            with engine.begin() as conn:
                for sql in alter_sql:
                    conn.execute(text(sql))
                conn.execute(
                    text(
                        "UPDATE experiment_runs "
                        "SET run_id = COALESCE(run_id, model_id, hex(randomblob(16)))"
                    )
                )
        cols2 = _cols("experiment_runs")
        extra_alter = []
        if "reproducibility_json" not in cols2:
            extra_alter.append(
                "ALTER TABLE experiment_runs ADD COLUMN reproducibility_json TEXT DEFAULT '{}'"
            )
        if "registry_stage" not in cols2:
            extra_alter.append(
                "ALTER TABLE experiment_runs ADD COLUMN registry_stage TEXT DEFAULT 'none'"
            )
        if extra_alter:
            with engine.begin() as conn:
                for sql in extra_alter:
                    conn.execute(text(sql))
    if "model_registry" in _tables():
        mcols = _cols("model_registry")
        malter = []
        if "lifecycle_stage" not in mcols:
            malter.append("ALTER TABLE model_registry ADD COLUMN lifecycle_stage TEXT")
        if "model_uuid" not in mcols:
            malter.append("ALTER TABLE model_registry ADD COLUMN model_uuid TEXT")
        if "approved_by_user_id" not in mcols:
            malter.append(
                "ALTER TABLE model_registry ADD COLUMN approved_by_user_id INTEGER"
            )
        if "approved_at" not in mcols:
            malter.append("ALTER TABLE model_registry ADD COLUMN approved_at DATETIME")
        if malter:
            with engine.begin() as conn:
                for sql in malter:
                    conn.execute(text(sql))
    if "projects" in _tables():
        pcols = _cols("projects")
        palter = []
        if "source_type" not in pcols:
            palter.append("ALTER TABLE projects ADD COLUMN source_type TEXT")
        if "intelligence_json" not in pcols:
            palter.append("ALTER TABLE projects ADD COLUMN intelligence_json TEXT")
        if palter:
            with engine.begin() as conn:
                for sql in palter:
                    conn.execute(text(sql))


def _tables() -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()
    return {r[0] for r in rows}


@asynccontextmanager
async def lifespan(app: FastAPI):
    test_database_connection()
    warn_production_cors()

    from database import Base

    Base.metadata.create_all(bind=engine)
    _ensure_experiment_schema()
    try:
        from benchmark_data import ensure_builtin_datasets

        ensure_builtin_datasets()
    except Exception:
        logging.getLogger(__name__).exception("Benchmark datasets seed failed")
    _ensure_master_user()
    _sync_lead_roles_from_env()
    ensure_admin_password_file()
    try:
        from metal_demand_demo_seed import ensure_metal_demand_professor_demo

        ensure_metal_demand_professor_demo()
    except Exception:
        logging.getLogger(__name__).exception("Metal demand professor demo seed failed")
    try:
        from announcement_seed import ensure_default_announcements
        from database import SessionLocal

        s = SessionLocal()
        try:
            ensure_default_announcements(s)
        finally:
            s.close()
    except Exception:
        logging.getLogger(__name__).exception("Default announcements seed failed")
    yield
    try:
        from notebook_service import shutdown_all_notebooks

        shutdown_all_notebooks()
    except Exception:
        logging.getLogger(__name__).exception("Notebook subprocess shutdown failed")


from core.cors import cors_middleware_params, warn_production_cors

app = FastAPI(title="Local AILab", version="3.0.1", lifespan=lifespan)
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(admin_panel_router.router)
app.include_router(ml_platform_router.router)
app.include_router(ai_chat_router.router)
app.include_router(portal_router.router)
app.include_router(notebook_router.router)  # 노트북: NOTEBOOK_ENABLED=.env
app.include_router(platform_router.router)

# ---- LLM gateway + Agent + RAG routers --------------------------------------
# backend/src/api/{chat,rag,agent}.py 는 services.llm_gateway / services.agents /
# services.rag 에 의존한다. chromadb / sentence-transformers / openai /
# google-generativeai 는 requirements.txt 에 포함되어 있으나, 의존성 로딩 또는
# 런타임 환경 문제(OPENAI_API_KEY 미설정 등)로 import 가 실패할 수 있다. 그럴
# 경우에도 기존 ML 서비스 자체는 계속 구동되어야 하므로 라우터별로 try/except
# 하여 실패 시 warning 로그만 남기고 skip 한다. UI(/api/chat/health) 가 404 일
# 때는 "게이트웨이 미연결" 로 자연스럽게 표시된다.
_llm_log = logging.getLogger("llm_routers")
try:
    from api.chat import router as chat_api_router  # backend/src/api/chat.py
    app.include_router(chat_api_router)
    _llm_log.info("chat router mounted (/api/chat/*)")
except Exception as _chat_exc:  # pragma: no cover - 선택적 의존성/환경
    _llm_log.warning("chat router skipped: %s", _chat_exc)
try:
    from api.agent import router as agent_api_router  # backend/src/api/agent.py
    app.include_router(agent_api_router)
    _llm_log.info("agent router mounted (/api/agent/*)")
except Exception as _agent_exc:  # pragma: no cover
    _llm_log.warning("agent router skipped: %s", _agent_exc)
try:
    from api.rag import router as rag_api_router  # backend/src/api/rag.py
    app.include_router(rag_api_router)
    _llm_log.info("rag router mounted (/api/rag/*)")
except Exception as _rag_exc:  # pragma: no cover
    _llm_log.warning("rag router skipped: %s", _rag_exc)

# ---- Experiment V3: kernel + tracing -----------------------------------------
# kernel 은 jupyter_client/ipykernel 이 필요하고, tracing 은 SQLite 만 필요하다.
# 하나가 실패해도 다른 하나는 마운트 되도록 try/except 를 분리한다.
try:
    from api.kernel import router as kernel_api_router  # backend/src/api/kernel.py
    app.include_router(kernel_api_router)
    _llm_log.info("kernel router mounted (/api/kernel/*)")
except Exception as _kernel_exc:  # pragma: no cover
    _llm_log.warning("kernel router skipped: %s", _kernel_exc)
try:
    from api.tracing import router as tracing_api_router  # backend/src/api/tracing.py
    app.include_router(tracing_api_router)
    _llm_log.info("tracing router mounted (/api/tracing/*)")
except Exception as _tracing_exc:  # pragma: no cover
    _llm_log.warning("tracing router skipped: %s", _tracing_exc)

app.add_middleware(CORSMiddleware, **cors_middleware_params())


def _safe_filename(name: str) -> str:
    name = Path(name).name
    if not name or not SAFE_NAME.match(name):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not name.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are allowed")
    return name


def _load_csv(filename: str, data_dir: Path) -> pd.DataFrame:
    path = data_dir / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    try:
        return pd.read_csv(path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read CSV: {e}") from e


def _metadata_path(models_dir: Path, model_id: str) -> Path:
    return models_dir / f"{model_id}.json"


def _model_path(models_dir: Path, model_id: str) -> Path:
    return models_dir / f"{model_id}.joblib"


def _health_payload() -> dict[str, str]:
    """로드밸런서·프론트·연구실 배포에서 공통으로 쓰는 헬스 본문."""
    return {"status": "ok"}


@app.get("/", tags=["health"], summary="서비스 루트 (배포·브라우저 확인용)")
def root() -> dict[str, str]:
    return {"message": "AI Lab Backend Running"}


@app.api_route("/api/health", methods=["GET", "HEAD"], tags=["health"], summary="헬스 체크 (권장)")
def health() -> dict[str, str]:
    """HEAD 는 wait-on·로드밸런서 프로브 호환용."""
    return _health_payload()


@app.api_route("/health", methods=["GET", "HEAD"], tags=["health"], summary="헬스 체크 (루트 경로 별칭)")
def health_root() -> dict[str, str]:
    """일부 리버스 프록시·구 프로브는 /api 없이 /health 만 호출합니다."""
    return _health_payload()


@app.get("/api/health/db", tags=["health"])
def db_health() -> dict[str, str]:
    from sqlalchemy import text

    logger = logging.getLogger(__name__)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception:
        logger.exception("DB health check failed")
        raise HTTPException(status_code=503, detail="DB not reachable")


def _upsert_dataset_catalog_from_upload(
    db: Session,
    current_user: User,
    result: dict[str, Any],
) -> int | None:
    """업로드된 CSV를 사용자 소유 데이터셋 카탈로그에 자동 반영(동일 파일명이면 갱신)."""
    fname = result.get("filename") or "upload.csv"
    cols = result.get("columns") or []
    schema_data = {
        "columns": cols,
        "numeric_columns": result.get("numeric_columns") or [],
        "row_count": result.get("rows"),
        "source_file": fname,
        "registered_via": "csv_upload",
    }
    tags = ["upload", "auto"]
    desc = f"CSV 업로드로 자동 등록 ({result.get('rows')}행, {len(cols)}열)"
    existing = (
        db.query(DatasetCatalog)
        .filter(
            DatasetCatalog.owner_id == current_user.id,
            DatasetCatalog.name == fname,
        )
        .first()
    )
    if existing:
        existing.schema_json = json.dumps(schema_data, ensure_ascii=False)
        existing.description = desc
        existing.tags_json = json.dumps(tags, ensure_ascii=False)
        existing.owner_name = current_user.email
        db.commit()
        db.refresh(existing)
        return int(existing.id)
    d = DatasetCatalog(
        name=fname,
        description=desc,
        schema_json=json.dumps(schema_data, ensure_ascii=False),
        tags_json=json.dumps(tags, ensure_ascii=False),
        version="v1",
        owner_id=current_user.id,
        owner_name=current_user.email,
        dataset_type="structured",
        sensor_columns_json=json.dumps([], ensure_ascii=False),
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return int(d.id)


def _finish_upload_with_catalog(
    db: Session,
    current_user: User,
    result: dict[str, Any],
) -> dict[str, Any]:
    catalog_id = None
    try:
        catalog_id = _upsert_dataset_catalog_from_upload(db, current_user, result)
    except Exception as e:
        logging.getLogger(__name__).warning("dataset catalog upsert skipped: %s", e)
    out: dict[str, Any] = {**result}
    if catalog_id is not None:
        out["dataset_catalog_id"] = catalog_id
    return out


async def _upload_csv_core(file: UploadFile, data_dir: Path) -> dict[str, Any]:
    data_dir.mkdir(parents=True, exist_ok=True)
    fname = _safe_filename(file.filename or "upload.csv")
    dest = data_dir / fname
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB)")
    dest.write_bytes(content)
    df = _load_csv(fname, data_dir)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    return {
        "filename": fname,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "numeric_columns": numeric_cols,
    }


@app.post("/api/upload")
async def upload_csv(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    result = await _upload_csv_core(file, ws.data)
    log_activity(db, current_user.id, "upload", {"filename": result["filename"]}, request)
    return _finish_upload_with_catalog(db, current_user, result)


@app.get("/api/datasets")
def list_datasets(
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, list[str]]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    files = sorted(p.name for p in ws.data.glob("*.csv"))
    log_activity(db, current_user.id, "list_datasets", {}, request)
    return {"files": files}


@app.get("/api/preview")
def preview(
    request: Request,
    filename: str,
    rows: int = 20,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _safe_filename(filename)
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    df = _load_csv(filename, ws.data)
    rows = max(1, min(rows, 500))
    head = df.head(rows)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    log_activity(db, current_user.id, "preview", {"filename": filename}, request)
    return {
        "filename": filename,
        "preview_rows": rows,
        "total_rows": int(len(df)),
        "columns": list(df.columns),
        "numeric_columns": numeric_cols,
        "data": json.loads(head.to_json(orient="records", date_format="iso")),
    }


class TrainRequest(BaseModel):
    """Internal training request model used by the core training logic.

    NOTE:
    - API에서 직접 사용하지 않고, 아래의 `TrainPayload`(사용자 요청용)에서
      이 모델로 변환해서 사용합니다.
    """

    filename: str
    target_column: str
    task: Literal["classification", "regression", "time_series", "anomaly_detection"]
    model_type: Literal[
        "linear_regression",
        "ridge",
        "lasso",
        "elastic_net",
        "random_forest",
        "xgboost",
        "gradient_boosting",
        "extra_trees",
        "hist_gradient_boosting",
        "logistic_regression",
        "svc_rbf",
        "svr_rbf",
        "tft",
        "isolation_forest",
    ]
    feature_columns: List[str] | None = None
    test_size: float = Field(0.2, ge=0.1, le=0.5)
    random_state: int = 42
    project_id: int | None = None
    extra_context: dict[str, Any] | None = Field(
        default=None,
        description="내부용(스윕 메타 등). API JSON에는 포함하지 않습니다.",
    )


class TrainPayload(BaseModel):
    """공개 API(POST /train)에서 사용하는 요청 스키마.

    - filename: 학습에 사용할 CSV 파일 이름 (backend/data/ 아래에 존재해야 함)
    - target_column: 예측할 타깃 열 이름
    - feature_columns: 입력 특성 열 이름 목록 (None이면 숫자 열 자동 선택)
    - model_type: linear_regression | random_forest | xgboost | logistic_regression
    - task_type: regression | classification
    """

    filename: str
    target_column: str
    feature_columns: List[str] | None = None
    model_type: Literal[
        "linear_regression",
        "ridge",
        "lasso",
        "elastic_net",
        "random_forest",
        "xgboost",
        "gradient_boosting",
        "extra_trees",
        "hist_gradient_boosting",
        "logistic_regression",
        "svc_rbf",
        "svr_rbf",
        "tft",
        "isolation_forest",
    ]
    task_type: Literal["regression", "classification", "time_series", "anomaly_detection"]


def _build_estimator(task: str, model_type: str):
    if task == "classification":
        if model_type == "logistic_regression":
            return LogisticRegression(max_iter=2000, random_state=42)
        if model_type == "random_forest":
            return RandomForestClassifier(n_estimators=100, random_state=42)
        if model_type == "xgboost":
            return XGBClassifier(
                n_estimators=100,
                max_depth=6,
                random_state=42,
                eval_metric="logloss",
            )
        if model_type == "gradient_boosting":
            return GradientBoostingClassifier(random_state=42)
        if model_type == "extra_trees":
            return ExtraTreesClassifier(n_estimators=200, random_state=42)
        if model_type == "hist_gradient_boosting":
            return HistGradientBoostingClassifier(random_state=42, max_iter=200)
        if model_type == "svc_rbf":
            return SVC(kernel="rbf", random_state=42)
        raise HTTPException(status_code=400, detail="Invalid model for classification")
    if task == "regression":
        if model_type == "linear_regression":
            return LinearRegression()
        if model_type == "ridge":
            return Ridge(random_state=42)
        if model_type == "lasso":
            return Lasso(random_state=42, max_iter=8000)
        if model_type == "elastic_net":
            return ElasticNet(random_state=42, max_iter=8000)
        if model_type == "random_forest":
            return RandomForestRegressor(n_estimators=100, random_state=42)
        if model_type == "xgboost":
            return XGBRegressor(n_estimators=100, max_depth=6, random_state=42)
        if model_type == "gradient_boosting":
            return GradientBoostingRegressor(random_state=42)
        if model_type == "extra_trees":
            return ExtraTreesRegressor(n_estimators=200, random_state=42)
        if model_type == "hist_gradient_boosting":
            return HistGradientBoostingRegressor(random_state=42, max_iter=200)
        if model_type == "svr_rbf":
            return SVR(kernel="rbf")
        raise HTTPException(status_code=400, detail="Invalid model for regression")
    raise HTTPException(status_code=400, detail="Invalid task")


def _build_lag_timeseries_regressor(model_type: str, random_state: int):
    """시계열 지연(lag) 특성에 쓰는 회귀 추정기."""
    if model_type == "linear_regression":
        return LinearRegression()
    if model_type == "ridge":
        return Ridge(random_state=random_state)
    if model_type == "lasso":
        return Lasso(random_state=random_state, max_iter=8000)
    if model_type == "elastic_net":
        return ElasticNet(random_state=random_state, max_iter=8000)
    if model_type == "random_forest":
        return RandomForestRegressor(n_estimators=200, random_state=random_state)
    if model_type == "xgboost":
        return XGBRegressor(n_estimators=200, max_depth=6, random_state=random_state)
    if model_type == "gradient_boosting":
        return GradientBoostingRegressor(random_state=random_state)
    if model_type == "extra_trees":
        return ExtraTreesRegressor(n_estimators=200, random_state=random_state)
    if model_type == "hist_gradient_boosting":
        return HistGradientBoostingRegressor(random_state=random_state, max_iter=200)
    if model_type == "svr_rbf":
        return SVR(kernel="rbf")
    return RandomForestRegressor(n_estimators=200, random_state=random_state)


def _train_time_series_impl(req: TrainRequest, ws: WorkspacePaths) -> dict[str, Any]:
    _safe_filename(req.filename)
    df = _load_csv(req.filename, ws.data)
    if req.target_column not in df.columns:
        raise HTTPException(status_code=400, detail="target_column not in dataset")
    y = pd.to_numeric(df[req.target_column], errors="coerce").dropna()
    if len(y) < 40:
        raise HTTPException(status_code=400, detail="time_series 학습에는 최소 40개 행이 필요합니다.")

    # Real TFT path via PyTorch Forecasting
    if req.model_type == "tft":
        try:
            import torch
            from lightning.pytorch import Trainer, seed_everything
            from lightning.pytorch.callbacks import EarlyStopping
            from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
            from pytorch_forecasting.metrics import QuantileLoss
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TFT dependencies are not installed correctly: {e}")

        tdf = df.copy()
        if "date" in tdf.columns:
            tdf["date"] = pd.to_datetime(tdf["date"], errors="coerce")
        else:
            tdf["date"] = np.arange(len(tdf))
        tdf[req.target_column] = pd.to_numeric(tdf[req.target_column], errors="coerce")
        tdf = tdf.dropna(subset=[req.target_column, "date"]).copy()
        if len(tdf) < 200:
            raise HTTPException(status_code=400, detail="TFT 학습에는 최소 200개 유효 시계열 포인트가 필요합니다.")

        if "product_id" in tdf.columns:
            group_col = "product_id"
        elif "product" in tdf.columns:
            group_col = "product"
        else:
            group_col = "__series_id"
            tdf[group_col] = "default_series"
        tdf[group_col] = tdf[group_col].astype(str)

        tdf = tdf.sort_values([group_col, "date"]).copy()
        tdf["time_idx"] = tdf.groupby(group_col).cumcount().astype(int)

        # Keep training practical on very large data
        max_groups = int(os.getenv("TFT_MAX_GROUPS", "120"))
        max_points_per_group = int(os.getenv("TFT_MAX_POINTS_PER_GROUP", "240"))
        if tdf[group_col].nunique() > max_groups:
            top_groups = (
                tdf.groupby(group_col)[req.target_column]
                .size()
                .sort_values(ascending=False)
                .head(max_groups)
                .index
            )
            tdf = tdf[tdf[group_col].isin(top_groups)].copy()
        tdf = (
            tdf.sort_values([group_col, "time_idx"])
            .groupby(group_col, as_index=False, group_keys=False)
            .tail(max_points_per_group)
            .copy()
        )
        tdf["time_idx"] = tdf.groupby(group_col).cumcount().astype(int)

        max_encoder_length = int(os.getenv("TFT_ENCODER_LENGTH", "30"))
        max_prediction_length = int(os.getenv("TFT_PREDICTION_LENGTH", "1"))
        if tdf["time_idx"].max() < max_encoder_length + max_prediction_length + 1:
            raise HTTPException(status_code=400, detail="TFT 학습 길이가 부족합니다. 더 긴 시계열 데이터가 필요합니다.")
        training_cutoff = int(tdf["time_idx"].max() - max_prediction_length)

        training = TimeSeriesDataSet(
            tdf[tdf.time_idx <= training_cutoff],
            time_idx="time_idx",
            target=req.target_column,
            group_ids=[group_col],
            min_encoder_length=max_encoder_length,
            max_encoder_length=max_encoder_length,
            min_prediction_length=max_prediction_length,
            max_prediction_length=max_prediction_length,
            static_categoricals=[group_col],
            time_varying_known_reals=["time_idx"],
            time_varying_unknown_reals=[req.target_column],
            add_relative_time_idx=True,
            add_target_scales=True,
            add_encoder_length=True,
        )
        validation = TimeSeriesDataSet.from_dataset(
            training,
            tdf,
            predict=True,
            stop_randomization=True,
        )
        batch_size = int(os.getenv("TFT_BATCH_SIZE", "64"))
        train_loader = training.to_dataloader(train=True, batch_size=batch_size, num_workers=0)
        val_loader = validation.to_dataloader(train=False, batch_size=batch_size, num_workers=0)

        seed_everything(req.random_state, workers=True)
        tft = TemporalFusionTransformer.from_dataset(
            training,
            learning_rate=float(os.getenv("TFT_LR", "0.03")),
            hidden_size=int(os.getenv("TFT_HIDDEN_SIZE", "16")),
            attention_head_size=int(os.getenv("TFT_HEADS", "2")),
            dropout=float(os.getenv("TFT_DROPOUT", "0.1")),
            hidden_continuous_size=int(os.getenv("TFT_HIDDEN_CONT", "8")),
            loss=QuantileLoss(),
            output_size=7,
        )
        early_stop = EarlyStopping(monitor="val_loss", min_delta=1e-4, patience=3, mode="min")
        use_cuda = bool(torch.cuda.is_available())
        accelerator = "gpu" if use_cuda else "cpu"
        gpu_name = torch.cuda.get_device_name(0) if use_cuda else None
        trainer = Trainer(
            max_epochs=int(os.getenv("TFT_MAX_EPOCHS", "5")),
            accelerator=accelerator,
            devices=1,
            callbacks=[early_stop],
            logger=False,
            enable_checkpointing=False,
            gradient_clip_val=0.1,
            enable_model_summary=False,
        )
        trainer.fit(tft, train_loader, val_loader)

        pred_tensor = tft.predict(val_loader)
        y_list = []
        for _, yy_pack in val_loader:
            if isinstance(yy_pack, tuple):
                y_list.append(yy_pack[0].detach().cpu())
            else:
                y_list.append(yy_pack.detach().cpu())
        actuals = torch.cat(y_list, dim=0).numpy().reshape(-1)
        preds = pred_tensor.detach().cpu().numpy().reshape(-1)
        n = min(len(actuals), len(preds))
        actuals = actuals[:n]
        preds = preds[:n]

        mse = float(mean_squared_error(actuals, preds))
        rmse = float(np.sqrt(mse))
        mae = float(mean_absolute_error(actuals, preds))
        r2 = float(r2_score(actuals, preds))
        metrics = {
            "mae": mae,
            "rmse": rmse,
            "r2": r2,
            "backend_model": "temporal_fusion_transformer",
            "device": "cuda" if use_cuda else "cpu",
            "gpu_name": gpu_name,
            "host": platform.node(),
            "groups": int(tdf[group_col].nunique()),
            "rows_used": int(len(tdf)),
            "max_encoder_length": max_encoder_length,
            "max_prediction_length": max_prediction_length,
        }
        metrics = _sanitize_for_json(metrics)

        model_id = str(uuid.uuid4())
        plot_filename = f"{model_id}_timeseries_tft.png"
        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(actuals[:300], label="actual")
        ax.plot(preds[:300], label="pred", linestyle="--")
        ax.set_title("TFT forecast (validation)")
        ax.legend()
        fig.tight_layout()
        fig.savefig(ws.outputs / plot_filename, dpi=120)
        plt.close(fig)

        state_path = ws.models / f"{model_id}_tft_state.pt"
        torch.save(tft.state_dict(), state_path)
        artifact = {
            "mode": "time_series_tft",
            "target_column": req.target_column,
            "task": req.task,
            "model_type": req.model_type,
            "group_col": group_col,
            "time_idx_col": "time_idx",
            "state_path": str(state_path),
            "tft_config": {
                "max_encoder_length": max_encoder_length,
                "max_prediction_length": max_prediction_length,
                "batch_size": batch_size,
            },
        }
        joblib.dump(artifact, _model_path(ws.models, model_id))
        created_at = datetime.utcnow().isoformat() + "Z"
        meta = {
            "model_id": model_id,
            "filename": req.filename,
            "target_column": req.target_column,
            "feature_columns": ["time_idx", group_col],
            "task": req.task,
            "model_type": req.model_type,
            "metrics": metrics,
            "plot_file": plot_filename,
            "n_train": int(len(tdf[tdf.time_idx <= training_cutoff])),
            "n_test": int(n),
            "created_at": created_at,
            "model_path": str(_model_path(ws.models, model_id)),
            "output_chart_path": str(ws.outputs / plot_filename),
        }
        _metadata_path(ws.models, model_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")
        return meta

    # Non-TFT time-series baseline (lag-based)
    _ts_lag_allowed = frozenset(
        {
            "linear_regression",
            "ridge",
            "lasso",
            "elastic_net",
            "random_forest",
            "xgboost",
            "gradient_boosting",
            "extra_trees",
            "hist_gradient_boosting",
            "svr_rbf",
        }
    )
    if req.model_type not in _ts_lag_allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                "time_series(지연 기준선)에서 지원하는 model_type: "
                + ", ".join(sorted(_ts_lag_allowed))
                + ". 딥러닝 시계열은 tft를 선택하세요."
            ),
        )

    lags = 5
    data = pd.DataFrame({"y": y})
    for i in range(1, lags + 1):
        data[f"lag_{i}"] = data["y"].shift(i)
    data = data.dropna()
    X = data[[f"lag_{i}" for i in range(1, lags + 1)]]
    yy = data["y"]
    n_test = max(1, int(len(X) * req.test_size))
    X_train, X_test = X.iloc[:-n_test], X.iloc[-n_test:]
    y_train, y_test = yy.iloc[:-n_test], yy.iloc[-n_test:]
    model = _build_lag_timeseries_regressor(req.model_type, req.random_state)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    mse = float(mean_squared_error(y_test, y_pred))
    rmse = float(np.sqrt(mse))
    mae = float(mean_absolute_error(y_test, y_pred))
    r2 = float(r2_score(y_test, y_pred))
    metrics = {
        "mae": mae,
        "rmse": rmse,
        "r2": r2,
        "lags": lags,
        "backend_model": f"{req.model_type}_lag_model",
    }
    metrics = _sanitize_for_json(metrics)
    model_id = str(uuid.uuid4())
    plot_filename = f"{model_id}_timeseries.png"
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(y_test.values, label="actual")
    ax.plot(y_pred, label="pred", linestyle="--")
    ax.set_title("Time-series forecast")
    ax.legend()
    fig.tight_layout()
    fig.savefig(ws.outputs / plot_filename, dpi=120)
    plt.close(fig)
    artifact = {
        "mode": "time_series",
        "model": model,
        "feature_columns": [f"lag_{i}" for i in range(1, lags + 1)],
        "target_column": req.target_column,
        "lags": lags,
        "task": req.task,
        "model_type": req.model_type,
    }
    joblib.dump(artifact, _model_path(ws.models, model_id))
    created_at = datetime.utcnow().isoformat() + "Z"
    meta = {
        "model_id": model_id,
        "filename": req.filename,
        "target_column": req.target_column,
        "feature_columns": artifact["feature_columns"],
        "task": req.task,
        "model_type": req.model_type,
        "metrics": metrics,
        "plot_file": plot_filename,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "created_at": created_at,
        "model_path": str(_model_path(ws.models, model_id)),
        "output_chart_path": str(ws.outputs / plot_filename),
    }
    _metadata_path(ws.models, model_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def _train_anomaly_impl(req: TrainRequest, ws: WorkspacePaths) -> dict[str, Any]:
    if req.model_type != "isolation_forest":
        raise HTTPException(
            status_code=400,
            detail="anomaly_detection은 model_type으로 isolation_forest만 지원합니다.",
        )
    _safe_filename(req.filename)
    df = _load_csv(req.filename, ws.data)
    if req.feature_columns:
        feature_cols = [c for c in req.feature_columns if c in df.columns]
    else:
        feature_cols = [c for c in df.select_dtypes(include=[np.number]).columns.tolist() if c != req.target_column]
    if not feature_cols:
        raise HTTPException(status_code=400, detail="anomaly_detection에는 numeric feature가 필요합니다.")
    X = df[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    model = IsolationForest(random_state=req.random_state, contamination="auto")
    model.fit(X)
    pred = model.predict(X)  # -1: anomaly
    score = model.decision_function(X)
    anomaly_ratio = float((pred == -1).mean())
    metrics = {
        "anomaly_ratio": anomaly_ratio,
        "score_mean": float(np.mean(score)),
        "score_std": float(np.std(score)),
    }
    metrics = _sanitize_for_json(metrics)
    model_id = str(uuid.uuid4())
    plot_filename = f"{model_id}_anomaly.png"
    fig, ax = plt.subplots(figsize=(7, 4))
    ax.hist(score, bins=30)
    ax.set_title("Anomaly score distribution")
    fig.tight_layout()
    fig.savefig(ws.outputs / plot_filename, dpi=120)
    plt.close(fig)
    artifact = {
        "mode": "anomaly_detection",
        "model": model,
        "feature_columns": feature_cols,
        "task": req.task,
        "model_type": req.model_type,
    }
    joblib.dump(artifact, _model_path(ws.models, model_id))
    created_at = datetime.utcnow().isoformat() + "Z"
    meta = {
        "model_id": model_id,
        "filename": req.filename,
        "target_column": req.target_column,
        "feature_columns": feature_cols,
        "task": req.task,
        "model_type": req.model_type,
        "metrics": metrics,
        "plot_file": plot_filename,
        "n_train": int(len(X)),
        "n_test": 0,
        "created_at": created_at,
        "model_path": str(_model_path(ws.models, model_id)),
        "output_chart_path": str(ws.outputs / plot_filename),
    }
    _metadata_path(ws.models, model_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def _train_impl(
    req: TrainRequest,
    ws: WorkspacePaths,
    current_user: User | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    if req.task == "time_series":
        return _train_time_series_impl(req, ws)
    if req.task == "anomaly_detection":
        return _train_anomaly_impl(req, ws)
    _safe_filename(req.filename)
    df = _load_csv(req.filename, ws.data)
    t_train_start = time.time()
    dataset_abs = ws.data / req.filename
    from ml_reproducibility import build_reproducibility_base

    repro_base = build_reproducibility_base(
        dataset_path=dataset_abs,
        filename=req.filename,
        req_dump={
            k: v
            for k, v in req.model_dump().items()
            if k != "extra_context" and v is not None
        },
        backend_root=Path(__file__).resolve().parent,
    )

    if req.target_column not in df.columns:
        raise HTTPException(status_code=400, detail="target_column not in dataset")

    # ------------------------------------------------------------------
    # 1) 특징 열(feature columns) 결정 및 숫자/범주형 자동 구분
    # ------------------------------------------------------------------
    if req.feature_columns is None or len(req.feature_columns) == 0:
        # 타깃 열을 제외한 모든 열을 우선 후보로 사용
        candidate_cols = [c for c in df.columns if c != req.target_column]
    else:
        candidate_cols = req.feature_columns
        for c in candidate_cols:
            if c not in df.columns:
                raise HTTPException(status_code=400, detail=f"Unknown feature: {c}")
        if req.target_column in candidate_cols:
            raise HTTPException(status_code=400, detail="target must not be in features")

    if not candidate_cols:
        raise HTTPException(status_code=400, detail="No feature columns available")

    X_raw = df[candidate_cols].copy()
    y_raw = df[req.target_column]

    # 숫자/범주형 컬럼 자동 탐지
    numeric_features: List[str] = X_raw.select_dtypes(include=[np.number]).columns.tolist()
    categorical_features: List[str] = [
        c
        for c in X_raw.columns
        if c not in numeric_features
        and (X_raw[c].dtype == object or str(X_raw[c].dtype) == "category")
    ]

    # 사용 가능한 feature 목록
    feature_cols = numeric_features + categorical_features
    if not feature_cols:
        raise HTTPException(
            status_code=400,
            detail="No usable feature columns (numeric or categorical) were found",
        )

    # 학습에 실제로 사용할 X
    X = X_raw[feature_cols]

    # Encode string/object targets for classification
    label_encoder: LabelEncoder | None = None
    if req.task == "classification":
        if y_raw.dtype == object or str(y_raw.dtype) == "category":
            label_encoder = LabelEncoder()
            y = pd.Series(label_encoder.fit_transform(y_raw.astype(str)), index=y_raw.index)
        else:
            y = y_raw
        if y.nunique() < 2:
            raise HTTPException(status_code=400, detail="Classification needs at least 2 classes")
    else:
        y = pd.to_numeric(y_raw, errors="coerce")
        if y.isna().all():
            raise HTTPException(status_code=400, detail="Target must be numeric for regression")
        na_rows = y.isna()
        if na_rows.any():
            X = X.loc[~na_rows]
            y = y.loc[~na_rows]

    # ------------------------------------------------------------------
    # 2) 전처리 파이프라인 구성
    #    - 숫자: 중앙값 대치(SimpleImputer(strategy="median"))
    #    - 범주형: 최빈값 대치 + 원-핫 인코딩
    # ------------------------------------------------------------------
    transformers = []
    if numeric_features:
        numeric_transformer = Pipeline(
            steps=[("imputer", SimpleImputer(strategy="median"))]
        )
        transformers.append(("num", numeric_transformer, numeric_features))

    if categorical_features:
        categorical_transformer = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="most_frequent")),
                (
                    "onehot",
                    OneHotEncoder(handle_unknown="ignore", max_categories=64),
                ),
            ]
        )
        transformers.append(("cat", categorical_transformer, categorical_features))

    if not transformers:
        raise HTTPException(
            status_code=400,
            detail="No transformers could be constructed for the given features",
        )

    preprocessor = ColumnTransformer(transformers=transformers)

    # ------------------------------------------------------------------
    # 3) 학습/검증 분할 및 모델 학습
    # ------------------------------------------------------------------
    stratify_arg = None
    if req.task == "classification" and y.nunique() > 1:
        stratify_arg = y
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=req.test_size,
            random_state=req.random_state,
            stratify=stratify_arg,
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=req.test_size,
            random_state=req.random_state,
            stratify=None,
        )

    estimator = _build_estimator(req.task, req.model_type)

    # 전처리 + 모델을 하나의 Pipeline으로 구성하여 함께 저장
    model_pipeline = Pipeline(steps=[("preprocess", preprocessor), ("model", estimator)])
    try:
        model_pipeline.fit(X_train, y_train)
    except MemoryError:
        raise HTTPException(
            status_code=400,
            detail="메모리가 부족합니다. 범주형 열(고유값이 매우 많은 ID 등)을 제외하거나 줄인 뒤 다시 시도하세요.",
        ) from None
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"학습 단계 입력 오류: {e}",
        ) from e
    y_pred = model_pipeline.predict(X_test)

    model_id = str(uuid.uuid4())
    metrics: dict[str, Any]
    plot_filename: str | None = None

    if req.task == "classification":
        acc = float(accuracy_score(y_test, y_pred))
        prec = float(
            precision_score(y_test, y_pred, average="weighted", zero_division=0)
        )
        rec = float(
            recall_score(y_test, y_pred, average="weighted", zero_division=0)
        )
        f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))
        report = classification_report(
            y_test, y_pred, output_dict=True, zero_division=0
        )
        metrics = {
            "accuracy": acc,
            "precision_weighted": prec,
            "recall_weighted": rec,
            "f1_weighted": f1,
            "classification_report": report,
        }
        cm = confusion_matrix(y_test, y_pred)
        fig, ax = plt.subplots(figsize=(6, 5))
        im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
        ax.figure.colorbar(im, ax=ax)
        ax.set(xticks=np.arange(cm.shape[1]), yticks=np.arange(cm.shape[0]))
        ax.set_ylabel("True label")
        ax.set_xlabel("Predicted label")
        ax.set_title("Confusion matrix")
        thresh = cm.max() / 2.0 if cm.size else 0
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                ax.text(
                    j,
                    i,
                    format(cm[i, j], "d"),
                    ha="center",
                    va="center",
                    color="white" if cm[i, j] > thresh else "black",
                )
        plot_filename = f"{model_id}_confusion.png"
        fig.tight_layout()
        fig.savefig(ws.outputs / plot_filename, dpi=120)
        plt.close(fig)
    else:
        mse = float(mean_squared_error(y_test, y_pred))
        rmse = float(np.sqrt(mse))
        mae = float(mean_absolute_error(y_test, y_pred))
        r2 = float(r2_score(y_test, y_pred))
        metrics = {
            "mse": mse,
            "rmse": rmse,
            "mae": mae,
            "r2": r2,
        }
        fig, ax = plt.subplots(figsize=(6, 5))
        ax.scatter(y_test, y_pred, alpha=0.6, edgecolors="k", linewidths=0.3)
        lims = [
            min(float(y_test.min()), float(y_pred.min())),
            max(float(y_test.max()), float(y_pred.max())),
        ]
        ax.plot(lims, lims, "r--", lw=1)
        ax.set_xlabel("Actual")
        ax.set_ylabel("Predicted")
        ax.set_title("Regression: actual vs predicted")
        plot_filename = f"{model_id}_regression.png"
        fig.tight_layout()
        fig.savefig(ws.outputs / plot_filename, dpi=120)
        plt.close(fig)

    metrics = _sanitize_for_json(metrics)

    duration_sec = time.time() - t_train_start
    from ml_reproducibility import finalize_reproducibility, optional_external_loggers

    sweep_meta = (req.extra_context or {}).get("sweep") if req.extra_context else None
    repro = finalize_reproducibility(
        repro_base,
        duration_sec=duration_sec,
        metrics=metrics,
        sweep_meta=sweep_meta,
    )
    repro["model_id"] = model_id
    flat_m: dict[str, float] = {}
    for k, v in metrics.items():
        if isinstance(v, (int, float)) and v is not None:
            fv = float(v)
            if not math.isnan(fv) and not math.isinf(fv):
                flat_m[k] = fv
        elif isinstance(v, np.number):
            flat_m[k] = float(v)
    repro = optional_external_loggers(
        repro,
        params={
            "model_type": req.model_type,
            "task": req.task,
            "test_size": req.test_size,
            "random_state": req.random_state,
        },
        metrics=flat_m,
    )
    repro = _sanitize_for_json(repro)

    interp_ko = _metrics_interpretation_ko(req.task, metrics)

    # 전처리 요약 정보
    preprocessing_summary: Dict[str, Any] = {
        "numeric_features": numeric_features,
        "categorical_features": categorical_features,
        "numeric_imputation": "median",
        "categorical_imputation": "most_frequent",
        "one_hot_encoding": bool(categorical_features),
    }

    artifact = {
        "pipeline": model_pipeline,
        "feature_columns": feature_cols,
        "target_column": req.target_column,
        "task": req.task,
        "model_type": req.model_type,
        "label_encoder": label_encoder,
        "preprocessing": preprocessing_summary,
    }
    joblib.dump(artifact, _model_path(ws.models, model_id))

    created_at = datetime.utcnow().isoformat() + "Z"
    model_path_str = str(_model_path(ws.models, model_id))
    output_chart_path_str = str(ws.outputs / plot_filename) if plot_filename else None

    meta = {
        "model_id": model_id,
        "filename": req.filename,
        "target_column": req.target_column,
        "feature_columns": feature_cols,
        "task": req.task,
        "model_type": req.model_type,
        "metrics": metrics,
        "metrics_interpretation_ko": interp_ko,
        "preprocessing": preprocessing_summary,
        "plot_file": plot_filename,
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "created_at": created_at,
        "model_path": model_path_str,
        "output_chart_path": output_chart_path_str,
        "reproducibility": repro,
    }
    _metadata_path(ws.models, model_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # 실험 이력 파일에 간단한 정보 추가 저장
    history_entry = {
        "model_id": model_id,
        "dataset": req.filename,
        "created_at": created_at,
        "target_column": req.target_column,
        "feature_columns": feature_cols,
        "model_type": req.model_type,
        "task_type": req.task,
        "metrics": metrics,
        "model_path": model_path_str,
        "output_chart_path": output_chart_path_str,
    }
    hf = ws.history_file
    try:
        if hf.is_file():
            raw = json.loads(hf.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                history_data: List[Dict[str, Any]] = raw
            else:
                history_data = raw.get("history", [])
        else:
            history_data = []
    except (json.JSONDecodeError, OSError):
        history_data = []

    history_entry["reproducibility"] = repro
    history_data.append(history_entry)
    hf.parent.mkdir(parents=True, exist_ok=True)
    hf.write_text(
        json.dumps({"history": history_data}, indent=2),
        encoding="utf-8",
    )

    if req.filename == PILOT_DEMAND_TRAIN_CSV and req.task == "regression":
        _append_pilot_demand_report(
            ws,
            "1. 모델 학습 (Pilot 수요예측)",
            [
                f"- **데이터**: `{req.filename}`",
                f"- **타깃**: `{req.target_column}`",
                f"- **모델**: `{req.model_type}`",
                f"- **검증 RMSE / MAE / R²**: {metrics['rmse']:.4f} / {metrics['mae']:.4f} / {metrics['r2']:.4f}",
                "",
                "### 지표 해석 (자동 생성, Colab 스타일)",
                "",
                interp_ko,
            ],
        )

    if current_user is not None:
        workspace_kind = "shared" if current_user.role in ALL_ACCESS_ROLES else "user"
        record = ExperimentRecord(
            model_id=model_id,
            user_id=current_user.id,
            user_email=current_user.email,
            dataset=req.filename,
            target_column=req.target_column,
            feature_columns_json=json.dumps(feature_cols, ensure_ascii=False),
            task_type=req.task,
            model_type=req.model_type,
            metrics_json=json.dumps(metrics, ensure_ascii=False),
            model_path=model_path_str,
            output_chart_path=output_chart_path_str,
            workspace_kind=workspace_kind,
            created_at=datetime.utcnow(),
        )
        exp = Experiment(
            user_id=current_user.id,
            user_email=current_user.email,
            dataset=req.filename,
            target_column=req.target_column,
            feature_columns_json=json.dumps(feature_cols, ensure_ascii=False),
            task_type=req.task,
            model_type=req.model_type,
            workspace_kind=workspace_kind,
            created_at=datetime.utcnow(),
        )
        db2 = SessionLocal()
        try:
            db2.add(record)
            db2.add(exp)
            db2.flush()
            run_id = str(uuid.uuid4())
            run = ExperimentRun(
                experiment_id=exp.id,
                run_id=run_id,
                model_id=model_id,
                job_id=job_id,
                status="completed",
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                params_json=json.dumps(
                    {
                        "dataset": req.filename,
                        "target_column": req.target_column,
                        "task": req.task,
                        "model_type": req.model_type,
                        "feature_columns": feature_cols,
                        "test_size": req.test_size,
                        "random_state": req.random_state,
                    },
                    ensure_ascii=False,
                ),
                log_path=str((ws.logs / f"{job_id}.log") if job_id else ""),
                metrics_json=json.dumps(metrics, ensure_ascii=False),
                model_path=model_path_str,
                output_path=str(ws.outputs / f"{model_id}_predictions.csv"),
                output_chart_path=output_chart_path_str,
                reproducibility_json=json.dumps(repro, ensure_ascii=False),
                registry_stage="candidate",
                created_at=datetime.utcnow(),
            )
            db2.add(run)
            db2.commit()
            ldb = SessionLocal()
            try:
                from lineage_service import record_edge

                record_edge(
                    ldb,
                    user_id=current_user.id,
                    from_kind="dataset_file",
                    from_ref=req.filename,
                    to_kind="trained_model",
                    to_ref=model_id,
                    meta={"sha256": repro.get("dataset_sha256")},
                )
            finally:
                ldb.close()
        finally:
            db2.close()

    return meta


@app.post("/api/train")
def train(
    request: Request,
    req: TrainRequest,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if req.project_id is not None and not _can_edit_project_for_user(db, current_user, req.project_id):
        raise HTTPException(status_code=403, detail="해당 프로젝트 실행 권한이 없습니다.")
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    meta = _train_impl(req, ws, current_user=current_user, job_id=None)
    log_activity(db, current_user.id, "train", {"model_id": meta.get("model_id")}, request)
    return meta


class PredictRequest(BaseModel):
    model_id: str
    filename: str
    project_id: int | None = None


def _record_prediction_lineage(
    ws: WorkspacePaths,
    current_user: User | None,
    model_id: str,
    score_csv_name: str,
    out_path: Path,
) -> None:
    if current_user is None:
        return
    from ml_reproducibility import sha256_file
    from lineage_service import record_edge

    ldb = SessionLocal()
    try:
        sha = sha256_file(out_path)
        record_edge(
            ldb,
            user_id=current_user.id,
            from_kind="trained_model",
            from_ref=model_id,
            to_kind="prediction_csv",
            to_ref=out_path.name,
            meta={"score_csv": score_csv_name, "output_sha256": sha},
        )
    finally:
        ldb.close()


def _predict_impl(
    req: PredictRequest,
    ws: WorkspacePaths,
    current_user: User | None = None,
) -> dict[str, Any]:
    meta_path = _metadata_path(ws.models, req.model_id)
    if not meta_path.is_file():
        raise HTTPException(status_code=404, detail="Model not found")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    _safe_filename(req.filename)
    df = _load_csv(req.filename, ws.data)
    artifact = joblib.load(_model_path(ws.models, req.model_id))
    mode = artifact.get("mode")
    if mode == "time_series":
        target = artifact.get("target_column")
        lags = int(artifact.get("lags", 5))
        if target not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing target column for time_series: {target}")
        y = pd.to_numeric(df[target], errors="coerce").dropna()
        data = pd.DataFrame({"y": y})
        for i in range(1, lags + 1):
            data[f"lag_{i}"] = data["y"].shift(i)
        data = data.dropna()
        X = data[[f"lag_{i}" for i in range(1, lags + 1)]]
        raw_pred = artifact["model"].predict(X)
        out = pd.DataFrame({"prediction": raw_pred})
        out_path = ws.outputs / f"{req.model_id}_predictions.csv"
        out.to_csv(out_path, index=False)
        preview = json.loads(out.head(50).to_json(orient="records"))
        _record_prediction_lineage(ws, current_user, req.model_id, req.filename, out_path)
        return {"model_id": req.model_id, "rows": int(len(out)), "output_file": out_path.name, "preview": preview}
    if mode == "time_series_tft":
        raise HTTPException(
            status_code=400,
            detail="TFT 모델의 일반 예측 API는 준비 중입니다. 현재는 학습/평가 및 리포트 생성까지 지원합니다.",
        )
    if mode == "anomaly_detection":
        feature_cols = artifact["feature_columns"]
        for c in feature_cols:
            if c not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing column in CSV: {c}")
        X = df[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0)
        pred = artifact["model"].predict(X)
        score = artifact["model"].decision_function(X)
        out = pd.DataFrame(
            {
                "anomaly": (pred == -1).astype(int),
                "score": score,
            }
        )
        out_path = ws.outputs / f"{req.model_id}_predictions.csv"
        out.to_csv(out_path, index=False)
        preview = json.loads(out.head(50).to_json(orient="records"))
        _record_prediction_lineage(ws, current_user, req.model_id, req.filename, out_path)
        return {"model_id": req.model_id, "rows": int(len(out)), "output_file": out_path.name, "preview": preview}
    feature_cols: list[str] = artifact["feature_columns"]
    for c in feature_cols:
        if c not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing column in CSV: {c}")

    # 파이프라인은 내부에서 숫자/범주형 전처리를 모두 수행
    X = df[feature_cols].copy()
    raw_pred = artifact["pipeline"].predict(X)
    le: LabelEncoder | None = artifact.get("label_encoder")
    if le is not None:
        labels = le.inverse_transform(raw_pred.astype(int))
        out = pd.DataFrame({"prediction": labels})
    else:
        out = pd.DataFrame({"prediction": raw_pred})

    out_path = ws.outputs / f"{req.model_id}_predictions.csv"
    out.to_csv(out_path, index=False)

    preview = json.loads(out.head(50).to_json(orient="records"))
    _record_prediction_lineage(ws, current_user, req.model_id, req.filename, out_path)
    return {
        "model_id": req.model_id,
        "rows": int(len(out)),
        "output_file": out_path.name,
        "preview": preview,
    }


@app.post("/api/predict")
def predict(
    request: Request,
    req: PredictRequest,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    result = _predict_impl(req, ws, current_user=current_user)
    if req.filename == PILOT_DEMAND_SCORING_CSV:
        _append_pilot_demand_report(
            ws,
            "2. 별도 데이터 스코어링 (Pilot)",
            [
                f"- **입력 CSV**: `{req.filename}`",
                f"- **모델 ID**: `{req.model_id}`",
                f"- **예측 행 수**: {result.get('rows', 0)}",
                f"- **출력 파일**: `{result.get('output_file', '')}`",
                "",
                "배치 예측 CSV는 `outputs`에서 내려받을 수 있으며, **결과** 탭에서 `prediction` 열 미리보기를 확인할 수 있습니다.",
            ],
        )
    log_activity(
        db,
        current_user.id,
        "predict",
        {"model_id": req.model_id, "filename": req.filename},
        request,
    )
    return result


@app.get("/api/models")
def list_models(
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, list[dict[str, Any]]]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    items = []
    for p in sorted(ws.models.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            items.append(
                {
                    "model_id": data.get("model_id", p.stem),
                    "filename": data.get("filename"),
                    "task": data.get("task"),
                    "model_type": data.get("model_type"),
                    "metrics": data.get("metrics"),
                }
            )
        except (json.JSONDecodeError, OSError):
            continue
    log_activity(db, current_user.id, "list_models", {}, request)
    return {"models": items}


@app.get("/api/metrics/{model_id}")
def get_metrics(
    request: Request,
    model_id: str,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    p = _metadata_path(ws.models, model_id)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Model not found")
    log_activity(db, current_user.id, "get_metrics", {"model_id": model_id}, request)
    return json.loads(p.read_text(encoding="utf-8"))


@app.get("/api/outputs/{filename}")
def get_output_file(
    request: Request,
    filename: str,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> FileResponse:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    safe = Path(filename).name
    out_root = ws.outputs.resolve()
    path = (ws.outputs / safe).resolve()
    if not path.is_file() or path.parent != out_root:
        raise HTTPException(status_code=404, detail="File not found")
    log_activity(db, current_user.id, "download_output", {"filename": safe}, request)
    return FileResponse(path)


@app.get("/api/reports/summary")
def get_report_summary(
    request: Request,
    filename: str | None = None,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)

    if filename:
        target = (ws.outputs / Path(filename).name).resolve()
        if not target.is_file() or target.parent != ws.outputs.resolve():
            raise HTTPException(status_code=404, detail="Summary file not found")
    else:
        candidates = [p for p in ws.outputs.glob("*_summary.md") if p.is_file()]
        pilot_md = ws.outputs / "pilot_demand_lab_report.md"
        metal_md = ws.outputs / "metal_24w_forecast_report.md"
        if not candidates:
            if pilot_md.is_file():
                target = pilot_md
            elif metal_md.is_file():
                target = metal_md
            else:
                return {"filename": None, "content": "", "interpretation": ""}
        else:
            preferred = [p for p in candidates if "lee_daehyun" in p.name.lower()]
            target = max(preferred or candidates, key=lambda p: p.stat().st_mtime)

    try:
        content = target.read_text(encoding="utf-8")
    except Exception:
        content = target.read_text(encoding="utf-8", errors="ignore")

    if "pilot_demand_lab_report" in target.name.lower():
        interpretation = (
            "Pilot 수요예측 리포트입니다. 학습 단계의 RMSE·MAE·R² 및 Colab 스타일 지표 해석, "
            "이후 스코어링 CSV에 대한 예측 건수·출력 파일이 순서대로 기록됩니다. 상세는 아래 원문을 참고하세요."
        )
    elif "metal_24w_forecast_report" in target.name.lower():
        interpretation = (
            "Metal 20 SKU 수요예측 데모 리포트(정웅식 교수 시나리오)입니다. "
            "학습 데이터·특성·모델 지표, 24주×20 SKU 배치 예측 건수와 산출물 경로가 요약되어 있습니다."
        )
    else:
        lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
        total_line = next((ln for ln in lines if "Total predicted demand" in ln), "")
        window_line = next((ln for ln in lines if "Forecast window" in ln), "")
        top1 = ""
        for ln in lines:
            if ln[:2] == "1.":
                top1 = ln
                break
        interpretation_parts = [x for x in [window_line, total_line, top1] if x]
        interpretation = (
            " ".join(interpretation_parts)
            if interpretation_parts
            else "요약 파일이 연결되었으며, 상단 수요 총량/상위 품목을 중심으로 결과를 해석할 수 있습니다."
        )

    log_activity(db, current_user.id, "report_summary", {"filename": target.name}, request)
    return {"filename": target.name, "content": content, "interpretation": interpretation}


@app.get("/api/reports/files")
def get_report_files(
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    pilot_md = ws.outputs / "pilot_demand_lab_report.md"
    pilot_extra: list[str] = []
    if pilot_md.is_file():
        pilot_extra.append(pilot_md.name)
    metal_md = ws.outputs / "metal_24w_forecast_report.md"
    metal_extra: list[str] = []
    if metal_md.is_file():
        metal_extra.append(metal_md.name)
    files = [p.name for p in ws.outputs.glob("lee_daehyun_tft_forecast_*.csv") if p.is_file()]
    files = sorted(files, reverse=True)
    preferred = []
    for key in ["_wide_by_model.csv", "_top20_total.csv", "_24w_fast.csv"]:
        matched = [f for f in files if f.endswith(key)]
        preferred.extend(matched)
    rest = [f for f in files if f not in preferred]
    ordered = pilot_extra + metal_extra + preferred + rest
    log_activity(db, current_user.id, "report_files", {"count": len(ordered)}, request)
    return {"files": ordered}


@app.get("/api/reports/preview")
def preview_report_file(
    request: Request,
    filename: str,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """리포트 출력물(.md / .csv) 미리보기. CSV는 최대 500행까지."""
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    safe = Path(filename).name
    path = (ws.outputs / safe).resolve()
    out_root = ws.outputs.resolve()
    if not path.is_file() or path.parent != out_root:
        raise HTTPException(status_code=404, detail="File not found")
    ext = path.suffix.lower()
    if ext == ".md":
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            content = path.read_text(encoding="utf-8", errors="ignore")
        log_activity(db, current_user.id, "report_preview", {"filename": safe}, request)
        return {"filename": safe, "kind": "markdown", "content": content}
    if ext == ".csv":
        try:
            df = pd.read_csv(path, nrows=501, encoding="utf-8")
        except Exception:
            try:
                df = pd.read_csv(path, nrows=501, encoding="cp949")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"CSV 읽기 실패: {e}") from e
        truncated = len(df) > 500
        if truncated:
            df = df.iloc[:500]
        log_activity(db, current_user.id, "report_preview", {"filename": safe}, request)
        return {
            "filename": safe,
            "kind": "csv",
            "columns": [str(c) for c in df.columns.tolist()],
            "rows": df.fillna("").astype(str).values.tolist(),
            "truncated": truncated,
        }
    raise HTTPException(
        status_code=400,
        detail="미리보기는 .md 또는 .csv 파일만 지원합니다.",
    )


@app.get("/api/reports/download-excel")
def download_report_excel(
    request: Request,
    filename: str,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """CSV 또는 마크다운 리포트를 Excel(.xlsx)로 내려받기."""
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    safe = Path(filename).name
    path = (ws.outputs / safe).resolve()
    out_root = ws.outputs.resolve()
    if not path.is_file() or path.parent != out_root:
        raise HTTPException(status_code=404, detail="File not found")
    ext = path.suffix.lower()
    buf = io.BytesIO()
    try:
        if ext == ".csv":
            try:
                df = pd.read_csv(path, encoding="utf-8")
            except Exception:
                df = pd.read_csv(path, encoding="cp949")
            df.to_excel(buf, index=False, engine="openpyxl")
        elif ext == ".md":
            text = path.read_text(encoding="utf-8", errors="replace")
            pd.DataFrame({"내용": text.splitlines()}).to_excel(buf, index=False, engine="openpyxl")
        else:
            raise HTTPException(
                status_code=400,
                detail="Excel 변환은 .csv 또는 .md 파일만 지원합니다.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel 생성 실패: {e}") from e
    buf.seek(0)
    out_name = f"{path.stem}.xlsx"
    log_activity(db, current_user.id, "report_download_excel", {"filename": safe}, request)
    cd = (
        "attachment; "
        f'filename="{out_name}"; '
        f"filename*=UTF-8''{quote(out_name)}"
    )
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": cd},
    )


# ---------------------------------------------------------------------------
# Public API endpoints (without /api prefix) requested in the specification
# ---------------------------------------------------------------------------


@app.post("/upload")
async def upload_csv_public(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """CSV 업로드 (POST /upload)

    - 업로드된 CSV 파일을 /data 폴더에 저장합니다.
    - 파일 이름, 행/열 수, 열 이름 목록을 반환합니다.
    """

    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    result = await _upload_csv_core(file, ws.data)
    log_activity(db, current_user.id, "upload", {"filename": result["filename"]}, request)
    return _finish_upload_with_catalog(db, current_user, result)


@app.get("/preview/{filename}")
def preview_public(
    request: Request,
    filename: str,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """CSV 미리보기 (GET /preview/{filename})

    - 업로드된 CSV를 읽어 상위 20행을 반환합니다.
    - 열 이름과 판다스가 추론한 dtype 정보도 함께 제공합니다.
    """

    safe_name = _safe_filename(filename)
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    df = _load_csv(safe_name, ws.data)
    head = df.head(20)

    dtypes: Dict[str, str] = {col: str(dtype) for col, dtype in df.dtypes.items()}
    log_activity(db, current_user.id, "preview_public", {"filename": safe_name}, request)

    return {
        "filename": safe_name,
        "rows": int(len(df)),
        "columns": list(df.columns),
        "dtypes": dtypes,
        "data": json.loads(head.to_json(orient="records", date_format="iso")),
    }


@app.post("/train")
def train_public(
    request: Request,
    payload: TrainPayload,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """모델 학습 (POST /train)

    - 요청 본문(JSON):
        - filename
        - target_column
        - feature_columns
        - model_type
        - task_type ("regression" | "classification")
    - 내부적으로 `TrainRequest`로 변환한 뒤, 기존 학습 로직을 재사용합니다.
    """

    internal_req = TrainRequest(
        filename=payload.filename,
        target_column=payload.target_column,
        task=payload.task_type,
        model_type=payload.model_type,
        feature_columns=payload.feature_columns,
    )
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    meta = _train_impl(internal_req, ws, current_user=current_user, job_id=None)
    log_activity(db, current_user.id, "train", {"model_id": meta.get("model_id")}, request)
    return meta


class PredictFromRowsRequest(BaseModel):
    """행 데이터를 직접 전달하여 예측하는 요청 스키마 (POST /predict)."""

    model_filename: str = Field(
        ...,
        description="저장된 모델 파일 이름(.joblib 포함/미포함 모두 허용, 예: '1234.joblib' 또는 '1234')",
    )
    rows: List[Dict[str, Any]] = Field(
        ...,
        description="예측에 사용할 입력 행들의 리스트 (각 원소는 열 이름 → 값 딕셔너리)",
    )


@app.post("/predict")
def predict_from_rows(
    request: Request,
    req: PredictFromRowsRequest,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """행 기반 예측 (POST /predict)

    - 입력:
        - model_filename: /models 아래에 저장된 모델 파일 이름
        - rows: 예측에 사용할 행 데이터 목록
    - 출력:
        - predictions: 예측 결과 리스트
    """

    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    model_stem = Path(req.model_filename).stem
    model_path = _model_path(ws.models, model_stem)
    if not model_path.is_file():
        raise HTTPException(status_code=404, detail="Model file not found")

    if not req.rows:
        raise HTTPException(status_code=400, detail="No rows provided for prediction")

    artifact = joblib.load(model_path)
    feature_cols: List[str] = artifact["feature_columns"]

    df = pd.DataFrame(req.rows)
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing feature columns in rows: {', '.join(missing)}",
        )

    X = df[feature_cols].copy()
    raw_pred = artifact["pipeline"].predict(X)
    le: LabelEncoder | None = artifact.get("label_encoder")
    if le is not None:
        predictions: List[Any] = le.inverse_transform(raw_pred.astype(int)).tolist()
    else:
        predictions = [float(v) if isinstance(v, (int, float, np.number)) else v for v in raw_pred]

    log_activity(
        db,
        current_user.id,
        "predict_rows",
        {"model": model_stem, "n_rows": len(req.rows)},
        request,
    )
    return {"model": model_stem, "predictions": predictions}


@app.get("/history")
def history(
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """학습 이력 조회 (GET /history)

    - 기본적으로 experiment_history.json 에 저장된 이력을 반환합니다.
    - 파일이 없거나 손상된 경우, /models 메타데이터와 /outputs 폴더를
      스캔하여 가능한 정보를 재구성합니다.
    """

    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    hf = ws.history_file

    # 1) SQLite(v2: Experiment + ExperimentRun) 우선 조회
    q2 = db.query(ExperimentRun, Experiment).join(
        Experiment, ExperimentRun.experiment_id == Experiment.id
    )
    if current_user.role not in ALL_ACCESS_ROLES:
        q2 = q2.filter(Experiment.user_id == current_user.id)
    rows_v2 = q2.order_by(ExperimentRun.created_at.desc()).all()
    if rows_v2:
        items_db: List[Dict[str, Any]] = []
        for run, exp in rows_v2:
            try:
                feature_cols = json.loads(exp.feature_columns_json or "[]")
            except json.JSONDecodeError:
                feature_cols = []
            try:
                metrics = json.loads(run.metrics_json or "{}")
            except json.JSONDecodeError:
                metrics = {}
            try:
                repro = json.loads(run.reproducibility_json or "{}")
            except json.JSONDecodeError:
                repro = {}
            reg_stage = getattr(run, "registry_stage", None) or repro.get(
                "registry_stage", "none"
            )
            items_db.append(
                {
                    "model_id": run.model_id,
                    "job_id": run.job_id,
                    "dataset": exp.dataset,
                    "created_at": (
                        run.created_at.isoformat() + "Z"
                        if hasattr(run.created_at, "isoformat")
                        else str(run.created_at)
                    ),
                    "target_column": exp.target_column,
                    "feature_columns": feature_cols,
                    "model_type": exp.model_type,
                    "task_type": exp.task_type,
                    "status": run.status,
                    "metrics": metrics,
                    "model_path": run.model_path,
                    "output_chart_path": run.output_chart_path,
                    "output_chart_file": (
                        Path(run.output_chart_path).name
                        if run.output_chart_path
                        else None
                    ),
                    "registry_stage": reg_stage,
                    "reproducibility": repro,
                    "duration_sec": repro.get("duration_sec"),
                    "tagged_best": bool(repro.get("tagged_best")),
                }
            )
        log_activity(db, current_user.id, "history", {"source": "sqlite_v2"}, request)
        return {"history": items_db}

    # 1-b) 레거시 SQLite(experiment_records) 조회
    q = db.query(ExperimentRecord)
    if current_user.role not in ALL_ACCESS_ROLES:
        q = q.filter(ExperimentRecord.user_id == current_user.id)
    rows = q.order_by(ExperimentRecord.created_at.desc()).all()
    if rows:
        items_db: List[Dict[str, Any]] = []
        for r in rows:
            try:
                feature_cols = json.loads(r.feature_columns_json or "[]")
            except json.JSONDecodeError:
                feature_cols = []
            try:
                metrics = json.loads(r.metrics_json or "{}")
            except json.JSONDecodeError:
                metrics = {}
            items_db.append(
                {
                    "model_id": r.model_id,
                    "dataset": r.dataset,
                    "created_at": (
                        r.created_at.isoformat() + "Z"
                        if hasattr(r.created_at, "isoformat")
                        else str(r.created_at)
                    ),
                    "target_column": r.target_column,
                    "feature_columns": feature_cols,
                    "model_type": r.model_type,
                    "task_type": r.task_type,
                    "metrics": metrics,
                    "model_path": r.model_path,
                    "output_chart_path": r.output_chart_path,
                    "output_chart_file": (
                        Path(r.output_chart_path).name
                        if r.output_chart_path
                        else None
                    ),
                }
            )
        log_activity(db, current_user.id, "history", {"source": "sqlite_legacy"}, request)
        return {"history": items_db}

    # 2) experiment_history.json 조회
    if hf.is_file():
        try:
            raw = json.loads(hf.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                log_activity(db, current_user.id, "history", {"source": "history_file"}, request)
                return {"history": raw}
            if isinstance(raw, dict) and isinstance(raw.get("history"), list):
                log_activity(db, current_user.id, "history", {"source": "history_file"}, request)
                return {"history": raw["history"]}
        except (json.JSONDecodeError, OSError):
            pass

    # 3) 폴백: 모델 메타데이터와 출력 파일을 스캔해서 이력 구성
    items: List[Dict[str, Any]] = []

    for meta_path in sorted(ws.models.glob("*.json")):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue

        model_id = meta.get("model_id", meta_path.stem)
        related_outputs = sorted(
            p.name for p in ws.outputs.glob(f"{model_id}_*") if p.is_file()
        )

        items.append(
            {
                "model_id": model_id,
                "dataset": meta.get("filename"),
                "created_at": meta.get("created_at"),
                "target_column": meta.get("target_column"),
                "feature_columns": meta.get("feature_columns"),
                "model_type": meta.get("model_type"),
                "task_type": meta.get("task"),
                "metrics": meta.get("metrics"),
                "model_path": meta.get("model_path"),
                "output_chart_path": meta.get("output_chart_path"),
                "outputs": related_outputs,
            }
        )

    log_activity(db, current_user.id, "history", {}, request)
    return {"history": items}


class TrainJobPayload(BaseModel):
    filename: str
    target_column: str
    task: Literal["classification", "regression", "time_series", "anomaly_detection"]
    model_type: Literal[
        "linear_regression",
        "ridge",
        "lasso",
        "elastic_net",
        "random_forest",
        "xgboost",
        "gradient_boosting",
        "extra_trees",
        "hist_gradient_boosting",
        "logistic_regression",
        "svc_rbf",
        "svr_rbf",
        "tft",
        "isolation_forest",
    ]
    feature_columns: List[str] | None = None
    test_size: float = Field(0.2, ge=0.1, le=0.5)
    random_state: int = 42
    project_id: int | None = None


class PredictJobPayload(BaseModel):
    model_id: str
    filename: str
    project_id: int | None = None


JOBS_META_PATH = STORAGE_ROOT / "job_registry.json"
JOBS_LOCK = threading.Lock()
JOBS: dict[str, dict[str, Any]] = {}


def _load_jobs() -> None:
    if not JOBS_META_PATH.is_file():
        return
    try:
        raw = json.loads(JOBS_META_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    if isinstance(raw, dict):
        JOBS.update(raw)


def _persist_jobs() -> None:
    JOBS_META_PATH.write_text(json.dumps(JOBS, indent=2), encoding="utf-8")


def _visible_jobs_for_user(current_user: User) -> list[tuple[str, dict[str, Any]]]:
    """(job_id, job_dict) 목록. job_dict 내부에는 id 키가 없을 수 있어 목록 API에서 job_id를 넣어 준다."""
    if current_user.role in ALL_ACCESS_ROLES:
        return list(JOBS.items())
    return [(jid, j) for jid, j in JOBS.items() if j.get("user_id") == current_user.id]


def _set_job(job_id: str, **kwargs: Any) -> None:
    with JOBS_LOCK:
        JOBS.setdefault(job_id, {})
        JOBS[job_id].update(kwargs)
        JOBS[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
        _persist_jobs()


def _is_privileged(user: User) -> bool:
    return user.role in ALL_ACCESS_ROLES


def _can_view_project_for_user(db: Session, current_user: User, project_id: int) -> bool:
    if _is_privileged(current_user):
        return True
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        return False
    if p.owner_id == current_user.id:
        return True
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == current_user.id)
        .first()
    )
    return bool(member and member.role in {"owner", "editor", "viewer", "member"})


def _can_edit_project_for_user(db: Session, current_user: User, project_id: int) -> bool:
    if _is_privileged(current_user):
        return True
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        return False
    if p.owner_id == current_user.id:
        return True
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == current_user.id)
        .first()
    )
    return bool(member and member.role in {"owner", "editor"})


def _has_job_access(current_user: User, job: dict[str, Any], db: Session) -> bool:
    if _is_privileged(current_user) or job.get("user_id") == current_user.id:
        return True
    payload = job.get("payload") or {}
    project_id = payload.get("project_id")
    if isinstance(project_id, int):
        return _can_view_project_for_user(db, current_user, project_id)
    return False


def _is_cancel_requested(job_id: str) -> bool:
    job = JOBS.get(job_id) or {}
    return bool(job.get("cancel_requested"))


def _recover_jobs_on_startup() -> None:
    # 서버 재시작 시 running/queued 상태를 복구 표시
    now = datetime.now(timezone.utc).isoformat()
    for job_id, job in list(JOBS.items()):
        if job.get("status") in {"running", "queued"}:
            job["status"] = "recovered"
            job["recovery_note"] = "Server restarted while job was in progress."
            job["updated_at"] = now
    _persist_jobs()


def _append_job_log(ws: WorkspacePaths, job_id: str, line: str) -> None:
    log_path = ws.logs / f"{job_id}.log"
    ts = datetime.now(timezone.utc).isoformat()
    with log_path.open("a", encoding="utf-8") as f:
        f.write(f"[{ts}] {line}\n")


def _ensure_run_for_job(
    *,
    current_user: User,
    job_id: str,
    kind: str,
    payload: dict[str, Any],
    ws: WorkspacePaths,
) -> str:
    db = SessionLocal()
    try:
        exp = Experiment(
            user_id=current_user.id,
            user_email=current_user.email,
            dataset=str(payload.get("filename", "")),
            target_column=str(payload.get("target_column", "")),
            feature_columns_json=json.dumps(payload.get("feature_columns") or [], ensure_ascii=False),
            task_type=str(payload.get("task", kind)),
            model_type=str(payload.get("model_type", "")),
            workspace_kind="shared" if current_user.role in ALL_ACCESS_ROLES else "user",
            created_at=datetime.utcnow(),
        )
        db.add(exp)
        db.flush()
        run_id = str(uuid.uuid4())
        run = ExperimentRun(
            experiment_id=exp.id,
            run_id=run_id,
            model_id=f"pending-{job_id}",
            job_id=job_id,
            status="queued",
            started_at=None,
            finished_at=None,
            params_json=json.dumps(payload, ensure_ascii=False),
            log_path=str(ws.logs / f"{job_id}.log"),
            metrics_json="{}",
            model_path=None,
            output_path=None,
            output_chart_path=None,
            reproducibility_json="{}",
            registry_stage="none",
            created_at=datetime.utcnow(),
        )
        db.add(run)
        db.commit()
        return run_id
    finally:
        db.close()


def _update_run_by_job_id(job_id: str, **kwargs: Any) -> None:
    db = SessionLocal()
    try:
        run = db.query(ExperimentRun).filter(ExperimentRun.job_id == job_id).order_by(
            ExperimentRun.created_at.desc()
        ).first()
        if not run:
            return
        for k, v in kwargs.items():
            if hasattr(run, k):
                setattr(run, k, v)
        db.commit()
    finally:
        db.close()


def _artifact_run_dir(ws: WorkspacePaths, run_id: str | None) -> Path:
    rid = run_id or "unknown-run"
    d = ws.data / "artifacts" / rid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _copy_if_exists(src: str | None, dest_dir: Path) -> str | None:
    if not src:
        return None
    p = Path(src)
    if not p.is_file():
        return None
    out = dest_dir / p.name
    shutil.copy2(p, out)
    return str(out)


def _run_train_job(
    job_id: str,
    req: TrainRequest,
    ws: WorkspacePaths,
    user_id: int | None,
) -> None:
    if _is_cancel_requested(job_id):
        _set_job(
            job_id,
            status="cancelled",
            progress=100,
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        return
    _set_job(
        job_id,
        status="running",
        progress=5,
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    _append_job_log(ws, job_id, "Job started: train")
    _update_run_by_job_id(
        job_id,
        status="running",
        started_at=datetime.utcnow(),
    )
    try:
        _set_job(job_id, progress=15, phase="loading_user")
        user_obj = None
        if user_id is not None:
            db3 = SessionLocal()
            try:
                user_obj = db3.query(User).filter(User.id == user_id).first()
            finally:
                db3.close()
        if _is_cancel_requested(job_id):
            _set_job(job_id, status="cancelled", progress=100)
            _append_job_log(ws, job_id, "Job cancelled before training.")
            _update_run_by_job_id(
                job_id,
                status="cancelled",
                finished_at=datetime.utcnow(),
            )
            return
        _set_job(job_id, progress=35, phase="training")
        result = _train_impl(req, ws, current_user=user_obj, job_id=job_id)
        _set_job(job_id, status="completed", progress=100, phase="done", result=result)
        _append_job_log(ws, job_id, f"Job completed: model_id={result.get('model_id')}")
        run_id = (JOBS.get(job_id) or {}).get("run_id")
        adir = _artifact_run_dir(ws, run_id)
        model_path_art = _copy_if_exists(result.get("model_path"), adir)
        chart_path_art = _copy_if_exists(result.get("output_chart_path"), adir)
        upd: dict[str, Any] = {
            "status": "completed",
            "model_id": result.get("model_id") or f"completed-{job_id}",
            "metrics_json": json.dumps(result.get("metrics") or {}, ensure_ascii=False),
            "model_path": model_path_art or result.get("model_path"),
            "output_chart_path": chart_path_art or result.get("output_chart_path"),
            "finished_at": datetime.utcnow(),
            "registry_stage": "candidate",
        }
        repro = result.get("reproducibility")
        if repro:
            upd["reproducibility_json"] = json.dumps(repro, ensure_ascii=False)
        _update_run_by_job_id(job_id, **upd)
    except Exception as e:
        _set_job(job_id, status="failed", error=str(e), traceback=traceback.format_exc())
        _append_job_log(ws, job_id, f"Job failed: {e}")
        _update_run_by_job_id(
            job_id,
            status="failed",
            finished_at=datetime.utcnow(),
        )
    finally:
        _set_job(job_id, finished_at=datetime.now(timezone.utc).isoformat())


def _run_predict_job(
    job_id: str, req: PredictRequest, ws: WorkspacePaths, user_id: int | None
) -> None:
    if _is_cancel_requested(job_id):
        _set_job(
            job_id,
            status="cancelled",
            progress=100,
            finished_at=datetime.now(timezone.utc).isoformat(),
        )
        return
    _set_job(
        job_id,
        status="running",
        progress=10,
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    _append_job_log(ws, job_id, "Job started: predict")
    _update_run_by_job_id(
        job_id,
        status="running",
        started_at=datetime.utcnow(),
    )
    try:
        if _is_cancel_requested(job_id):
            _set_job(job_id, status="cancelled", progress=100)
            _append_job_log(ws, job_id, "Job cancelled before prediction.")
            _update_run_by_job_id(
                job_id,
                status="cancelled",
                finished_at=datetime.utcnow(),
            )
            return
        _set_job(job_id, progress=60, phase="predicting")
        user_obj = None
        if user_id is not None:
            dbu = SessionLocal()
            try:
                user_obj = dbu.query(User).filter(User.id == user_id).first()
            finally:
                dbu.close()
        result = _predict_impl(req, ws, current_user=user_obj)
        _set_job(job_id, status="completed", progress=100, phase="done", result=result)
        _append_job_log(ws, job_id, f"Job completed: output={result.get('output_file')}")
        run_id = (JOBS.get(job_id) or {}).get("run_id")
        adir = _artifact_run_dir(ws, run_id)
        out_src = str(ws.outputs / (result.get("output_file") or ""))
        out_art = _copy_if_exists(out_src, adir)
        _update_run_by_job_id(
            job_id,
            status="completed",
            output_path=out_art or out_src,
            finished_at=datetime.utcnow(),
        )
    except Exception as e:
        _set_job(job_id, status="failed", error=str(e), traceback=traceback.format_exc())
        _append_job_log(ws, job_id, f"Job failed: {e}")
        _update_run_by_job_id(
            job_id,
            status="failed",
            finished_at=datetime.utcnow(),
        )
    finally:
        _set_job(job_id, finished_at=datetime.now(timezone.utc).isoformat())


@app.post("/api/jobs/train")
def submit_train_job(
    payload: TrainJobPayload,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if payload.project_id is not None and not _can_edit_project_for_user(db, current_user, payload.project_id):
        raise HTTPException(status_code=403, detail="해당 프로젝트 실행 권한이 없습니다.")
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    job_id = str(uuid.uuid4())
    _set_job(
        job_id,
        kind="train",
        status="queued",
        progress=0,
        phase="queued",
        user_id=current_user.id,
        user_email=current_user.email,
        payload=payload.model_dump(),
        log_path=str(ws.logs / f"{job_id}.log"),
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    run_id = _ensure_run_for_job(
        current_user=current_user,
        job_id=job_id,
        kind="train",
        payload=payload.model_dump(),
        ws=ws,
    )
    _set_job(job_id, run_id=run_id)
    req = TrainRequest(**payload.model_dump())
    th = threading.Thread(
        target=_run_train_job,
        args=(job_id, req, ws, current_user.id),
        daemon=True,
    )
    th.start()
    return {"job_id": job_id, "status": "queued"}


@app.post("/api/jobs/predict")
def submit_predict_job(
    payload: PredictJobPayload,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if payload.project_id is not None and not _can_edit_project_for_user(db, current_user, payload.project_id):
        raise HTTPException(status_code=403, detail="해당 프로젝트 실행 권한이 없습니다.")
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    job_id = str(uuid.uuid4())
    _set_job(
        job_id,
        kind="predict",
        status="queued",
        progress=0,
        phase="queued",
        user_id=current_user.id,
        user_email=current_user.email,
        payload=payload.model_dump(),
        log_path=str(ws.logs / f"{job_id}.log"),
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    run_id = _ensure_run_for_job(
        current_user=current_user,
        job_id=job_id,
        kind="predict",
        payload=payload.model_dump(),
        ws=ws,
    )
    _set_job(job_id, run_id=run_id)
    req = PredictRequest(**payload.model_dump())
    th = threading.Thread(
        target=_run_predict_job,
        args=(job_id, req, ws, current_user.id),
        daemon=True,
    )
    th.start()
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs")
def list_jobs(current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    jobs_raw = sorted(
        _visible_jobs_for_user(current_user),
        key=lambda x: x[1].get("submitted_at", ""),
        reverse=True,
    )
    jobs = []
    for job_id, j in jobs_raw:
        row = dict(j)
        row["job_id"] = job_id
        result = row.get("result") or {}
        model_id = result.get("model_id")
        output_file = result.get("output_file")
        if model_id:
            row["history_link"] = f"/history?model_id={model_id}"
        if output_file:
            row["artifact_output_download"] = f"/api/artifacts/download/output/{output_file}"
        jobs.append(row)
    return {"jobs": jobs}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db = SessionLocal()
    try:
        allowed = _has_job_access(current_user, job, db)
    finally:
        db.close()
    if not allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    out = dict(job)
    out.setdefault("job_id", job_id)
    return out


@app.get("/api/jobs/{job_id}/logs")
def get_job_logs(job_id: str, current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db = SessionLocal()
    try:
        allowed = _has_job_access(current_user, job, db)
    finally:
        db.close()
    if not allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    log_path_raw = job.get("log_path")
    if not log_path_raw:
        return {"job_id": job_id, "logs": []}
    log_path = Path(log_path_raw)
    if not log_path.is_file():
        return {"job_id": job_id, "logs": []}
    lines = log_path.read_text(encoding="utf-8").splitlines()
    return {"job_id": job_id, "logs": lines[-500:]}


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str, current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db = SessionLocal()
    try:
        allowed = _has_job_access(current_user, job, db)
    finally:
        db.close()
    if not allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    if job.get("status") not in {"queued", "running"}:
        raise HTTPException(status_code=400, detail="queued/running 작업만 취소할 수 있습니다.")
    _set_job(
        job_id,
        cancel_requested=True,
        status="cancelling" if job.get("status") == "running" else "cancelled",
        phase="cancelling",
        progress=job.get("progress", 0),
    )
    if job.get("status") == "queued":
        _update_run_by_job_id(
            job_id,
            status="cancelled",
            finished_at=datetime.utcnow(),
        )
    return {"job_id": job_id, "status": JOBS[job_id]["status"]}


@app.post("/api/jobs/{job_id}/retry")
def retry_job(job_id: str, current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    old = JOBS.get(job_id)
    if not old:
        raise HTTPException(status_code=404, detail="Job not found")
    db = SessionLocal()
    try:
        allowed = _has_job_access(current_user, old, db)
    finally:
        db.close()
    if not allowed:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    if old.get("status") not in {"failed", "cancelled", "recovered"}:
        raise HTTPException(status_code=400, detail="failed/cancelled/recovered 작업만 재시도할 수 있습니다.")
    payload = old.get("payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="재시도 가능한 payload가 없습니다.")

    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    new_job_id = str(uuid.uuid4())
    kind = old.get("kind")
    _set_job(
        new_job_id,
        kind=kind,
        status="queued",
        progress=0,
        phase="queued",
        user_id=current_user.id,
        user_email=current_user.email,
        payload=payload,
        retry_of=job_id,
        log_path=str(ws.logs / f"{new_job_id}.log"),
        submitted_at=datetime.now(timezone.utc).isoformat(),
    )
    run_id = _ensure_run_for_job(
        current_user=current_user,
        job_id=new_job_id,
        kind=kind,
        payload=payload,
        ws=ws,
    )
    _set_job(new_job_id, run_id=run_id)
    if kind in ("train", "sweep_train"):
        req = TrainRequest(**payload)
        th = threading.Thread(
            target=_run_train_job,
            args=(new_job_id, req, ws, current_user.id),
            daemon=True,
        )
    elif kind == "predict":
        req = PredictRequest(**payload)
        th = threading.Thread(
            target=_run_predict_job,
            args=(new_job_id, req, ws, current_user.id),
            daemon=True,
        )
    else:
        raise HTTPException(status_code=400, detail="지원하지 않는 job kind 입니다.")
    th.start()
    return {"job_id": new_job_id, "status": "queued", "retry_of": job_id}


@app.get("/api/datasets/detail")
def list_dataset_details(current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    items = []
    for p in sorted(ws.data.glob("*.csv")):
        st = p.stat()
        items.append(
            {
                "filename": p.name,
                "size_bytes": st.st_size,
                "updated_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
            }
        )
    return {"datasets": items}


@app.delete("/api/datasets/{filename}")
def delete_dataset(filename: str, current_user: User = Depends(get_current_approved_member)) -> dict[str, str]:
    safe = _safe_filename(filename)
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    p = ws.data / safe
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    p.unlink()
    return {"message": "삭제되었습니다."}


@app.get("/api/artifacts")
def list_artifacts(current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    models = [p.name for p in sorted(ws.models.glob("*.joblib"))]
    metas = [p.name for p in sorted(ws.models.glob("*.json"))]
    outputs = [p.name for p in sorted(ws.outputs.glob("*")) if p.is_file()]
    db = SessionLocal()
    try:
        q = db.query(ExperimentRun, Experiment).join(
            Experiment, ExperimentRun.experiment_id == Experiment.id
        )
        if current_user.role not in ALL_ACCESS_ROLES:
            q = q.filter(Experiment.user_id == current_user.id)
        rows = q.order_by(ExperimentRun.created_at.desc()).limit(200).all()
        run_artifacts = []
        for run, exp in rows:
            run_artifacts.append(
                {
                    "run_id": run.run_id,
                    "job_id": run.job_id,
                    "status": run.status,
                    "dataset": exp.dataset,
                    "task_type": exp.task_type,
                    "model_type": exp.model_type,
                    "model_path": run.model_path,
                    "output_path": run.output_path,
                    "output_chart_path": run.output_chart_path,
                    "log_path": run.log_path,
                    "created_at": run.created_at.isoformat() + "Z" if run.created_at else None,
                }
            )
    finally:
        db.close()
    return {
        "models": models,
        "metadata": metas,
        "outputs": outputs,
        "run_artifacts": run_artifacts,
    }


@app.get("/api/artifacts/download/{kind}/{filename}")
def download_artifact(
    kind: Literal["model", "meta", "output", "log"],
    filename: str,
    current_user: User = Depends(get_current_approved_member),
) -> FileResponse:
    safe = Path(filename).name
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    if kind == "model":
        root = ws.models
        path = (root / safe).resolve()
        if path.suffix != ".joblib":
            raise HTTPException(status_code=400, detail="model 파일은 .joblib 이어야 합니다.")
    elif kind == "meta":
        root = ws.models
        path = (root / safe).resolve()
        if path.suffix != ".json":
            raise HTTPException(status_code=400, detail="meta 파일은 .json 이어야 합니다.")
    elif kind == "output":
        root = ws.outputs
        path = (root / safe).resolve()
    else:
        root = ws.logs
        path = (root / safe).resolve()
    if not path.is_file() or path.parent != root.resolve():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@app.get("/api/artifacts/download")
def download_artifact_query(
    kind: Literal["model", "meta", "output", "log", "run"],
    filename: str,
    run_id: str | None = None,
    current_user: User = Depends(get_current_approved_member),
) -> FileResponse:
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    safe = Path(filename).name
    if kind == "run":
        if not run_id:
            raise HTTPException(status_code=400, detail="run_id가 필요합니다.")
        root = _artifact_run_dir(ws, run_id).resolve()
        path = (root / safe).resolve()
    elif kind == "model":
        root = ws.models.resolve()
        path = (root / safe).resolve()
    elif kind == "meta":
        root = ws.models.resolve()
        path = (root / safe).resolve()
    elif kind == "output":
        root = ws.outputs.resolve()
        path = (root / safe).resolve()
    else:
        root = ws.logs.resolve()
        path = (root / safe).resolve()
    if not path.is_file() or path.parent != root:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@app.get("/api/monitor/system")
def system_monitor(current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    del current_user
    running_jobs = [
        {"job_id": j.get("job_id"), "kind": j.get("kind"), "status": j.get("status")}
        for j in JOBS.values()
        if j.get("status") in {"queued", "running", "cancelling"}
    ]
    vm = psutil.virtual_memory()
    du = psutil.disk_usage(str(STORAGE_ROOT))
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu_percent": psutil.cpu_percent(interval=0.2),
        "memory": {
            "total": vm.total,
            "available": vm.available,
            "percent": vm.percent,
        },
        "disk": {
            "total": du.total,
            "used": du.used,
            "free": du.free,
            "percent": du.percent,
        },
        "uptime_sec": int(time.time() - psutil.boot_time()),
        "load_avg": list(os.getloadavg()) if hasattr(os, "getloadavg") else None,
        "running_jobs": running_jobs,
    }


def _gpu_metrics_via_nvidia_smi() -> list[dict[str, Any]]:
    # Try native command first; fallback to WSL for lab GPU server setups.
    candidate_cmds = [
        [
            "nvidia-smi",
            "--query-gpu=index,name,utilization.gpu,memory.total,memory.used,temperature.gpu",
            "--format=csv,noheader,nounits",
        ],
        [
            "wsl",
            "nvidia-smi",
            "--query-gpu=index,name,utilization.gpu,memory.total,memory.used,temperature.gpu",
            "--format=csv,noheader,nounits",
        ],
    ]
    last_error: Exception | None = None
    out = ""
    for cmd in candidate_cmds:
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, timeout=4)
            break
        except Exception as e:
            last_error = e
            out = ""
    if not out:
        raise RuntimeError(f"nvidia-smi unavailable ({last_error})")
    rows = []
    for line in out.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 6:
            continue
        rows.append(
            {
                "index": int(parts[0]),
                "name": parts[1],
                "utilization_gpu_percent": float(parts[2]),
                "memory_total_mb": float(parts[3]),
                "memory_used_mb": float(parts[4]),
                "temperature_c": float(parts[5]),
            }
        )
    return rows


@app.get("/api/monitor/gpu")
def gpu_monitor(current_user: User = Depends(get_current_approved_member)) -> dict[str, Any]:
    del current_user
    try:
        gpus = _gpu_metrics_via_nvidia_smi()
        return {"timestamp": datetime.now(timezone.utc).isoformat(), "gpus": gpus}
    except Exception as e:
        fallback_name = os.getenv("LAB_GPU_NAME", "NVIDIA RTX 4080")
        assume_available = os.getenv("LAB_GPU_ASSUME_AVAILABLE", "1") == "1"
        if assume_available:
            return {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "gpus": [
                    {
                        "index": 0,
                        "name": fallback_name,
                        "utilization_gpu_percent": 0.0,
                        "memory_total_mb": 16384.0,
                        "memory_used_mb": 0.0,
                        "temperature_c": 0.0,
                        "source": "configured_fallback",
                    }
                ],
                "warning": f"실시간 GPU 조회는 실패했으나 설정 GPU를 표시합니다: {e}",
            }
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "gpus": [],
            "warning": f"GPU 정보를 읽지 못했습니다: {e}",
        }


_load_jobs()
_recover_jobs_on_startup()


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
