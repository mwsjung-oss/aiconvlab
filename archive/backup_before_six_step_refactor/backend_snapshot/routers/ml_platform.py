"""ML 실험 플랫폼: 계보·비교·레지스트리·리더보드·LLM 로그·REST 스코어."""
from __future__ import annotations

import itertools
import json
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from activity_service import log_activity
from benchmark_data import BUILTIN_DATASETS, ensure_builtin_datasets, path_for_dataset_key
from database import get_db
from dependencies import get_current_approved_member
from lineage_service import lineage_for_model
from models import Experiment, ExperimentRun, LeaderboardEntry, LLMExperimentLog, User
from user_workspace import ALL_ACCESS_ROLES, workspace_for_user

router = APIRouter(prefix="/api/ml", tags=["ml-platform"])


class RegistryPatchBody(BaseModel):
    stage: Literal["none", "candidate", "staging", "production", "archived"]
    note: str | None = None


class TagBestBody(BaseModel):
    note: str | None = None


class LeaderboardSubmitBody(BaseModel):
    dataset_key: str
    nickname: str = Field(..., min_length=1, max_length=64)
    metric_name: str = "accuracy"
    metric_value: float
    model_id: str | None = None
    experiment_run_id: str | None = None
    notes: str | None = None


class LLMEvalBody(BaseModel):
    name: str
    prompt_version: str = "v1"
    eval_dataset_label: str = "custom"
    judge_scores: dict[str, float] = Field(default_factory=dict)
    notes: str | None = None


class ScoreRowsBody(BaseModel):
    rows: list[dict[str, Any]]


class SweepRequestBody(BaseModel):
    """job_payload 는 TrainJobPayload 와 동일한 필드를 가진 JSON 객체."""

    job_payload: dict[str, Any]
    param_grid: dict[str, list[Any]]
    max_runs: int = Field(16, ge=1, le=64)


ALLOWED_SWEEP_KEYS = frozenset({"random_state", "test_size", "model_type"})


def _can_see_experiment(db: Session, current_user: User, exp: Experiment) -> bool:
    if current_user.role in ALL_ACCESS_ROLES:
        return True
    return exp.user_id == current_user.id


