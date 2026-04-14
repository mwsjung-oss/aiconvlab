"""AI 채팅 Phase 2: 실험 플랫폼(/api/ml) 도구 래퍼."""
from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

from database import SessionLocal
from models import User


def _merge_ok(data: dict[str, Any]) -> dict[str, Any]:
    if data.get("ok") is False:
        return data
    return {**data, "ok": True}


def tool_ml_compare_runs(user: User, *, model_ids: str) -> dict[str, Any]:
    from routers.ml_platform import compare_runs

    db = SessionLocal()
    try:
        out = compare_runs(
            model_ids=model_ids.strip(),
            request=None,  # log_activity OK
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_get_lineage(user: User, *, model_id: str) -> dict[str, Any]:
    from routers.ml_platform import get_lineage

    db = SessionLocal()
    try:
        out = get_lineage(
            model_id=model_id.strip(),
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_set_registry_stage(
    user: User,
    *,
    model_id: str,
    stage: str,
    note: str | None = None,
) -> dict[str, Any]:
    from routers.ml_platform import RegistryPatchBody, patch_model_registry

    allowed = {"none", "candidate", "staging", "production", "archived"}
    st = stage.strip()
    if st not in allowed:
        return {"ok": False, "error": f"stage는 {sorted(allowed)} 중 하나여야 합니다."}
    db = SessionLocal()
    try:
        body = RegistryPatchBody(stage=st, note=note)  # type: ignore[arg-type]
        out = patch_model_registry(
            model_id=model_id.strip(),
            body=body,
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_tag_best(user: User, *, model_id: str, note: str | None = None) -> dict[str, Any]:
    from routers.ml_platform import TagBestBody, tag_best_run

    db = SessionLocal()
    try:
        body = TagBestBody(note=note)
        out = tag_best_run(
            model_id=model_id.strip(),
            body=body,
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_submit_sweep(
    user: User,
    *,
    job_payload: dict[str, Any],
    param_grid: dict[str, Any],
    max_runs: int = 16,
) -> dict[str, Any]:
    from routers.ml_platform import SweepRequestBody, submit_param_sweep

    if not isinstance(job_payload, dict) or not isinstance(param_grid, dict):
        return {"ok": False, "error": "job_payload와 param_grid는 객체여야 합니다."}
    try:
        mr = max(1, min(64, int(max_runs)))
    except (TypeError, ValueError):
        mr = 16
    db = SessionLocal()
    try:
        body = SweepRequestBody(
            job_payload=job_payload,
            param_grid=param_grid,
            max_runs=mr,
        )
        out = submit_param_sweep(
            body=body,
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_get_leaderboard(user: User, *, dataset_key: str) -> dict[str, Any]:
    from routers.ml_platform import get_leaderboard

    db = SessionLocal()
    try:
        out = get_leaderboard(
            dataset_key=dataset_key.strip(),
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_submit_leaderboard(
    user: User,
    *,
    dataset_key: str,
    nickname: str,
    metric_value: float,
    metric_name: str = "accuracy",
    model_id: str | None = None,
) -> dict[str, Any]:
    from routers.ml_platform import LeaderboardSubmitBody, submit_leaderboard

    db = SessionLocal()
    try:
        body = LeaderboardSubmitBody(
            dataset_key=dataset_key.strip(),
            nickname=nickname.strip(),
            metric_name=metric_name.strip() or "accuracy",
            metric_value=float(metric_value),
            model_id=(model_id.strip() if model_id else None),
        )
        out = submit_leaderboard(
            body=body,
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


def tool_ml_list_benchmarks(user: User) -> dict[str, Any]:
    del user
    from routers.ml_platform import list_benchmarks

    out = list_benchmarks(current_user=user)
    return _merge_ok(out)


def tool_ml_log_llm_evaluation(
    user: User,
    *,
    name: str,
    prompt_version: str = "v1",
    eval_dataset_label: str = "custom",
    judge_scores: dict[str, Any] | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    from routers.ml_platform import LLMEvalBody, log_llm_evaluation

    scores = judge_scores if isinstance(judge_scores, dict) else {}
    db = SessionLocal()
    try:
        scores_clean: dict[str, float] = {}
        for k, v in scores.items():
            try:
                scores_clean[str(k)] = float(v)
            except (TypeError, ValueError):
                continue
        body = LLMEvalBody(
            name=name.strip(),
            prompt_version=prompt_version.strip() or "v1",
            eval_dataset_label=eval_dataset_label.strip() or "custom",
            judge_scores=scores_clean,
            notes=notes,
        )
        out = log_llm_evaluation(
            body=body,
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    except (TypeError, ValueError) as e:
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


def tool_ml_score_rows(
    user: User,
    *,
    model_id: str,
    rows: list | Any,
) -> dict[str, Any]:
    from routers.ml_platform import ScoreRowsBody, score_model_rows

    if isinstance(rows, str):
        try:
            rows = json.loads(rows)
        except json.JSONDecodeError:
            return {"ok": False, "error": "rows JSON 파싱 실패"}
    if not isinstance(rows, list):
        return {"ok": False, "error": "rows는 객체 배열이어야 합니다."}
    db = SessionLocal()
    try:
        body = ScoreRowsBody(rows=rows)
        out = score_model_rows(
            model_id=model_id.strip(),
            body=body,
            request=None,
            current_user=user,
            db=db,
        )
        return _merge_ok(out)
    except HTTPException as e:
        return {"ok": False, "error": e.detail, "status_code": e.status_code}
    finally:
        db.close()


ML_TOOL_REGISTRY: dict[str, Any] = {
    "ml_compare_runs": lambda u, a: tool_ml_compare_runs(u, model_ids=a["model_ids"]),
    "ml_get_lineage": lambda u, a: tool_ml_get_lineage(u, model_id=a["model_id"]),
    "ml_set_registry_stage": lambda u, a: tool_ml_set_registry_stage(
        u,
        model_id=a["model_id"],
        stage=a["stage"],
        note=a.get("note"),
    ),
    "ml_tag_best": lambda u, a: tool_ml_tag_best(
        u, model_id=a["model_id"], note=a.get("note")
    ),
    "ml_submit_sweep": lambda u, a: tool_ml_submit_sweep(
        u,
        job_payload=a["job_payload"],
        param_grid=a["param_grid"],
        max_runs=int(a.get("max_runs") or 16),
    ),
    "ml_get_leaderboard": lambda u, a: tool_ml_get_leaderboard(
        u, dataset_key=a["dataset_key"]
    ),
    "ml_submit_leaderboard": lambda u, a: tool_ml_submit_leaderboard(
        u,
        dataset_key=a["dataset_key"],
        nickname=a["nickname"],
        metric_value=a["metric_value"],
        metric_name=a.get("metric_name") or "accuracy",
        model_id=a.get("model_id"),
    ),
    "ml_list_benchmarks": lambda u, a: tool_ml_list_benchmarks(u),
    "ml_log_llm_evaluation": lambda u, a: tool_ml_log_llm_evaluation(
        u,
        name=a["name"],
        prompt_version=a.get("prompt_version") or "v1",
        eval_dataset_label=a.get("eval_dataset_label") or "custom",
        judge_scores=a.get("judge_scores"),
        notes=a.get("notes"),
    ),
    "ml_score_rows": lambda u, a: tool_ml_score_rows(
        u, model_id=a["model_id"], rows=a["rows"]
    ),
}

ML_OPENAI_TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "ml_compare_runs",
            "description": "여러 model_id의 실험 Run을 비교합니다(지표·레지스트리 등). model_ids는 쉼표로 구분.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_ids": {
                        "type": "string",
                        "description": "uuid,... 형태, 최대 32개",
                    }
                },
                "required": ["model_ids"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_get_lineage",
            "description": "특정 model_id의 데이터·학습 계보(edge)를 조회합니다.",
            "parameters": {
                "type": "object",
                "properties": {"model_id": {"type": "string"}},
                "required": ["model_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_set_registry_stage",
            "description": "모델 Run의 레지스트리 단계를 변경합니다. 사용자가 배포 단계 변경을 명시적으로 요청할 때만 호출.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "string"},
                    "stage": {
                        "type": "string",
                        "enum": [
                            "none",
                            "candidate",
                            "staging",
                            "production",
                            "archived",
                        ],
                    },
                    "note": {"type": "string"},
                },
                "required": ["model_id", "stage"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_tag_best",
            "description": "해당 Run을 최적(best)으로 태그합니다. 사용자가 명시적으로 요청할 때만.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["model_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_submit_sweep",
            "description": "하이퍼파라미터 스윕(여러 학습 잡)을 제출합니다. 비용·시간이 들 수 있어 사용자 동의 후에만. param_grid 키는 random_state, test_size, model_type 중 일부만 허용.",
            "parameters": {
                "type": "object",
                "properties": {
                    "job_payload": {
                        "type": "object",
                        "description": "TrainJobPayload와 동일: filename, target_column, task, model_type 등",
                    },
                    "param_grid": {
                        "type": "object",
                        "description": "예: {\"random_state\": [42,43], \"model_type\": [\"random_forest\",\"logistic_regression\"]}",
                    },
                    "max_runs": {"type": "integer", "description": "1~64, 기본 16"},
                },
                "required": ["job_payload", "param_grid"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_get_leaderboard",
            "description": "내장 벤치마크 dataset_key에 대한 리더보드 순위를 조회합니다. 키는 ml_list_benchmarks로 확인.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_key": {
                        "type": "string",
                        "description": "예: builtin_iris_binary",
                    }
                },
                "required": ["dataset_key"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_submit_leaderboard",
            "description": "리더보드에 점수를 제출합니다. 사용자가 제출을 요청할 때만.",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_key": {"type": "string"},
                    "nickname": {"type": "string"},
                    "metric_value": {"type": "number"},
                    "metric_name": {"type": "string"},
                    "model_id": {"type": "string"},
                },
                "required": ["dataset_key", "nickname", "metric_value"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_list_benchmarks",
            "description": "지원하는 벤치마크 dataset_key 목록을 반환합니다.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_log_llm_evaluation",
            "description": "LLM/에이전트 평가 점수 로그를 DB에 저장합니다. 사용자가 기록을 요청할 때만.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "prompt_version": {"type": "string"},
                    "eval_dataset_label": {"type": "string"},
                    "judge_scores": {
                        "type": "object",
                        "additionalProperties": {"type": "number"},
                    },
                    "notes": {"type": "string"},
                },
                "required": ["name"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ml_score_rows",
            "description": "저장된 model_id로 특성 행(JSON 배열)에 대해 배치 예측합니다. feature 열이 메타와 일치해야 합니다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "model_id": {"type": "string"},
                    "rows": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "예: [{\"sepal length (cm)\":5.1, ...}]",
                    },
                },
                "required": ["model_id", "rows"],
                "additionalProperties": False,
            },
        },
    },
]
