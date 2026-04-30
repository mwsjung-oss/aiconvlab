"""워크스페이스 디렉터리(staging) ↔ 객체 스토리지 동기화."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .object_store import object_key, ops as s3ops

logger = ...  # reserved for tracing


def uses_object_workspace() -> bool:
    sb = (os.getenv("STORAGE_BACKEND") or "local").strip().lower()
    return sb in ("s3", "r2")


def full_key(workspace_scope: str, relative_posix_path: str) -> str:
    rel = relative_posix_path.replace("\\", "/").lstrip("/")
    return object_key(workspace_scope, *rel.split("/"))


def push_file(workspace_scope: str, staging_full_path: Path, staging_anchor: Path) -> None:
    """staging_anchor 기준 상대경로 한 키로 업로드."""
    if not uses_object_workspace():
        return
    rel = staging_full_path.resolve().relative_to(staging_anchor.resolve()).as_posix()
    op = s3ops()
    key = full_key(workspace_scope, rel)
    data = staging_full_path.read_bytes()
    content_type = _guess_content_type(staging_full_path)
    op.put_bytes(key, data, content_type)


def fetch_file_if_missing(
    workspace_scope: str,
    staging_full_path: Path,
    staging_anchor: Path,
) -> None:
    if not uses_object_workspace():
        return
    if staging_full_path.is_file():
        return
    rel = staging_full_path.resolve().relative_to(staging_anchor.resolve()).as_posix()
    op = s3ops()
    key = full_key(workspace_scope, rel)
    blob = op.get_bytes(key)
    if blob is None:
        return
    staging_full_path.parent.mkdir(parents=True, exist_ok=True)
    staging_full_path.write_bytes(blob)


def delete_file_from_store(
    workspace_scope: str,
    staging_full_path: Path,
    staging_anchor: Path,
) -> None:
    """push_file와 같은 객체 키를 삭제합니다."""
    if not uses_object_workspace():
        return
    rel = staging_full_path.resolve().relative_to(staging_anchor.resolve()).as_posix()
    key = full_key(workspace_scope, rel)
    s3ops().delete_keys([key])


def list_csv_basenames(workspace_scope: str, data_dir: Path, staging_anchor: Path) -> list[str]:
    if not uses_object_workspace():
        return sorted(p.name for p in data_dir.glob("*.csv"))

    rel_dir = data_dir.resolve().relative_to(staging_anchor.resolve()).as_posix()
    pref = full_key(workspace_scope, rel_dir) + "/"
    keys = s3ops().list_prefix_keys(pref)
    out: list[str] = []
    seen: set[str] = set()
    for k in keys:
        if not k.endswith(".csv"):
            continue
        name = k.rsplit("/", 1)[-1]
        if name and name not in seen:
            seen.add(name)
            out.append(name)
    return sorted(out)


def list_csv_dataset_detail_items(
    workspace_scope: str, data_dir: Path, staging_anchor: Path
) -> list[dict[str, Any]]:
    """GET /api/datasets/detail — 객체 모드에서 버킷 메타만으로 CSV 목록·크기 표시."""
    if not uses_object_workspace():
        items: list[dict[str, Any]] = []
        for p in sorted(data_dir.glob("*.csv")):
            st = p.stat()
            items.append(
                {
                    "filename": p.name,
                    "size_bytes": st.st_size,
                    "updated_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                }
            )
        return items

    rel_dir = data_dir.resolve().relative_to(staging_anchor.resolve()).as_posix()
    pref = full_key(workspace_scope, rel_dir) + "/"
    rows = s3ops().list_prefix_summaries(pref)
    items_obj: list[dict[str, Any]] = []
    for key, sz, lm in rows:
        name = key.rsplit("/", 1)[-1]
        if not name.lower().endswith(".csv"):
            continue
        ua = ""
        if lm is not None:
            ua = lm.astimezone(timezone.utc).isoformat()
        items_obj.append({"filename": name, "size_bytes": sz, "updated_at": ua})
    return sorted(items_obj, key=lambda d: str(d["filename"]))


def glob_json_models(workspace_scope: str, models_dir: Path, staging_anchor: Path) -> list[Path]:
    if not uses_object_workspace():
        return sorted(models_dir.glob("*.json"))

    rel_dir = models_dir.resolve().relative_to(staging_anchor.resolve()).as_posix()
    pref = full_key(workspace_scope, rel_dir) + "/"
    keys = s3ops().list_prefix_keys(pref)
    local: list[Path] = []
    for k in sorted(keys):
        if not k.endswith(".json"):
            continue
        name = k.rsplit("/", 1)[-1]
        tgt = models_dir / name
        fetch_file_if_missing(workspace_scope, tgt, staging_anchor)
        local.append(tgt)
    return sorted(local)


def list_basenames_under_dir_with_suffix(
    workspace_scope: str,
    base_dir: Path,
    staging_anchor: Path,
    suffix_without_dot: str,
) -> list[str]:
    """버킷·스테이징 디렉터리에서 접미사(예 ``joblib``)가 맞는 파일명만 목록합니다(다운로드 없음)."""
    suf = suffix_without_dot.lower()
    if not suf.startswith("."):
        suf = "." + suf
    suf = suf.lower()

    def _suffix_ok(nm: str) -> bool:
        return nm.lower().endswith(suf)

    if not uses_object_workspace():
        return sorted(
            p.name
            for p in base_dir.iterdir()
            if p.is_file() and _suffix_ok(p.name)
        )

    rel_dir = base_dir.resolve().relative_to(staging_anchor.resolve()).as_posix()
    pref = full_key(workspace_scope, rel_dir) + "/"
    keys = s3ops().list_prefix_keys(pref)
    names: list[str] = []
    for k in keys:
        nm = k.rsplit("/", 1)[-1]
        if nm and _suffix_ok(nm):
            names.append(nm)
    return sorted(names)


def list_output_basenames(workspace_scope: str, outputs_dir: Path, staging_anchor: Path) -> list[str]:
    if not uses_object_workspace():
        return sorted(p.name for p in outputs_dir.glob("*") if p.is_file())
    rel_dir = outputs_dir.resolve().relative_to(staging_anchor.resolve()).as_posix()
    pref = full_key(workspace_scope, rel_dir) + "/"
    keys = s3ops().list_prefix_keys(pref)
    names: list[str] = []
    for k in keys:
        nm = k.rsplit("/", 1)[-1]
        if nm:
            names.append(nm)
    return sorted(names)


def glob_outputs_reports(
    workspace_scope: str,
    outputs_dir: Path,
    staging_anchor: Path,
    pattern_suffix: str = "",
) -> list[Path]:
    if not uses_object_workspace():
        globs = (
            outputs_dir.glob(f"*{pattern_suffix}") if pattern_suffix else outputs_dir.glob("*")
        )
        return sorted(p for p in globs if p.is_file())

    rel_dir = outputs_dir.resolve().relative_to(staging_anchor.resolve()).as_posix()
    pref = full_key(workspace_scope, rel_dir) + "/"
    keys = s3ops().list_prefix_keys(pref)
    out_paths: list[Path] = []
    for k in sorted(keys):
        name = k.rsplit("/", 1)[-1]
        if pattern_suffix and not name.endswith(pattern_suffix):
            continue
        tgt = outputs_dir / name
        fetch_file_if_missing(workspace_scope, tgt, staging_anchor)
        out_paths.append(tgt)
    return sorted(out_paths, key=lambda p: p.name)


def pull_output_for_download(
    workspace_scope: str,
    safe_name: str,
    outputs_dir: Path,
    staging_anchor: Path,
) -> Path:
    tgt = (outputs_dir / safe_name).resolve()
    fetch_file_if_missing(workspace_scope, tgt, staging_anchor)
    return tgt


def snapshot_push_workspace(ws) -> None:
    """staging data/models/outputs 각 파일 업로드(작업 종료 후 일괄 동기화)."""
    if not uses_object_workspace():
        return
    scope = getattr(ws, "workspace_scope", "") or ""
    anchor: Path = getattr(ws, "staging_anchor").resolve()
    for attr in ("data", "models", "outputs"):
        root: Path = getattr(ws, attr).resolve()
        if not root.is_dir():
            continue
        for p in root.rglob("*"):
            if p.is_file():
                push_file(scope, p, anchor)


def _guess_content_type(p: Path) -> str | None:
    ext = p.suffix.lower()
    if ext == ".csv":
        return "text/csv"
    if ext == ".json":
        return "application/json"
    if ext in {".png", ".jpg", ".jpeg"}:
        return "image/jpeg" if ext in {".jpg", ".jpeg"} else "image/png"
    if ext == ".joblib":
        return "application/octet-stream"
    if ext == ".md":
        return "text/markdown"
    if ext == ".pt":
        return "application/octet-stream"
    return None