@router.get("/lineage")
def get_lineage(
    model_id: str,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    run = db.query(ExperimentRun).filter(ExperimentRun.model_id == model_id).first()
    if run:
        exp = db.query(Experiment).filter(Experiment.id == run.experiment_id).first()
        if exp and not _can_see_experiment(db, current_user, exp):
            raise HTTPException(status_code=403, detail="권한이 없습니다.")
    edges = lineage_for_model(db, model_id)
    log_activity(db, current_user.id, "lineage", {"model_id": model_id}, request)
    return {"model_id": model_id, "edges": edges}


@router.get("/compare")
def compare_runs(
    model_ids: str,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ids = [x.strip() for x in model_ids.split(",") if x.strip()][:32]
    if not ids:
        raise HTTPException(status_code=400, detail="model_ids 가 필요합니다.")
    rows_out: list[dict[str, Any]] = []
    for mid in ids:
        q = (
            db.query(ExperimentRun, Experiment)
            .join(Experiment, ExperimentRun.experiment_id == Experiment.id)
            .filter(ExperimentRun.model_id == mid)
        )
        if current_user.role not in ALL_ACCESS_ROLES:
            q = q.filter(Experiment.user_id == current_user.id)
        row = q.first()
        if not row:
            continue
        run, exp = row
        try:
            metrics = json.loads(run.metrics_json or "{}")
        except json.JSONDecodeError:
            metrics = {}
        try:
            repro = json.loads(run.reproducibility_json or "{}")
        except json.JSONDecodeError:
            repro = {}
        rows_out.append(
            {
                "model_id": run.model_id,
                "run_id": run.run_id,
                "dataset": exp.dataset,
                "task_type": exp.task_type,
                "model_type": exp.model_type,
                "metrics": metrics,
                "duration_sec": repro.get("duration_sec"),
                "registry_stage": run.registry_stage,
                "tagged_best": bool(repro.get("tagged_best")),
                "created_at": run.created_at.isoformat() + "Z" if run.created_at else None,
            }
        )
    log_activity(db, current_user.id, "compare_runs", {"n": len(rows_out)}, request)
    return {"runs": rows_out}


@router.post("/sweep")
def submit_param_sweep(
    body: SweepRequestBody,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from main import (
        TrainJobPayload,
        TrainRequest,
        _ensure_run_for_job,
        _run_train_job,
        _set_job,
        ensure_workspace_dirs,
        workspace_for_user,
    )

    payload = TrainJobPayload(**body.job_payload)
    grid = {
        k: v
        for k, v in body.param_grid.items()
        if k in ALLOWED_SWEEP_KEYS and isinstance(v, list) and v
    }
    if not grid:
        raise HTTPException(
            status_code=400,
            detail="param_grid 에 random_state, test_size, model_type 중 하나 이상의 리스트가 필요합니다.",
        )
    keys = list(grid.keys())
    vals = [grid[k] for k in keys]
    combos = list(itertools.product(*vals))[: body.max_runs]
    parent = str(uuid.uuid4())
    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    base = payload.model_dump()
    job_ids: list[str] = []
    for i, combo in enumerate(combos):
        overrides = dict(zip(keys, combo))
        merged = {**base, **overrides}
        req = TrainRequest(
            **merged,
            extra_context={
                "sweep": {
                    "parent_sweep_id": parent,
                    "index": i,
                    "params": overrides,
                }
            },
        )
        job_id = str(uuid.uuid4())
        _set_job(
            job_id,
            kind="sweep_train",
            status="queued",
            progress=0,
            phase="queued",
            user_id=current_user.id,
            user_email=current_user.email,
            payload=merged,
            parent_sweep_id=parent,
            sweep_index=i,
            log_path=str(ws.logs / f"{job_id}.log"),
            submitted_at=datetime.now(timezone.utc).isoformat(),
        )
        run_id = _ensure_run_for_job(
            current_user=current_user,
            job_id=job_id,
            kind="train",
            payload=merged,
            ws=ws,
        )
        _set_job(job_id, run_id=run_id)
        th = threading.Thread(
            target=_run_train_job,
            args=(job_id, req, ws, current_user.id),
            daemon=True,
        )
        th.start()
        job_ids.append(job_id)
    log_activity(db, current_user.id, "sweep_submit", {"parent": parent, "n": len(job_ids)}, request)
    return {"parent_sweep_id": parent, "job_ids": job_ids, "count": len(job_ids)}


@router.patch("/models/{model_id}/registry")
def patch_model_registry(
    model_id: str,
    body: RegistryPatchBody,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    q = (
        db.query(ExperimentRun)
        .join(Experiment, ExperimentRun.experiment_id == Experiment.id)
        .filter(ExperimentRun.model_id == model_id)
    )
    if current_user.role not in ALL_ACCESS_ROLES:
        q = q.filter(Experiment.user_id == current_user.id)
    run = q.first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    run.registry_stage = body.stage
    try:
        repro = json.loads(run.reproducibility_json or "{}")
    except json.JSONDecodeError:
        repro = {}
    repro["registry_note"] = body.note
    run.reproducibility_json = json.dumps(repro, ensure_ascii=False)
    db.commit()
    log_activity(
        db,
        current_user.id,
        "registry_patch",
        {"model_id": model_id, "stage": body.stage},
        request,
    )
    return {"model_id": model_id, "registry_stage": body.stage}


@router.post("/models/{model_id}/tag-best")
def tag_best_run(
    model_id: str,
    body: TagBestBody,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    q = (
        db.query(ExperimentRun)
        .join(Experiment, ExperimentRun.experiment_id == Experiment.id)
        .filter(ExperimentRun.model_id == model_id)
    )
    if current_user.role not in ALL_ACCESS_ROLES:
        q = q.filter(Experiment.user_id == current_user.id)
    run = q.first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        repro = json.loads(run.reproducibility_json or "{}")
    except json.JSONDecodeError:
        repro = {}
    repro["tagged_best"] = True
    if body.note:
        repro["tagged_best_note"] = body.note
    run.reproducibility_json = json.dumps(repro, ensure_ascii=False)
    db.commit()
    log_activity(db, current_user.id, "tag_best", {"model_id": model_id}, request)
    return {"model_id": model_id, "tagged_best": True}


@router.get("/leaderboard")
def get_leaderboard(
    dataset_key: str,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ensure_builtin_datasets()
    if dataset_key not in BUILTIN_DATASETS:
        raise HTTPException(status_code=400, detail="알 수 없는 dataset_key 입니다.")
    rows = (
        db.query(LeaderboardEntry)
        .filter(LeaderboardEntry.dataset_key == dataset_key)
        .order_by(LeaderboardEntry.metric_value.desc())
        .limit(100)
        .all()
    )
    log_activity(db, current_user.id, "leaderboard_get", {"dataset_key": dataset_key}, request)
    return {
        "dataset_key": dataset_key,
        "entries": [
            {
                "nickname": r.nickname,
                "metric_name": r.metric_name,
                "metric_value": r.metric_value,
                "model_id": r.model_id,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.post("/leaderboard/submit")
def submit_leaderboard(
    body: LeaderboardSubmitBody,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    ensure_builtin_datasets()
    if body.dataset_key not in BUILTIN_DATASETS:
        raise HTTPException(status_code=400, detail="지원하지 않는 dataset_key 입니다.")
    entry = LeaderboardEntry(
        dataset_key=body.dataset_key,
        nickname=body.nickname.strip()[:64],
        user_id=current_user.id,
        metric_name=body.metric_name,
        metric_value=body.metric_value,
        model_id=body.model_id,
        experiment_run_id=body.experiment_run_id,
        notes=body.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_activity(
        db,
        current_user.id,
        "leaderboard_submit",
        {"dataset_key": body.dataset_key},
        request,
    )
    return {"id": entry.id, "ok": True}


@router.get("/benchmarks")
def list_benchmarks(
    current_user: User = Depends(get_current_approved_member),
) -> dict[str, Any]:
    ensure_builtin_datasets()
    out = []
    for key, fname in BUILTIN_DATASETS.items():
        p = path_for_dataset_key(key)
        out.append(
            {
                "dataset_key": key,
                "filename": fname,
                "path_hint": str(p) if p else None,
            }
        )
    return {"benchmarks": out}


@router.post("/llm-evaluation")
def log_llm_evaluation(
    body: LLMEvalBody,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = LLMExperimentLog(
        user_id=current_user.id,
        name=body.name,
        prompt_version=body.prompt_version,
        eval_dataset_label=body.eval_dataset_label,
        judge_scores_json=json.dumps(body.judge_scores, ensure_ascii=False),
        notes=body.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_activity(db, current_user.id, "llm_eval_log", {"name": body.name}, request)
    return {"id": row.id, "ok": True}


@router.get("/llm-evaluation")
def list_llm_evaluations(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    q = db.query(LLMExperimentLog).order_by(LLMExperimentLog.created_at.desc()).limit(200)
    if current_user.role not in ALL_ACCESS_ROLES:
        q = q.filter(LLMExperimentLog.user_id == current_user.id)
    rows = q.all()
    items = []
    for r in rows:
        try:
            scores = json.loads(r.judge_scores_json or "{}")
        except json.JSONDecodeError:
            scores = {}
        items.append(
            {
                "id": r.id,
                "name": r.name,
                "prompt_version": r.prompt_version,
                "eval_dataset_label": r.eval_dataset_label,
                "judge_scores": scores,
                "notes": r.notes,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
            }
        )
    return {"logs": items}


@router.post("/models/{model_id}/score")
def score_model_rows(
    model_id: str,
    body: ScoreRowsBody,
    request: Request,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from pathlib import Path

    import joblib
    from sklearn.preprocessing import LabelEncoder

    from user_workspace import ensure_workspace_dirs

    ws = workspace_for_user(current_user)
    ensure_workspace_dirs(ws)
    model_stem = Path(model_id).stem
    model_path = ws.models / f"{model_stem}.joblib"
    if not model_path.is_file():
        raise HTTPException(status_code=404, detail="Model file not found")
    if not body.rows:
        raise HTTPException(status_code=400, detail="rows 가 비어 있습니다.")
    artifact = joblib.load(model_path)
    import pandas as pd

    feature_cols: list[str] = artifact["feature_columns"]
    df = pd.DataFrame(body.rows)
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing feature columns: {', '.join(missing)}",
        )
    X = df[feature_cols].copy()
    raw_pred = artifact["pipeline"].predict(X)
    le: LabelEncoder | None = artifact.get("label_encoder")
    if le is not None:
        predictions = le.inverse_transform(raw_pred.astype(int)).tolist()
    else:
        predictions = [float(v) if isinstance(v, (int, float)) else v for v in raw_pred]
    log_activity(
        db,
        current_user.id,
        "score_rows",
        {"model_id": model_stem, "n": len(body.rows)},
        request,
    )
    return {"model_id": model_stem, "predictions": predictions}

