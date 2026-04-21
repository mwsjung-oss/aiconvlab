"""Offline tests for the agent layer."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SRC_DIR = Path(__file__).resolve().parent.parent / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))


_DATA_FAKE = {
    "dataset_summary": "A retail transactions table with daily sales per SKU.",
    "target_candidates": ["sales_qty"],
    "feature_groups": ["temporal", "product", "store"],
    "recommended_preprocessing": ["impute missing price", "encode store_id"],
    "data_quality_concerns": ["seasonality", "zero-inflated target"],
}
_MODEL_FAKE = {
    "task_type": "regression",
    "recommended_models": [
        {
            "name": "XGBoost",
            "rationale": "Handles tabular data with mixed types.",
            "hyperparameters": {"max_depth": 6, "n_estimators": 400},
        },
        {
            "name": "LightGBM",
            "rationale": "Faster alternative with similar quality.",
            "hyperparameters": {"num_leaves": 63},
        },
    ],
    "evaluation_metrics": ["MAE", "RMSE", "MAPE"],
    "validation_strategy": "Time-series 5-fold with expanding window",
    "tracking_checklist": ["params", "metrics", "feature_importance"],
}
_REPORT_FAKE = {
    "executive_summary": "XGBoost outperformed the baseline by 12% on MAPE.",
    "key_findings": ["Weekday effect dominates", "Promotions drive spikes"],
    "recommendations": ["Deploy XGBoost to staging"],
    "risks": ["Holiday coverage insufficient"],
    "next_experiments": ["Try hierarchical forecasting"],
}


def _fake_ask_llm_json_factory():
    def _fake(provider, prompt, *, model=None, system=None):
        # Each agent begins its user prompt with a distinct top-level header.
        # Match on the *opening* header so context sections added by the
        # orchestrator do not confuse the dispatcher.
        head = prompt.lstrip().split("\n", 1)[0]
        if head.startswith("# Dataset brief"):
            return dict(_DATA_FAKE)
        if head.startswith("# Modeling brief"):
            return dict(_MODEL_FAKE)
        if head.startswith("# Experiment results"):
            return dict(_REPORT_FAKE)
        raise AssertionError(f"Unexpected prompt head: {head!r}")

    return _fake


@pytest.fixture()
def patched_llm(monkeypatch: pytest.MonkeyPatch):
    from services.agents import base

    monkeypatch.setattr(base, "ask_llm_json", _fake_ask_llm_json_factory())
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    return monkeypatch


def test_data_agent_returns_validated_output(patched_llm) -> None:
    from services.agents import DataAgent

    agent = DataAgent(provider="openai", model="gpt-4o-mini")
    result = agent.run("Daily sales table with 3 years of history")
    assert result.agent == "data"
    assert result.provider == "openai"
    assert result.output["dataset_summary"].startswith("A retail")
    assert "sales_qty" in result.output["target_candidates"]
    assert result.used_rag is False
    assert result.elapsed_ms >= 0


def test_model_agent_returns_validated_output(patched_llm) -> None:
    from services.agents import ModelAgent

    agent = ModelAgent()
    result = agent.run("Predict weekly sales per SKU")
    assert result.output["task_type"] == "regression"
    assert result.output["recommended_models"][0]["name"] == "XGBoost"
    assert "MAE" in result.output["evaluation_metrics"]


def test_report_agent_returns_validated_output(patched_llm) -> None:
    from services.agents import ReportAgent

    agent = ReportAgent()
    result = agent.run("Run log: RMSE=0.14 baseline RMSE=0.16")
    assert "XGBoost" in result.output["executive_summary"]
    assert result.output["key_findings"]


def test_experiment_agent_runs_sequential_pipeline(patched_llm) -> None:
    from services.agents import ExperimentAgent

    orch = ExperimentAgent()
    result = orch.run("Forecast daily demand per SKU", context="business KPIs attached")
    out = result.output
    assert "data_plan" in out
    assert "modeling_plan" in out
    assert "report" in out
    assert out["modeling_plan"]["task_type"] == "regression"
    assert out["data_plan"]["dataset_summary"].startswith("A retail")
    assert result.notes and "stages" in result.notes


def test_smart_agent_merges_rag_and_runs_inner(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.agents import base
    from services.agents.smart_agent import SmartAgent
    from services.rag.vector_store import RetrievedDoc
    import services.agents.smart_agent as smart_mod

    monkeypatch.setattr(base, "ask_llm_json", _fake_ask_llm_json_factory())
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")

    fake_hits = [
        RetrievedDoc(
            id="k1",
            text="Holiday periods skew predictions upward.",
            metadata={"source": "wiki:holidays"},
            score=0.81,
        )
    ]
    monkeypatch.setattr(smart_mod, "semantic_search", lambda *a, **kw: fake_hits)

    captured_context: dict = {}

    class _RecordingDataAgent:
        def __init__(self, *, provider="openai", model=None):
            self.provider = provider
            self.model = model

        def run(self, task, *, context=None, used_rag=False):
            captured_context["context"] = context
            captured_context["used_rag"] = used_rag
            from services.agents.base import AgentResult

            return AgentResult(
                agent="data",
                provider=self.provider,
                model=self.model or "gpt-4o-mini",
                output=dict(_DATA_FAKE),
                elapsed_ms=5,
                used_rag=used_rag,
            )

    monkeypatch.setitem(smart_mod._INNER_AGENTS, "data", _RecordingDataAgent)
    smart = SmartAgent(inner="data", provider="openai", top_k=3)
    result = smart.run("Predict seasonal sales", context="focus on Q4")

    assert result.agent == "smart"
    assert result.used_rag is True
    assert "Holiday periods skew predictions" in (captured_context["context"] or "")
    assert "focus on Q4" in (captured_context["context"] or "")
    assert captured_context["used_rag"] is True

    inner = result.output["inner_output"]
    assert inner["dataset_summary"].startswith("A retail")
    assert result.output["retrieved_sources"][0]["id"] == "k1"


def test_build_agent_rejects_unknown() -> None:
    from services.agents import AgentRunError, build_agent

    with pytest.raises(AgentRunError):
        build_agent("unknown")


def test_agent_surface_llm_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.agents import DataAgent, AgentRunError
    from services.agents import base
    from services.llm_gateway import LLMGatewayError

    def _raise(*a, **kw):
        raise LLMGatewayError("boom")

    monkeypatch.setattr(base, "ask_llm_json", _raise)
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")

    with pytest.raises(AgentRunError):
        DataAgent().run("dataset brief")


def test_agent_tolerant_to_extra_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.agents import DataAgent
    from services.agents import base

    raw = dict(_DATA_FAKE)
    raw["unexpected_field"] = 42

    monkeypatch.setattr(base, "ask_llm_json", lambda *a, **kw: raw)
    monkeypatch.setenv("OPENAI_API_KEY", "dummy")

    result = DataAgent().run("anything")
    assert result.output["dataset_summary"]
