from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_approved_member
from project_intelligence import analyze_brief, build_intelligence_json
from models import (
    Announcement,
    Assignment,
    Course,
    DatasetCatalog,
    ExperimentTemplate,
    ExperimentRun,
    KnowledgeEntry,
    ModelPreset,
    ModelRegistry,
    ProjectDatasetLink,
    Project,
    ProjectMember,
    ReportTemplate,
    Semester,
    StudentProject,
    Submission,
    User,
)

router = APIRouter(prefix="/api/portal", tags=["portal"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    semester_label: str | None = None


class ProjectBriefAnalyzeBody(BaseModel):
    """프로젝트 개요 또는 논문 Title+Abstract 분석(등록 없음)."""

    source_type: Literal["project", "paper"] = "project"
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=100_000)


class ProjectBriefRegisterBody(BaseModel):
    """분석 후 프로젝트 자동 등록."""

    source_type: Literal["project", "paper"] = "project"
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=100_000)
    project_name: str | None = Field(
        default=None,
        max_length=255,
        description="비어 있으면 title 을 프로젝트 이름으로 사용",
    )


class ProjectMemberAdd(BaseModel):
    user_id: int
    role: str = "member"


class CourseCreate(BaseModel):
    course_id: str
    title: str
    semester_label: str | None = None


class AssignmentCreate(BaseModel):
    dataset: str
    description: str | None = None
    experiment_template: str | None = None


class DatasetCatalogCreate(BaseModel):
    name: str
    description: str | None = None
    schema_data: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    version: str = "v1"
    owner_name: str | None = None
    project_id: int | None = None
    student_project_id: int | None = None
    dataset_type: str | None = None
    target_variable: str | None = None
    time_index: str | None = None
    sensor_columns: list[str] = Field(default_factory=list)
    notes: str | None = None


class ModelRegistryCreate(BaseModel):
    name: str
    version: str
    run_id: str | None = None
    metrics_json: dict[str, Any] = Field(default_factory=dict)


class KnowledgeCreate(BaseModel):
    title: str
    category: str = "guide"
    content: str
    tags: list[str] = Field(default_factory=list)


SPRING_2026_LABEL = "2026 Spring AI Convergence Project II"
SPRING_2026_YEAR = 2026
SPRING_2026_TERM = "Spring"
SPRING_2026_COURSE_ID = "AICV-PROJ2-2026-SPRING"

DEFAULT_METRIC_GROUPS = {
    "regression": ["rmse", "mae", "r2"],
    "classification": ["accuracy", "precision", "recall", "f1", "roc_auc"],
    "forecasting": ["mape", "smape", "wape", "rmse"],
    "text_to_sql": ["execution_accuracy", "exact_match", "syntax_validity", "hallucination_corrections"],
}
DEFAULT_VIS_TYPES = [
    "actual_vs_predicted",
    "residual_plot",
    "feature_importance",
    "shap_summary",
    "time_series_forecast",
    "confusion_matrix",
    "sql_evaluation_summary",
]


