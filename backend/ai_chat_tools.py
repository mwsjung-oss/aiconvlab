"""AI 채팅에서 호출하는 도구(데이터셋·학습·예측·이력 등)."""
from __future__ import annotations

import json
import traceback
from typing import Any

from fastapi import HTTPException
from ai_chat_ml_tools import ML_OPENAI_TOOL_SPECS, ML_TOOL_REGISTRY
from database import SessionLocal
from models import Experiment, ExperimentRun, User
from user_workspace import ALL_ACCESS_ROLES, ensure_workspace_dirs, workspace_for_user


def _safe(obj: Any) -> Any:
    """응답 JSON 직렬화용으로 축소."""
    if isinstance(obj, dict):
        return {k: _safe(v) for k, v in list(obj.items())[:80]}
    if isinstance(obj, list):
        return [_safe(v) for v in obj[:100]]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)[:2000]


def tool_list_datasets(user: User) -> dict[str, Any]:
    ws = workspace_for_user(user)
    ensure_workspace_dirs(ws)
    files = sorted(p.name for p in ws.data.glob("*.csv"))
    return {"ok": True, "files": files, "count": len(files)}


def tool_list_models(user: User) -> dict[str, Any]:
    ws = workspace_for_user(user)
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
    return {"ok": True, "models": items, "count": len(items)}


def tool_train(
    user: User,
    *,
    filename: str,
    target_column: str,
    task: str,
    model_type: str,
    dry_run: bool = False,
) -> dict[str, Any]:
    from main import TrainRequest, _load_csv, _train_impl

    ws = workspace_for_user(user)
    ensure_workspace_dirs(ws)
    fn = filename.strip()
    tc = target_column.strip()

    if dry_run:
        try:
            df = _load_csv(fn, ws.data)
        except HTTPException as e:
            return {"ok": False, "dry_run": True, "error": e.detail}
        except Exception as e:
            return {"ok": False, "dry_run": True, "error": str(e)}
        cols = list(df.columns)
        if tc not in cols:
            return {
                "ok": False,
                "dry_run": True,
                "error": f"타깃 열 '{tc}'이(가) CSV 컬럼에 없습니다.",
                "columns": cols,
            }
        return {
            "ok": True,
            "dry_run": True,
            "would_run": {
                "filename": fn,
                "target_column": tc,
                "task": task,
                "model_type": model_type,
                "row_count": int(len(df)),
                "columns": cols,
            },
            "note": "사용자가 실행을 확인하면 dry_run=false로 train_model을 호출하세요.",
        }

    req = TrainRequest(
        filename=fn,
        target_column=tc,
        task=task,  # type: ignore[arg-type]
        model_type=model_type,  # type: ignore[arg-type]
        feature_columns=None,
    )
    try:
        meta = _train_impl(req, ws, current_user=user, job_id=None)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()[-3000:]}
    return {
        "ok": True,
        "model_id": meta.get("model_id"),
        "metrics": meta.get("metrics"),
        "filename": meta.get("filename"),
        "task": meta.get("task"),
        "model_type": meta.get("model_type"),
    }


def tool_predict(user: User, *, model_id: str, filename: str, dry_run: bool = False) -> dict[str, Any]:
    from main import PredictRequest, _metadata_path, _predict_impl

    mid = model_id.strip()
    fn = filename.strip()
    ws = workspace_for_user(user)
    ensure_workspace_dirs(ws)

    if dry_run:
        meta_path = _metadata_path(ws.models, mid)
        data_path = ws.data / fn
        if not meta_path.is_file():
            return {
                "ok": False,
                "dry_run": True,
                "error": f"모델 메타를 찾을 수 없습니다: {mid}",
            }
        if not data_path.is_file():
            return {
                "ok": False,
                "dry_run": True,
                "error": f"스코어용 CSV가 없습니다: {fn}",
            }
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            return {"ok": False, "dry_run": True, "error": str(e)}
        return {
            "ok": True,
            "dry_run": True,
            "would_predict": {
                "model_id": mid,
                "filename": fn,
                "task": meta.get("task"),
                "model_type": meta.get("model_type"),
                "train_filename": meta.get("filename"),
            },
            "note": "사용자가 실행을 확인하면 dry_run=false로 predict_batch를 호출하세요.",
        }

    req = PredictRequest(model_id=mid, filename=fn)
    try:
        out = _predict_impl(req, ws, current_user=user)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()[-3000:]}
    return {
        "ok": True,
        "rows": out.get("rows"),
        "output_file": out.get("output_file"),
        "preview": (out.get("preview") or [])[:10],
    }


def tool_history_summary(user: User) -> dict[str, Any]:
    ws = workspace_for_user(user)
    ensure_workspace_dirs(ws)
    db = SessionLocal()
    try:
        q2 = db.query(ExperimentRun, Experiment).join(
            Experiment, ExperimentRun.experiment_id == Experiment.id
        )
        if user.role not in ALL_ACCESS_ROLES:
            q2 = q2.filter(Experiment.user_id == user.id)
        rows_v2 = q2.order_by(ExperimentRun.created_at.desc()).limit(15).all()
        items = []
        for run, exp in rows_v2:
            try:
                metrics = json.loads(run.metrics_json or "{}")
            except json.JSONDecodeError:
                metrics = {}
            items.append(
                {
                    "model_id": run.model_id,
                    "dataset": exp.dataset,
                    "task_type": exp.task_type,
                    "model_type": exp.model_type,
                    "status": run.status,
                    "metrics": metrics,
                }
            )
        if items:
            return {"ok": True, "source": "sqlite", "items": items}
    finally:
        db.close()

    hf = ws.history_file
    if hf.is_file():
        try:
            raw = json.loads(hf.read_text(encoding="utf-8"))
            hist = raw if isinstance(raw, list) else raw.get("history", [])
            return {"ok": True, "source": "file", "items": hist[:15]}
        except (json.JSONDecodeError, OSError):
            pass
    return {"ok": True, "source": "none", "items": [], "note": "저장된 이력이 없습니다."}


