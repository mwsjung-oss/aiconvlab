"""SQLAlchemy 모델: 사용자 및 활동 이력."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # member | master | director | technical_lead
    role: Mapped[str] = mapped_column(String(32), default="member", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # False = 플랫폼 사용 정지
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token: Mapped[str | None] = mapped_column(String(128), nullable=True)
    email_verification_expires: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    activities: Mapped[list["ActivityLog"]] = relationship(
        "ActivityLog", back_populates="user", cascade="all, delete-orphan"
    )
    experiments: Mapped[list["ExperimentRecord"]] = relationship(
        "ExperimentRecord", back_populates="user", cascade="all, delete-orphan"
    )
    experiments_v2: Mapped[list["Experiment"]] = relationship(
        "Experiment", back_populates="user", cascade="all, delete-orphan"
    )


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)  # login, upload, train, ...
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON 문자열 등
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User | None"] = relationship("User", back_populates="activities")


class ExperimentRecord(Base):
    __tablename__ = "experiment_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    model_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    dataset: Mapped[str] = mapped_column(String(255), nullable=False)
    target_column: Mapped[str] = mapped_column(String(255), nullable=False)
    feature_columns_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    model_type: Mapped[str] = mapped_column(String(64), nullable=False)
    metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    model_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    output_chart_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    workspace_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User | None"] = relationship("User", back_populates="experiments")


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    dataset: Mapped[str] = mapped_column(String(255), nullable=False)
    target_column: Mapped[str] = mapped_column(String(255), nullable=False)
    feature_columns_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    model_type: Mapped[str] = mapped_column(String(64), nullable=False)
    workspace_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User | None"] = relationship("User", back_populates="experiments_v2")
    runs: Mapped[list["ExperimentRun"]] = relationship(
        "ExperimentRun", back_populates="experiment", cascade="all, delete-orphan"
    )


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"), nullable=False, index=True)
    model_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    params_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    log_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    model_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    output_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    output_chart_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    reproducibility_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    registry_stage: Mapped[str] = mapped_column(
        String(32), nullable=False, default="none", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    experiment: Mapped["Experiment"] = relationship("Experiment", back_populates="runs")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # project_brief | paper_abstract | manual
    source_type: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    intelligence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ProjectMember(Base):
    __tablename__ = "project_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(64), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    instructor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Semester(Base):
    __tablename__ = "semesters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    term: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class StudentProject(Base):
    __tablename__ = "student_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"), nullable=True, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    student_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    student_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    title_kr: Mapped[str] = mapped_column(Text, nullable=False)
    title_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    abstract_summary: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    data_type: Mapped[str] = mapped_column(String(128), nullable=False, default="structured")
    task_types_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    model_candidates_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    expected_inputs_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    expected_outputs_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    evaluation_metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    report_template_id: Mapped[int | None] = mapped_column(ForeignKey("report_templates.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), nullable=False, index=True)
    dataset: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    experiment_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    run_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="submitted", nullable=False, index=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DatasetCatalog(Base):
    __tablename__ = "dataset_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    schema_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    version: Mapped[str] = mapped_column(String(64), nullable=False, default="v1")
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    owner_name: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)
    student_project_id: Mapped[int | None] = mapped_column(ForeignKey("student_projects.id"), nullable=True, index=True)
    dataset_type: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    target_variable: Mapped[str | None] = mapped_column(String(255), nullable=True)
    time_index: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sensor_columns_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ModelRegistry(Base):
    __tablename__ = "model_registry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    # 확장: 프로덕션 승격(선택)
    lifecycle_stage: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    model_uuid: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ExperimentTemplate(Base):
    __tablename__ = "experiment_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    template_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    model_family: Mapped[str] = mapped_column(String(128), nullable=False)
    input_schema_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    output_schema_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    default_metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    visualization_types_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    recommended_preprocessing_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ModelPreset(Base):
    __tablename__ = "model_presets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    preset_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    models_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    template_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sections_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    metric_groups_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    visualization_defaults_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    interpretation_guide: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_step_guide: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ProjectDatasetLink(Base):
    __tablename__ = "project_dataset_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_project_id: Mapped[int] = mapped_column(ForeignKey("student_projects.id"), nullable=False, index=True)
    dataset_catalog_id: Mapped[int] = mapped_column(ForeignKey("dataset_catalog.id"), nullable=False, index=True)
    relation_type: Mapped[str] = mapped_column(String(64), nullable=False, default="primary")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="guide", index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class LineageEdge(Base):
    """데이터셋 → 학습 → 모델 → 예측 산출물 계보."""

    __tablename__ = "lineage_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    from_kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    from_ref: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    to_kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    to_ref: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    meta_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class LeaderboardEntry(Base):
    """공개 벤치마크 리더보드(닉네임·지표 제출)."""

    __tablename__ = "leaderboard_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    dataset_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    nickname: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    metric_name: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    model_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    experiment_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class LLMExperimentLog(Base):
    """LLM/에이전트 평가 실험(프롬프트 버전·Judge 점수)."""

    __tablename__ = "llm_experiment_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(128), nullable=False, default="v1")
    eval_dataset_label: Mapped[str] = mapped_column(String(255), nullable=False, default="custom")
    judge_scores_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