def _json_load(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _is_operator_role(role: str) -> bool:
    return role in {"master", "director", "technical_lead", "admin", "instructor"}


def _try_gpu_summary() -> dict[str, Any]:
    query_args = [
        "--query-gpu=name,utilization.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits",
    ]
    cmds = [
        ["nvidia-smi", *query_args],
        ["wsl", "nvidia-smi", *query_args],
    ]
    last_error: Exception | None = None
    try:
        out = ""
        for cmd in cmds:
            try:
                out = subprocess.check_output(
                    cmd,
                    stderr=subprocess.STDOUT,
                    timeout=4,
                    text=True,
                )
                break
            except Exception as e:
                last_error = e
                out = ""
        if not out:
            raise RuntimeError(f"nvidia-smi unavailable ({last_error})")
        first = (out.strip().splitlines() or [""])[0]
        parts = [p.strip() for p in first.split(",")]
        if len(parts) < 4:
            return {"available": False}
        return {
            "available": True,
            "name": parts[0],
            "utilization_gpu_pct": float(parts[1]),
            "memory_used_mb": float(parts[2]),
            "memory_total_mb": float(parts[3]),
            "source": "live",
        }
    except Exception:
        fallback_name = os.getenv("LAB_GPU_NAME", "NVIDIA RTX 4080")
        assume_available = os.getenv("LAB_GPU_ASSUME_AVAILABLE", "1") == "1"
        if assume_available:
            return {
                "available": True,
                "name": fallback_name,
                "utilization_gpu_pct": 0.0,
                "memory_used_mb": 0.0,
                "memory_total_mb": 16384.0,
                "source": "configured_fallback",
            }
        return {"available": False}


def _seed_experiment_templates() -> list[dict[str, Any]]:
    return [
        {
            "template_id": "tpl-electroplating-property-optimization",
            "title": "Electroplating Property Prediction & Optimization",
            "task_type": "regression_optimization_xai",
            "model_family": "RandomForest/XGBoost/LightGBM/ElasticNet+SHAP",
            "input_schema": {"features": ["composition", "process_conditions", "grain_features"], "target": "property"},
            "output_schema": {"predictions": "numeric", "optimization": "recommendation", "xai": "feature_importance_shap"},
            "default_metrics": ["rmse", "mae", "r2"],
            "visualization_types": ["actual_vs_predicted", "residual_plot", "feature_importance", "shap_summary"],
            "recommended_preprocessing": ["missing_imputation", "robust_scaling", "feature_selection"],
        },
        {
            "template_id": "tpl-plating-quality-control",
            "title": "Plating Quality Prediction and Control",
            "task_type": "regression_classification_forecasting",
            "model_family": "ElasticNet/RandomForest/XGBoost/LightGBM/LSTM/TFT",
            "input_schema": {"features": ["mes_erp", "plc", "iot_sensors"], "target": ["ph", "defect_prob"]},
            "output_schema": {"regression": "quality_value", "classification": "defect_probability", "forecast": "10_30min_window"},
            "default_metrics": ["rmse", "mae", "r2", "accuracy", "f1", "mape"],
            "visualization_types": ["actual_vs_predicted", "time_series_forecast", "confusion_matrix"],
            "recommended_preprocessing": ["resampling", "lag_features", "outlier_capping"],
        },
        {
            "template_id": "tpl-enterprise-text2sql-benchmark",
            "title": "Enterprise Text-to-SQL Benchmark",
            "task_type": "text_to_sql_rag_eval",
            "model_family": "LocalLLM+MetadataRAG+LangGraph",
            "input_schema": {"features": ["nl_query", "semantic_view", "schema_metadata"], "target": "sql_statement"},
            "output_schema": {"sql": "query", "evaluation": "execution_accuracy_exact_match"},
            "default_metrics": ["execution_accuracy", "exact_match", "syntax_validity", "hallucination_corrections"],
            "visualization_types": ["sql_evaluation_summary"],
            "recommended_preprocessing": ["schema_normalization", "metadata_indexing", "workload_tagging"],
        },
        {
            "template_id": "tpl-virtual-sensing-se-concentration",
            "title": "Virtual Sensing for Se Concentration",
            "task_type": "time_series_regression_soft_sensor",
            "model_family": "SAE+LSTM/XGBoost/RandomForest",
            "input_schema": {"features": ["process_variables", "sensor_stream"], "target": "se_concentration"},
            "output_schema": {"predictions": "timeseries", "control": "input_recommendation"},
            "default_metrics": ["rmse", "mae", "mape", "wape"],
            "visualization_types": ["time_series_forecast", "actual_vs_predicted"],
            "recommended_preprocessing": ["windowing", "denoising", "feature_engineering"],
        },
        {
            "template_id": "tpl-demand-forecasting-multimodal",
            "title": "Demand Forecasting (Multimodal Hybrid)",
            "task_type": "demand_forecasting",
            "model_family": "TFT/XGBoost/LightGBM/ARIMA/LSTM",
            "input_schema": {"features": ["erp_orders", "issue_notes", "time_features"], "target": "demand_quantity"},
            "output_schema": {"forecast": "horizon_prediction", "insight": "driver_importance"},
            "default_metrics": ["mape", "smape", "wape", "rmse"],
            "visualization_types": ["time_series_forecast", "feature_importance"],
            "recommended_preprocessing": ["holiday_flags", "event_encoding", "seasonal_decomposition"],
        },
    ]


def _seed_model_presets() -> list[dict[str, Any]]:
    return [
        {
            "preset_id": "preset-regression-basic",
            "name": "Regression Basic",
            "category": "regression",
            "models": ["LinearRegression", "RandomForestRegressor", "XGBoostRegressor"],
            "notes": "빠른 기준선 + 비선형 보강",
        },
        {
            "preset_id": "preset-timeseries-advanced",
            "name": "Time-Series Advanced",
            "category": "forecasting",
            "models": ["TFT", "LSTM", "ARIMA baseline"],
            "notes": "복합 시계열 비교용",
        },
        {
            "preset_id": "preset-process-soft-sensor",
            "name": "Process Soft Sensor",
            "category": "soft_sensor",
            "models": ["XGBoost", "SAE-LSTM", "RandomForest"],
            "notes": "센서 대체/보완 시나리오",
        },
        {
            "preset_id": "preset-explainable-process-ai",
            "name": "Explainable Process AI",
            "category": "xai",
            "models": ["XGBoost + SHAP", "LightGBM + SHAP"],
            "notes": "설명가능성 중심",
        },
        {
            "preset_id": "preset-enterprise-text-to-sql",
            "name": "Enterprise Text-to-SQL",
            "category": "nlp_llm",
            "models": ["local LLM", "metadata RAG", "LangGraph multi-agent", "execution evaluator"],
            "notes": "사내 ERP 워크로드 검증",
        },
    ]


def _seed_report_templates() -> list[dict[str, Any]]:
    base_sections = [
        "student_project_info",
        "objective",
        "dataset_used",
        "model_and_parameters",
        "metrics",
        "figures",
        "interpretation",
        "recommendations",
        "next_steps",
    ]
    return [
        {
            "template_id": "rpt-process-ai-standard",
            "name": "Process AI Standard Report",
            "sections": base_sections,
            "metric_groups": DEFAULT_METRIC_GROUPS,
            "visualization_defaults": DEFAULT_VIS_TYPES,
            "interpretation_guide": "공정 영향 변수를 우선 해석하고 개선 인자를 제시합니다.",
            "next_step_guide": "추가 데이터 확보, 실험 구간 확장, 온라인 검증 계획을 작성합니다.",
        },
        {
            "template_id": "rpt-text-to-sql-benchmark",
            "name": "Text-to-SQL Benchmark Report",
            "sections": base_sections + ["workload_breakdown", "error_analysis"],
            "metric_groups": DEFAULT_METRIC_GROUPS,
            "visualization_defaults": ["sql_evaluation_summary"],
            "interpretation_guide": "실행 정합성과 오류 유형(스키마/조인/조건)을 분리 분석합니다.",
            "next_step_guide": "RAG 개선과 verifier 루프 강화 계획을 작성합니다.",
        },
    ]


def _spring_2026_student_projects() -> list[dict[str, Any]]:
    return [
        {
            "student_name": "백철민",
            "student_email": None,
            "title_kr": "머신러닝 알고리즘을 활용한 하이브리드 본딩용 구리 도금액의 물성 예측 및 최적화 공정 연구",
            "title_en": "Machine Learning-Driven Property Prediction and Process Optimization of Copper Electroplating Solutions for Hybrid Bonding",
            "abstract_summary": "고차원 공정/조성 데이터를 기반으로 도금액 물성과 결정립 성장 관련 품질지표를 예측하고, 최적 공정 조건 및 설명가능성(XAI) 기반 개선안을 제시합니다.",
            "domain": "electroplating_process_optimization",
            "data_type": "structured+timeseries",
            "task_types": ["regression", "optimization", "explainable_ai"],
            "model_candidates": ["RandomForestRegressor", "XGBoostRegressor", "LightGBMRegressor", "ElasticNet", "SHAP"],
            "expected_inputs": ["composition_features", "bath_conditions", "grain_growth_related_features"],
            "expected_outputs": ["property_prediction", "feature_importance", "process_optimization_recommendation", "xai_dashboard"],
            "evaluation_metrics": ["rmse", "mae", "r2"],
            "report_template": "rpt-process-ai-standard",
            "experiment_template": "tpl-electroplating-property-optimization",
        },
        {
            "student_name": "임희준",
            "student_email": None,
            "title_kr": "머신러닝 모델을 활용한 도금액 제조 공정의 실시간 품질 예측 및 제어시스템 연구",
            "title_en": None,
            "abstract_summary": "MES/ERP, PLC, IoT 센서 데이터를 통합하여 pH/결함 확률을 예측하고 10~30분 선행 품질 예측 및 제어 권고/알람 로직을 구축합니다.",
            "domain": "manufacturing_quality_control",
            "data_type": "structured+timeseries+sensor",
            "task_types": ["regression", "classification", "time_series_forecasting", "soft_sensor"],
            "model_candidates": ["LinearRegression", "ElasticNet", "RandomForest", "XGBoost", "LightGBM", "LSTM", "TFT"],
            "expected_inputs": ["mes_erp_features", "plc_signals", "iot_sensor_stream"],
            "expected_outputs": ["ph_prediction", "defect_probability", "quality_forecast_10_30m", "control_recommendation", "alarm_threshold_logic"],
            "evaluation_metrics": ["rmse", "mae", "r2", "accuracy", "precision", "recall", "f1", "mape"],
            "report_template": "rpt-process-ai-standard",
            "experiment_template": "tpl-plating-quality-control",
        },
        {
            "student_name": "이주영",
            "student_email": None,
            "title_kr": "사내 ERP 환경을 위한 다중 에이전트, RAG 기반 Text-to-SQL 아키텍처 설계 및 핵심 워크로드 중심의 성능 검증",
            "title_en": "Design of a Multi-Agent, RAG-based Text-to-SQL Architecture for Corporate ERP Environments and Performance Verification Focusing on Core Workloads",
            "abstract_summary": "온프레미스 ERP 데이터베이스를 대상으로 semantic view/metadata RAG와 planner-generator-verifier 루프를 적용해 Text-to-SQL 성능을 워크로드 단위로 평가합니다.",
            "domain": "enterprise_text_to_sql",
            "data_type": "text+structured_schema",
            "task_types": ["nlp_llm_workflow", "text_to_sql", "retrieval_rag", "evaluation_benchmarking"],
            "model_candidates": ["Qwen2.5-Coder(or local equivalent)", "LangGraph", "Planner/Generator/Verifier", "JSON metadata RAG"],
            "expected_inputs": ["nl_question", "schema_metadata", "semantic_views", "workload_tags"],
            "expected_outputs": ["sql_query", "execution_accuracy_report", "benchmark_dashboard", "semantic_view_explorer"],
            "evaluation_metrics": ["execution_accuracy", "exact_match", "syntax_validity", "hallucination_corrections"],
            "report_template": "rpt-text-to-sql-benchmark",
            "experiment_template": "tpl-enterprise-text2sql-benchmark",
        },
        {
            "student_name": "임평순",
            "student_email": None,
            "title_kr": "본딩와이어 도금 공정의 Se 농도 예측을 위한 가상 센싱 모델 및 공정 제어 최적화 연구",
            "title_en": "A Study on Virtual Sensing Model for Se Concentration Prediction and Process Control Optimization in Bonding Wire Plating",
            "abstract_summary": "가상 센싱 기반으로 본딩와이어 공정의 Se 농도를 시계열 예측하고, ICP 대체 모니터링 및 제어 입력 최적화 가이드를 제공합니다.",
            "domain": "virtual_sensing_process_control",
            "data_type": "timeseries+sensor",
            "task_types": ["time_series_regression", "soft_sensor", "process_control_optimization"],
            "model_candidates": ["SAE + LSTM", "XGBoost", "RandomForestRegressor", "Temporal models"],
            "expected_inputs": ["process_variables", "sensor_columns", "time_indexed_measurements"],
            "expected_outputs": ["se_concentration_prediction", "icp_replacement_monitoring_logic", "control_input_recommendation", "timeseries_visualization"],
            "evaluation_metrics": ["rmse", "mae", "mape", "wape"],
            "report_template": "rpt-process-ai-standard",
            "experiment_template": "tpl-virtual-sensing-se-concentration",
        },
        {
            "student_name": "이대현",
            "student_email": None,
            "title_kr": "제조기업의 수주 효율화를 위한 멀티모달 데이터 기반의 ML-DL 하이브리드 수요예측 모델 연구",
            "title_en": None,
            "abstract_summary": "엑셀 초록 원문을 기반으로 최근 3년 ERP 수주 데이터와 영업 인터뷰 이슈 정보를 통합한 멀티모달 수요예측 프레임워크를 설계하며, ARIMA 대비 XGBoost+LSTM/TFT 하이브리드의 성능을 검증합니다.",
            "domain": "demand_forecasting_manufacturing",
            "data_type": "timeseries+structured+text_issue",
            "task_types": ["demand_forecasting", "time_series_forecasting", "multimodal_fusion"],
            "model_candidates": ["TFT", "XGBoost", "LightGBM", "ARIMA baseline", "LSTM baseline"],
            "expected_inputs": ["erp_order_history", "sales_issue_notes", "calendar_event_features"],
            "expected_outputs": ["demand_forecast", "event_sensitivity_analysis", "inventory_planning_support"],
            "evaluation_metrics": ["mape", "smape", "wape", "rmse"],
            "report_template": "rpt-process-ai-standard",
            "experiment_template": "tpl-demand-forecasting-multimodal",
        },
    ]


def _ensure_spring_2026_seed(db: Session) -> None:
    sem = db.query(Semester).filter(Semester.label == SPRING_2026_LABEL).first()
    if not sem:
        sem = Semester(year=SPRING_2026_YEAR, term=SPRING_2026_TERM, label=SPRING_2026_LABEL)
        db.add(sem)
        db.flush()

    course = db.query(Course).filter(Course.course_id == SPRING_2026_COURSE_ID).first()
    if not course:
        course = Course(course_id=SPRING_2026_COURSE_ID, title="AI융합프로젝트2 (2026 Spring)")
        db.add(course)
        db.flush()

    rpt_map: dict[str, ReportTemplate] = {}
    for t in _seed_report_templates():
        row = db.query(ReportTemplate).filter(ReportTemplate.template_id == t["template_id"]).first()
        if not row:
            row = ReportTemplate(
                template_id=t["template_id"],
                name=t["name"],
                sections_json=json.dumps(t["sections"], ensure_ascii=False),
                metric_groups_json=json.dumps(t["metric_groups"], ensure_ascii=False),
                visualization_defaults_json=json.dumps(t["visualization_defaults"], ensure_ascii=False),
                interpretation_guide=t["interpretation_guide"],
                next_step_guide=t["next_step_guide"],
            )
            db.add(row)
            db.flush()
        rpt_map[t["template_id"]] = row

    tpl_map: dict[str, ExperimentTemplate] = {}
    for t in _seed_experiment_templates():
        row = db.query(ExperimentTemplate).filter(ExperimentTemplate.template_id == t["template_id"]).first()
        if not row:
            row = ExperimentTemplate(
                template_id=t["template_id"],
                title=t["title"],
                task_type=t["task_type"],
                model_family=t["model_family"],
                input_schema_json=json.dumps(t["input_schema"], ensure_ascii=False),
                output_schema_json=json.dumps(t["output_schema"], ensure_ascii=False),
                default_metrics_json=json.dumps(t["default_metrics"], ensure_ascii=False),
                visualization_types_json=json.dumps(t["visualization_types"], ensure_ascii=False),
                recommended_preprocessing_json=json.dumps(t["recommended_preprocessing"], ensure_ascii=False),
            )
            db.add(row)
            db.flush()
        tpl_map[t["template_id"]] = row

    for p in _seed_model_presets():
        row = db.query(ModelPreset).filter(ModelPreset.preset_id == p["preset_id"]).first()
        if not row:
            db.add(
                ModelPreset(
                    preset_id=p["preset_id"],
                    name=p["name"],
                    category=p["category"],
                    models_json=json.dumps(p["models"], ensure_ascii=False),
                    notes=p["notes"],
                )
            )

    for sp in _spring_2026_student_projects():
        project_name = f"{sp['student_name']} - {sp['title_kr'][:40]}"
        project = db.query(Project).filter(Project.name == project_name).first()
        if not project:
            project = Project(name=project_name, description=sp["abstract_summary"], owner_id=None)
            db.add(project)
            db.flush()

        row = (
            db.query(StudentProject)
            .filter(StudentProject.student_name == sp["student_name"], StudentProject.semester_id == sem.id)
            .first()
        )
        if not row:
            row = StudentProject(
                semester_id=sem.id,
                course_id=course.id,
                project_id=project.id,
                student_name=sp["student_name"],
                student_email=sp["student_email"],
                title_kr=sp["title_kr"],
                title_en=sp["title_en"],
                abstract_summary=sp["abstract_summary"],
                domain=sp["domain"],
                data_type=sp["data_type"],
                task_types_json=json.dumps(sp["task_types"], ensure_ascii=False),
                model_candidates_json=json.dumps(sp["model_candidates"], ensure_ascii=False),
                expected_inputs_json=json.dumps(sp["expected_inputs"], ensure_ascii=False),
                expected_outputs_json=json.dumps(sp["expected_outputs"], ensure_ascii=False),
                evaluation_metrics_json=json.dumps(sp["evaluation_metrics"], ensure_ascii=False),
                report_template_id=rpt_map[sp["report_template"]].id,
            )
            db.add(row)
            db.flush()

        assignment = (
            db.query(Assignment)
            .filter(Assignment.course_id == course.id, Assignment.dataset == f"{sp['student_name']}_dataset")
            .first()
        )
        if not assignment:
            db.add(
                Assignment(
                    course_id=course.id,
                    dataset=f"{sp['student_name']}_dataset",
                    description=f"{sp['student_name']} 프로젝트 실험 템플릿 과제",
                    experiment_template=sp["experiment_template"],
                )
            )

    pilot_name = "Pilot — 제품 구매 수요예측"
    if not db.query(Project).filter(Project.name == pilot_name).first():
        db.add(
            Project(
                name=pilot_name,
                description=(
                    "저장소 `samples/pilot_demand/`의 가상 주간 수요 데이터로 회귀 모델을 학습하고, "
                    "`pilot_demand_scoring.csv`로 배치 예측·Reports까지 검증하는 내부 데모용 프로젝트입니다."
                ),
                owner_id=None,
            )
        )
    db.commit()


@router.get("/home")
def portal_home(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    my_projects = (
        db.query(Project)
        .filter(Project.owner_id == current_user.id)
        .order_by(Project.created_at.desc())
        .limit(10)
        .all()
    )
    joined_ids = [
        m.project_id
        for m in db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
    ]
    joined_projects = []
    if joined_ids:
        joined_projects = (
            db.query(Project)
            .filter(Project.id.in_(joined_ids))
            .order_by(Project.created_at.desc())
            .limit(10)
            .all()
        )
    my_courses = (
        db.query(Course)
        .filter(Course.instructor_id == current_user.id)
        .order_by(Course.created_at.desc())
        .limit(10)
        .all()
    )
    recent_runs = db.query(ExperimentRun).order_by(ExperimentRun.created_at.desc()).limit(20).all()
    announcements = db.query(Announcement).order_by(Announcement.created_at.desc()).limit(50).all()
    recent_models = db.query(ModelRegistry).order_by(ModelRegistry.created_at.desc()).limit(10).all()
    spring_semester = db.query(Semester).filter(Semester.label == SPRING_2026_LABEL).first()
    student_projects = []
    if spring_semester:
        student_projects = (
            db.query(StudentProject)
            .filter(StudentProject.semester_id == spring_semester.id)
            .order_by(StudentProject.student_name.asc())
            .all()
        )
    job_file = Path(__file__).resolve().parents[1] / "job_registry.json"
    running_jobs = []
    if job_file.is_file():
        try:
            raw = json.loads(job_file.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                running_jobs = [
                    j
                    for j in raw.values()
                    if j.get("status") in {"queued", "running", "cancelling"}
                ]
        except Exception:
            running_jobs = []
    active_jobs = [j for j in running_jobs if j.get("status") in {"queued", "running", "cancelling"}]

    return {
        "my_projects": [{"id": p.id, "name": p.name, "description": p.description} for p in my_projects],
        "joined_projects": [{"id": p.id, "name": p.name, "description": p.description} for p in joined_projects],
        "my_courses": [{"id": c.id, "course_id": c.course_id, "title": c.title} for c in my_courses],
        "recent_experiments": [
            {"run_id": r.run_id, "job_id": r.job_id, "status": r.status, "created_at": r.created_at.isoformat() + "Z"}
            for r in recent_runs
        ],
        "running_jobs": running_jobs[:20],
        "announcements": [{"id": a.id, "title": a.title, "content": a.content} for a in announcements],
        "recent_artifacts": [{"name": m.name, "version": m.version, "run_id": m.run_id} for m in recent_models],
        "course_overview": {
            "semester": SPRING_2026_LABEL,
            "course_id": SPRING_2026_COURSE_ID,
            "active_projects": len(student_projects),
            "running_jobs": len(active_jobs),
            "recent_artifacts": len(recent_models),
            "gpu": _try_gpu_summary(),
        },
        "active_student_projects": [
            {
                "student_name": s.student_name,
                "title_kr": s.title_kr,
                "domain": s.domain,
                "task_types": _json_load(s.task_types_json, []),
                "model_candidates": _json_load(s.model_candidates_json, []),
            }
            for s in student_projects
        ],
        "quick_actions": [
            {"id": "open_project", "label": "Open Project", "target_page": "projects"},
            {"id": "upload_dataset", "label": "Upload Dataset", "target_page": "datasets_catalog"},
            {"id": "run_experiment", "label": "Run Experiment", "target_page": "dashboard"},
            {"id": "view_report", "label": "View Report", "target_page": "reports"},
        ],
    }


@router.get("/projects")
def list_projects(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(Project).order_by(Project.created_at.desc()).all()
    by_project: dict[int, StudentProject] = {}
    for sp in db.query(StudentProject).all():
        if sp.project_id:
            by_project[sp.project_id] = sp
    out_projects = []
    for p in items:
        intel = None
        raw = getattr(p, "intelligence_json", None)
        if raw:
            try:
                intel = json.loads(raw)
            except json.JSONDecodeError:
                intel = None
        out_projects.append(
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "owner_id": p.owner_id,
                "source_type": getattr(p, "source_type", None),
                "intelligence": intel,
                "student_name": by_project[p.id].student_name if p.id in by_project else None,
                "domain": by_project[p.id].domain if p.id in by_project else None,
                "task_types": _json_load(by_project[p.id].task_types_json, []) if p.id in by_project else [],
                "recommended_models": _json_load(by_project[p.id].model_candidates_json, []) if p.id in by_project else [],
            }
        )
    return {"projects": out_projects}


@router.post("/projects/analyze")
def analyze_project_brief_endpoint(
    body: ProjectBriefAnalyzeBody,
    current_user: User = Depends(get_current_approved_member),
) -> dict[str, Any]:
    del current_user
    return analyze_brief(
        source_type=body.source_type,
        title=body.title,
        content=body.content,
    )


@router.post("/projects/register-from-brief")
def register_project_from_brief(
    body: ProjectBriefRegisterBody,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    result = analyze_brief(
        source_type=body.source_type,
        title=body.title,
        content=body.content,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "분석 실패"))
    name = (body.project_name or body.title).strip()[:255]
    if not name:
        raise HTTPException(status_code=400, detail="프로젝트 이름이 비어 있습니다.")
    desc = result.get("description_suggestion") or body.content[:8000]
    st = "paper_abstract" if body.source_type == "paper" else "project_brief"
    p = Project(
        name=name,
        description=desc,
        owner_id=current_user.id,
        source_type=st,
        intelligence_json=build_intelligence_json(result),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    db.add(ProjectMember(project_id=p.id, user_id=current_user.id, role="owner"))
    db.commit()
    return {
        "id": p.id,
        "name": p.name,
        "source_type": p.source_type,
        "analysis": result,
    }


@router.post("/projects")
def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    p = Project(
        name=body.name,
        description=body.description,
        owner_id=current_user.id,
        source_type="manual",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    db.add(ProjectMember(project_id=p.id, user_id=current_user.id, role="owner"))
    db.commit()
    return {"id": p.id, "name": p.name}


@router.get("/projects/{project_id}")
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    intel = None
    if getattr(p, "intelligence_json", None):
        try:
            intel = json.loads(p.intelligence_json or "{}")
        except json.JSONDecodeError:
            intel = None
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "owner_id": p.owner_id,
        "source_type": getattr(p, "source_type", None),
        "intelligence": intel,
        "members": [{"user_id": m.user_id, "role": m.role} for m in members],
    }


@router.post("/projects/{project_id}/members")
def add_project_member(
    project_id: int,
    body: ProjectMemberAdd,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if p.owner_id != current_user.id and current_user.role not in {"master", "director", "technical_lead", "admin"}:
        raise HTTPException(status_code=403, detail="권한이 없습니다.")
    exists = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_id == body.user_id).first()
    if exists:
        exists.role = body.role
        db.commit()
        return {"message": "updated"}
    db.add(ProjectMember(project_id=project_id, user_id=body.user_id, role=body.role))
    db.commit()
    return {"message": "added"}


@router.get("/courses")
def list_courses(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(Course).order_by(Course.created_at.desc()).all()
    spring_semester = db.query(Semester).filter(Semester.label == SPRING_2026_LABEL).first()
    student_projects = []
    if spring_semester:
        student_projects = db.query(StudentProject).filter(StudentProject.semester_id == spring_semester.id).all()
    return {
        "courses": [{"id": c.id, "course_id": c.course_id, "title": c.title, "instructor_id": c.instructor_id} for c in items],
        "spring_2026": {
            "semester_label": SPRING_2026_LABEL,
            "students": len(student_projects),
            "course_id": SPRING_2026_COURSE_ID,
        },
    }


@router.post("/courses")
def create_course(
    body: CourseCreate,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if current_user.role not in {"master", "director", "technical_lead", "instructor", "admin"}:
        raise HTTPException(status_code=403, detail="강의 개설 권한이 없습니다.")
    c = Course(course_id=body.course_id, title=body.title, instructor_id=current_user.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "course_id": c.course_id, "title": c.title}


@router.get("/courses/{course_id}/assignments")
def list_assignments(
    course_id: int,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(Assignment).filter(Assignment.course_id == course_id).order_by(Assignment.created_at.desc()).all()
    return {
        "assignments": [
            {
                "id": a.id,
                "dataset": a.dataset,
                "description": a.description,
                "experiment_template": a.experiment_template,
                "deadline": a.deadline.isoformat() + "Z" if a.deadline else None,
            }
            for a in items
        ]
    }


@router.post("/courses/{course_id}/assignments")
def create_assignment(
    course_id: int,
    body: AssignmentCreate,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    c = db.query(Course).filter(Course.id == course_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Course not found")
    if c.instructor_id != current_user.id and current_user.role not in {"master", "director", "technical_lead", "admin"}:
        raise HTTPException(status_code=403, detail="과제 생성 권한이 없습니다.")
    a = Assignment(course_id=course_id, dataset=body.dataset, description=body.description, experiment_template=body.experiment_template)
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id}


@router.get("/submissions")
def list_submissions(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    q = db.query(Submission)
    if current_user.role not in {"master", "director", "technical_lead", "instructor", "admin"}:
        q = q.filter(Submission.user_id == current_user.id)
    items = q.order_by(Submission.created_at.desc()).limit(300).all()
    return {
        "submissions": [
            {
                "id": s.id,
                "assignment_id": s.assignment_id,
                "user_id": s.user_id,
                "run_id": s.run_id,
                "status": s.status,
                "review_comment": s.review_comment,
            }
            for s in items
        ]
    }


@router.get("/knowledge")
def list_knowledge(
    category: str | None = None,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    q = db.query(KnowledgeEntry)
    if category:
        q = q.filter(KnowledgeEntry.category == category)
    items = q.order_by(KnowledgeEntry.updated_at.desc()).limit(500).all()
    return {
        "entries": [
            {
                "id": e.id,
                "title": e.title,
                "category": e.category,
                "content": e.content,
                "tags": json.loads(e.tags_json or "[]"),
            }
            for e in items
        ]
    }


@router.post("/knowledge")
def create_knowledge(
    body: KnowledgeCreate,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    e = KnowledgeEntry(
        title=body.title,
        category=body.category,
        content=body.content,
        tags_json=json.dumps(body.tags, ensure_ascii=False),
        created_by=current_user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"id": e.id}


@router.get("/datasets")
def list_dataset_catalog(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(DatasetCatalog).order_by(DatasetCatalog.created_at.desc()).all()
    return {
        "datasets": [
            {
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "schema_json": json.loads(d.schema_json or "{}"),
                "tags": json.loads(d.tags_json or "[]"),
                "version": d.version,
                "owner_name": d.owner_name,
                "project_id": d.project_id,
                "student_project_id": d.student_project_id,
                "dataset_type": d.dataset_type,
                "target_variable": d.target_variable,
                "time_index": d.time_index,
                "sensor_columns": _json_load(d.sensor_columns_json, []),
                "notes": d.notes,
            }
            for d in items
        ]
    }


@router.post("/datasets")
def create_dataset_catalog(
    body: DatasetCatalogCreate,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    d = DatasetCatalog(
        name=body.name,
        description=body.description,
        schema_json=json.dumps(body.schema_data, ensure_ascii=False),
        tags_json=json.dumps(body.tags, ensure_ascii=False),
        version=body.version,
        owner_id=current_user.id,
        owner_name=body.owner_name,
        project_id=body.project_id,
        student_project_id=body.student_project_id,
        dataset_type=body.dataset_type,
        target_variable=body.target_variable,
        time_index=body.time_index,
        sensor_columns_json=json.dumps(body.sensor_columns, ensure_ascii=False),
        notes=body.notes,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id}


@router.get("/models")
def list_model_registry(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(ModelRegistry).order_by(ModelRegistry.created_at.desc()).all()
    return {
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "version": m.version,
                "run_id": m.run_id,
                "metrics_json": json.loads(m.metrics_json or "{}"),
                "created_at": m.created_at.isoformat() + "Z" if m.created_at else None,
            }
            for m in items
        ]
    }


@router.post("/models")
def create_model_registry(
    body: ModelRegistryCreate,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    m = ModelRegistry(
        name=body.name,
        version=body.version,
        run_id=body.run_id,
        metrics_json=json.dumps(body.metrics_json, ensure_ascii=False),
        created_by=current_user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id}


@router.get("/student-projects")
def list_student_projects(
    semester_label: str | None = None,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    label = semester_label or SPRING_2026_LABEL
    sem = db.query(Semester).filter(Semester.label == label).first()
    if not sem:
        return {"semester": label, "student_projects": []}
    q = db.query(StudentProject).filter(StudentProject.semester_id == sem.id)
    if not _is_operator_role(current_user.role):
        member_project_ids = [m.project_id for m in db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()]
        q = q.filter(
            (StudentProject.student_email == current_user.email)
            | (StudentProject.student_email.is_(None))
            | (StudentProject.project_id.in_(member_project_ids))
        )
    items = q.order_by(StudentProject.student_name.asc()).all()
    return {
        "semester": label,
        "student_projects": [
            {
                "id": s.id,
                "student_name": s.student_name,
                "student_email": s.student_email,
                "title_kr": s.title_kr,
                "title_en": s.title_en,
                "abstract_summary": s.abstract_summary,
                "domain": s.domain,
                "data_type": s.data_type,
                "task_types": _json_load(s.task_types_json, []),
                "model_candidates": _json_load(s.model_candidates_json, []),
                "expected_inputs": _json_load(s.expected_inputs_json, []),
                "expected_outputs": _json_load(s.expected_outputs_json, []),
                "evaluation_metrics": _json_load(s.evaluation_metrics_json, []),
                "project_id": s.project_id,
                "course_id": s.course_id,
            }
            for s in items
        ],
    }


@router.get("/student-projects/{student_project_id}")
def get_student_project_detail(
    student_project_id: int,
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    s = db.query(StudentProject).filter(StudentProject.id == student_project_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Student project not found")
    if not _is_operator_role(current_user.role):
        if s.student_email and s.student_email != current_user.email:
            member_project_ids = [m.project_id for m in db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()]
            if s.project_id not in member_project_ids:
                raise HTTPException(status_code=403, detail="조회 권한이 없습니다.")
    report_template = None
    if s.report_template_id:
        report_template = db.query(ReportTemplate).filter(ReportTemplate.id == s.report_template_id).first()
    assignments = []
    if s.course_id:
        assignments = db.query(Assignment).filter(Assignment.course_id == s.course_id).order_by(Assignment.created_at.desc()).limit(20).all()
    related_runs = db.query(ExperimentRun).order_by(ExperimentRun.created_at.desc()).limit(50).all()
    submissions_q = db.query(Submission)
    if not _is_operator_role(current_user.role):
        submissions_q = submissions_q.filter(Submission.user_id == current_user.id)
    submissions = submissions_q.order_by(Submission.created_at.desc()).limit(50).all()
    return {
        "id": s.id,
        "student_name": s.student_name,
        "title_kr": s.title_kr,
        "title_en": s.title_en,
        "abstract_summary": s.abstract_summary,
        "domain": s.domain,
        "data_type": s.data_type,
        "task_types": _json_load(s.task_types_json, []),
        "model_candidates": _json_load(s.model_candidates_json, []),
        "expected_inputs": _json_load(s.expected_inputs_json, []),
        "expected_outputs": _json_load(s.expected_outputs_json, []),
        "evaluation_metrics": _json_load(s.evaluation_metrics_json, []),
        "report_template": (
            {
                "template_id": report_template.template_id,
                "name": report_template.name,
                "sections": _json_load(report_template.sections_json, []),
            }
            if report_template
            else None
        ),
        "assignments": [
            {"id": a.id, "dataset": a.dataset, "description": a.description, "experiment_template": a.experiment_template}
            for a in assignments
        ],
        "related_jobs": [{"job_id": r.job_id, "run_id": r.run_id, "status": r.status} for r in related_runs if r.job_id][:20],
        "recent_runs": [{"run_id": r.run_id, "status": r.status, "created_at": r.created_at.isoformat() + "Z"} for r in related_runs[:20]],
        "submissions": [
            {
                "id": sb.id,
                "assignment_id": sb.assignment_id,
                "user_id": sb.user_id,
                "run_id": sb.run_id,
                "status": sb.status,
                "review_comment": sb.review_comment,
            }
            for sb in submissions
        ],
    }


@router.get("/experiment-templates")
def list_experiment_templates(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(ExperimentTemplate).order_by(ExperimentTemplate.created_at.asc()).all()
    return {
        "templates": [
            {
                "template_id": t.template_id,
                "title": t.title,
                "task_type": t.task_type,
                "model_family": t.model_family,
                "input_schema": _json_load(t.input_schema_json, {}),
                "output_schema": _json_load(t.output_schema_json, {}),
                "default_metrics": _json_load(t.default_metrics_json, []),
                "visualization_types": _json_load(t.visualization_types_json, []),
                "recommended_preprocessing": _json_load(t.recommended_preprocessing_json, []),
            }
            for t in items
        ]
    }


@router.get("/model-presets")
def list_model_presets(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(ModelPreset).order_by(ModelPreset.created_at.asc()).all()
    return {
        "presets": [
            {
                "preset_id": m.preset_id,
                "name": m.name,
                "category": m.category,
                "models": _json_load(m.models_json, []),
                "notes": m.notes,
            }
            for m in items
        ]
    }


@router.get("/report-templates")
def list_report_templates(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    items = db.query(ReportTemplate).order_by(ReportTemplate.created_at.asc()).all()
    return {
        "report_templates": [
            {
                "template_id": r.template_id,
                "name": r.name,
                "sections": _json_load(r.sections_json, []),
                "metric_groups": _json_load(r.metric_groups_json, {}),
                "visualization_defaults": _json_load(r.visualization_defaults_json, []),
                "interpretation_guide": r.interpretation_guide,
                "next_step_guide": r.next_step_guide,
            }
            for r in items
        ]
    }


@router.get("/metrics-catalog")
def metrics_catalog(
    current_user: User = Depends(get_current_approved_member),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _ensure_spring_2026_seed(db)
    del current_user
    return {
        "metrics": DEFAULT_METRIC_GROUPS,
        "visualizations": DEFAULT_VIS_TYPES,
    }