def tool_list_jobs(user: User) -> dict[str, Any]:
    from main import JOBS, _visible_jobs_for_user

    jobs_raw = sorted(
        _visible_jobs_for_user(user),
        key=lambda x: x[1].get("submitted_at", ""),
        reverse=True,
    )[:25]
    out = []
    for job_id, j in jobs_raw:
        row = dict(j)
        row["job_id"] = job_id
        out.append(
            {
                "job_id": job_id,
                "kind": row.get("kind"),
                "status": row.get("status"),
                "phase": row.get("phase"),
                "progress": row.get("progress"),
                "result": _safe(row.get("result")),
            }
        )
    return {"ok": True, "jobs": out, "count": len(out)}


def tool_project_analyze(
    user: User,
    *,
    title: str,
    content: str,
    source_type: str = "project",
) -> dict[str, Any]:
    del user
    from project_intelligence import analyze_brief

    return analyze_brief(
        source_type=source_type if source_type in ("project", "paper") else "project",
        title=title,
        content=content,
    )


def tool_preview_columns(user: User, *, filename: str, rows: int = 5) -> dict[str, Any]:
    from main import _load_csv

    ws = workspace_for_user(user)
    ensure_workspace_dirs(ws)
    try:
        df = _load_csv(filename.strip(), ws.data)
    except HTTPException as e:
        return {"ok": False, "error": e.detail}
    head = df.head(min(max(1, rows), 30))
    return {
        "ok": True,
        "filename": filename,
        "columns": list(df.columns),
        "numeric_columns": df.select_dtypes(include=["number"]).columns.tolist(),
        "row_count": int(len(df)),
        "sample_rows": json.loads(head.to_json(orient="records", date_format="iso")),
    }


TOOL_REGISTRY: dict[str, Any] = {
    "list_datasets": lambda u, a: tool_list_datasets(u),
    "list_models": lambda u, a: tool_list_models(u),
    "train_model": lambda u, a: tool_train(
        u,
        filename=a["filename"],
        target_column=a["target_column"],
        task=a["task"],
        model_type=a["model_type"],
        dry_run=bool(a.get("dry_run")),
    ),
    "predict_batch": lambda u, a: tool_predict(
        u,
        model_id=a["model_id"],
        filename=a["filename"],
        dry_run=bool(a.get("dry_run")),
    ),
    "history_summary": lambda u, a: tool_history_summary(u),
    "list_jobs": lambda u, a: tool_list_jobs(u),
    "project_analyze": lambda u, a: tool_project_analyze(
        u,
        title=a["title"],
        content=a["content"],
        source_type=a.get("source_type") or "project",
    ),
    "preview_dataset": lambda u, a: tool_preview_columns(
        u, filename=a["filename"], rows=int(a.get("rows") or 5)
    ),
    **ML_TOOL_REGISTRY,
}


def execute_tool(name: str, user: User, args: dict[str, Any]) -> dict[str, Any]:
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        return {"ok": False, "error": f"unknown tool: {name}"}
    try:
        return fn(user, args or {})
    except Exception as e:
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()[-2000:]}


OPENAI_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_datasets",
            "description": "워크스페이스 data 폴더의 CSV 파일 목록을 반환합니다.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_models",
            "description": "저장된 학습 모델 메타 목록을 반환합니다.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "train_model",
            "description": "CSV로 지도학습을 수행하고 model_id와 검증 지표를 반환합니다. 학습 전에는 preview_dataset으로 열·샘플을 확인하고, 불확실하면 사용자에게 질문하세요. 첫 실행 전에는 dry_run=true로 계획만 검증할 수 있습니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "data 폴더의 CSV 파일명"},
                    "target_column": {"type": "string"},
                    "task": {
                        "type": "string",
                        "enum": ["regression", "classification"],
                    },
                    "model_type": {
                        "type": "string",
                        "description": "linear_regression, random_forest, xgboost, logistic_regression 중 하나",
                    },
                    "dry_run": {
                        "type": "boolean",
                        "description": "true면 파일·타깃 열 존재만 검증하고 학습은 하지 않습니다. 사용자 확인 전 시뮬레이션용.",
                    },
                },
                "required": ["filename", "target_column", "task", "model_type"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "predict_batch",
            "description": "학습된 model_id로 CSV 배치 예측을 수행합니다. 실행 전 dry_run=true로 모델·파일 존재만 확인할 수 있습니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "string"},
                    "filename": {"type": "string", "description": "data 폴더의 스코어용 CSV"},
                    "dry_run": {
                        "type": "boolean",
                        "description": "true면 메타·CSV 존재만 확인하고 예측은 하지 않습니다.",
                    },
                },
                "required": ["model_id", "filename"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "history_summary",
            "description": "최근 실험/학습 이력 요약을 반환합니다.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_jobs",
            "description": "비동기 잡 목록(학습/예측)을 반환합니다.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "project_analyze",
            "description": "프로젝트 개요 또는 논문 초록을 분석해 데이터·모델·주의사항을 제안합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "source_type": {
                        "type": "string",
                        "enum": ["project", "paper"],
                    },
                },
                "required": ["title", "content"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preview_dataset",
            "description": "CSV의 열 이름·행 수·샘플 행을 미리 봅니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string"},
                    "rows": {"type": "integer", "default": 5},
                },
                "required": ["filename"],
                "additionalProperties": False,
            },
        },
    },
] + ML_OPENAI_TOOL_SPECS
