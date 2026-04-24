"""Tracing store (SQLite) 기본 동작 검증.

실제 Experiment V3 의 /api/tracing/* 가 동작하려면 이 모듈이
import/record/list/soft_delete/export_markdown 가 문제없이 돌아야 한다.
"""
from __future__ import annotations

import os
import tempfile
from typing import Iterator

import pytest


@pytest.fixture()
def store(monkeypatch) -> Iterator:
    """임시 SQLite DB 로 격리된 tracing_store 모듈을 얻는다."""
    tmp_dir = tempfile.mkdtemp(prefix="tracing_test_")
    tmp_db = os.path.join(tmp_dir, "traces.db")
    monkeypatch.setenv("TRACING_DB_PATH", tmp_db)

    import importlib

    import services.tracing_store as ts_mod  # type: ignore

    # 모듈 레벨에서 DB 경로를 이미 계산했을 수 있으므로 reload 해 환경변수 반영.
    ts_mod = importlib.reload(ts_mod)
    yield ts_mod


def test_record_and_list(store):
    r = store.record(
        user_id="u1",
        stage="define",
        activity_id="define.goal",
        kind="prompt",
        content="hello world",
    )
    assert r["id"]
    assert r["kind"] == "prompt"

    items = store.list_traces(user_id="u1")
    assert len(items) == 1
    assert items[0]["content"] == "hello world"


def test_filter_by_stage_and_activity(store):
    store.record(
        user_id="u2", stage="data", activity_id="data.ingest",
        kind="file", content="upload.csv"
    )
    store.record(
        user_id="u2", stage="run", activity_id="run.baseline",
        kind="code", content="print(1)"
    )
    all_items = store.list_traces(user_id="u2")
    assert len(all_items) == 2
    run_items = store.list_traces(user_id="u2", stage="run")
    assert len(run_items) == 1 and run_items[0]["activity_id"] == "run.baseline"


def test_soft_delete_hides_from_list(store):
    r = store.record(
        user_id="u3", stage="define", activity_id="define.goal",
        kind="prompt", content="temp"
    )
    assert store.soft_delete(r["id"]) is True
    assert store.list_traces(user_id="u3") == []


def test_export_markdown_contains_content(store):
    store.record(
        user_id="u4", stage="analyze", activity_id="analyze.metrics",
        kind="result", content="F1=0.91"
    )
    items = store.list_traces(user_id="u4")
    md = store.export_markdown(items)
    assert "# Experiment V3 Traces" in md
    assert "F1=0.91" in md


def test_upsert_on_same_id(store):
    r = store.record(
        id="fixed_id_1",
        user_id="u5", stage="define", activity_id="define.goal",
        kind="prompt", content="v1"
    )
    store.record(
        id=r["id"],
        user_id="u5", stage="define", activity_id="define.goal",
        kind="prompt", content="v2"
    )
    items = store.list_traces(user_id="u5")
    assert len(items) == 1
    assert items[0]["content"] == "v2"
