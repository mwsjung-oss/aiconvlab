/**
 * useTracing — 모든 프롬프트/실행 이력을 로컬+서버 양쪽에 기록·조회.
 *
 * 정책:
 *   - 1차 저장소: localStorage (즉시, 오프라인)
 *   - 2차 저장소: /api/tracing/record (백엔드 SQLite, best-effort)
 *   - 조회는 로컬 먼저 노출 + 백엔드로 보강
 *
 * 레코드 스키마 (클라이언트/서버 공통):
 *   { id, userId?, stage, activity_id, cell_id?, kind, content,
 *     outputs_json?, execution_count?, duration_ms?, created_at }
 *   kind: prompt | code | result | error | file
 */
import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../../../services/api/client";

const LOCAL_KEY = "ailab_experiment_v3_traces_v1";
const LOCAL_LIMIT = 500;

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try {
    const trimmed = list.slice(-LOCAL_LIMIT);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota exceeded 등은 무시 */
  }
}

function newId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function postServer(rec) {
  try {
    await requestJson("/api/tracing/record", {
      method: "POST",
      body: rec,
    });
    return true;
  } catch {
    return false;
  }
}

async function listServer({ stage, activityId, limit = 100 } = {}) {
  try {
    const q = new URLSearchParams();
    if (stage) q.set("stage", stage);
    if (activityId) q.set("activity_id", activityId);
    if (limit) q.set("limit", String(limit));
    const res = await requestJson(
      `/api/tracing/list?${q.toString()}`,
      { method: "GET" }
    );
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return null;
  }
}

export function useTracing() {
  const [traces, setTraces] = useState(() => readLocal());

  const record = useCallback(async (partial) => {
    const rec = {
      id: newId(),
      created_at: new Date().toISOString(),
      stage: partial.stage || "unknown",
      activity_id: partial.activity_id || partial.activityId || "unknown",
      cell_id: partial.cell_id || partial.cellId || null,
      kind: partial.kind || "prompt",
      content: typeof partial.content === "string" ? partial.content : JSON.stringify(partial.content ?? ""),
      outputs_json:
        partial.outputs_json ??
        (partial.outputs ? JSON.stringify(partial.outputs) : null),
      execution_count: partial.execution_count ?? null,
      duration_ms: partial.duration_ms ?? null,
    };
    setTraces((prev) => {
      const next = [...prev, rec];
      writeLocal(next);
      return next;
    });
    /* 서버 기록은 fire-and-forget. 실패해도 로컬은 남는다. */
    postServer(rec);
    return rec;
  }, []);

  const clear = useCallback(() => {
    setTraces([]);
    writeLocal([]);
  }, []);

  const listFor = useCallback(
    (activityId) =>
      traces
        .filter((t) => t.activity_id === activityId)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [traces]
  );

  const listForStage = useCallback(
    (stage) =>
      traces
        .filter((t) => t.stage === stage)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [traces]
  );

  /* 필요 시 백엔드 페이징 조회 */
  const fetchServerTraces = useCallback(async (opts) => {
    const items = await listServer(opts);
    return items;
  }, []);

  /* 마운트 시 서버에 최근 100건 조회하여 병합(있다면) */
  useEffect(() => {
    let alive = true;
    (async () => {
      const items = await listServer({ limit: 100 });
      if (!alive || !items || items.length === 0) return;
      setTraces((prev) => {
        const map = new Map();
        for (const t of prev) map.set(t.id, t);
        for (const t of items) {
          if (!map.has(t.id)) map.set(t.id, t);
        }
        const merged = Array.from(map.values()).sort((a, b) =>
          (a.created_at || "") < (b.created_at || "") ? -1 : 1
        );
        writeLocal(merged);
        return merged;
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return {
    traces,
    record,
    clear,
    listFor,
    listForStage,
    fetchServerTraces,
  };
}
