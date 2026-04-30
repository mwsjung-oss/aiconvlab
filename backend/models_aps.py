"""APS Job / LLM usage / Lab worker heartbeat (RDS PostgreSQL 운영 기준)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ExecutionJob(Base):
    """실험·학습 작업 단위 (SQS 연동)."""

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    experiment_id: Mapped[int | None] = mapped_column(
        ForeignKey("experiments.id"), nullable=True, index=True
    )
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    execution_target: Mapped[str] = mapped_column(
        String(16), nullable=False, default="aws"
    )  # aws | lab_gpu | auto
    resolved_target: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="CREATED", index=True
    )
    input_s3_uri: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    output_s3_uri: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_config_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    events: Mapped[list["JobEvent"]] = relationship(
        "JobEvent", back_populates="job", cascade="all, delete-orphan"
    )


class JobEvent(Base):
    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    job: Mapped["ExecutionJob"] = relationship("ExecutionJob", back_populates="events")


class LLMUsageLog(Base):
    __tablename__ = "llm_usage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    experiment_id: Mapped[int | None] = mapped_column(
        ForeignKey("experiments.id"), nullable=True, index=True
    )
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ok", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class LabWorkerHeartbeat(Base):
    __tablename__ = "lab_worker_heartbeats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    worker_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gpu_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="idle", index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
