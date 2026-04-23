/**
 * useExperimentV2State
 * -------------------------------------------------------------
 * State hook for the V2 notebook-first Experiment page.
 *
 * Design choices:
 *   - Pure localStorage persistence (no new dependency). Autosaved.
 *   - Shape intentionally matches the brief: cells[], timelineEvents[],
 *     recentChat[], fullConversation[], resultSummary.
 *   - Kept *independent* of the legacy notebook canvas state so the two
 *     can coexist while Legacy is being deprecated.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "ailab_experiment_v2_state_v1";
const AUTOSAVE_DEBOUNCE_MS = 450;

function id() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default starter notebook — Colab-like "Load / Preprocess / Train / Evaluate / Report". */
function starterCells() {
  const now = Date.now();
  return [
    {
      id: id(),
      type: "markdown",
      title: "실험 개요",
      content:
        "## 새 실험 노트북\n\n목표·KPI·제약 조건을 간단히 적어 주세요. 이 셀은 마크다운 메모입니다.",
      status: "idle",
      output: null,
      logs: [],
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      metadata: { starter: true, step: "overview" },
    },
    {
      id: id(),
      type: "prompt",
      title: "데이터 불러오기 · 제안 받기",
      content:
        "현재 프로젝트의 데이터셋 구조를 간단히 요약하고 전처리 단계 후보를 3가지 제안해 주세요.",
      status: "idle",
      output: null,
      logs: [],
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      metadata: { starter: true, step: "load", agent: "data" },
    },
    {
      id: id(),
      type: "code",
      title: "전처리 스케치",
      content:
        "# Python (백엔드 runner 연결 시 실행 가능)\nimport pandas as pd\n\ndf = pd.read_csv('path/to/data.csv')\ndf.info()\n",
      status: "idle",
      output: null,
      logs: [],
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      metadata: { starter: true, step: "preprocess" },
    },
    {
      id: id(),
      type: "prompt",
      title: "모델 추천",
      content:
        "내 데이터(수치형 위주, 분류 문제)에 가장 적합한 후보 모델 3개를 근거와 함께 추천해 주세요.",
      status: "idle",
      output: null,
      logs: [],
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      metadata: { starter: true, step: "train", agent: "model" },
    },
    {
      id: id(),
      type: "result",
      title: "평가 결과 (플레이스홀더)",
      content: "이 셀은 Run 블록 실행 이후 자동으로 채워집니다.",
      status: "idle",
      output: null,
      logs: [],
      createdAt: now,
      updatedAt: now,
      collapsed: true,
      metadata: { starter: true, step: "evaluate" },
    },
  ];
}

export const INITIAL_STATE = Object.freeze({
  experimentId: null,
  sessionId: null,
  notebookTitle: "새 실험",
  instructionDraft: "",
  cells: [],
  activeCellId: null,
  isRunning: false,
  rightPanelTab: "summary", // summary | viz | interp | compare | export
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  bottomPanelMode: "timeline", // hidden | timeline
  timelineEvents: [],
  recentChat: [], // compact (last 20) — shown in left sidebar
  fullConversation: [], // full history — shown in modal
  resultSummary: null,
  agent: "smart", // Smart | data | model | report | general
  provider: "openai", // openai | gemini
  useRag: true,
  savedAt: null,
  dirty: false,
});

function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

function hydrate(saved) {
  if (!saved) {
    const seeded = structuredClone(INITIAL_STATE);
    seeded.cells = starterCells();
    seeded.activeCellId = seeded.cells[0]?.id || null;
    return seeded;
  }
  const merged = structuredClone(INITIAL_STATE);
  for (const k of Object.keys(merged)) {
    if (saved[k] == null) continue;
    if (Array.isArray(merged[k])) {
      merged[k] = Array.isArray(saved[k]) ? saved[k] : merged[k];
    } else if (typeof merged[k] === "object" && merged[k] !== null) {
      merged[k] = { ...merged[k], ...saved[k] };
    } else {
      merged[k] = saved[k];
    }
  }
  // If no cells were ever persisted, still seed the starter notebook.
  if (!Array.isArray(merged.cells) || merged.cells.length === 0) {
    merged.cells = starterCells();
  }
  if (!merged.activeCellId && merged.cells[0]) {
    merged.activeCellId = merged.cells[0].id;
  }
  return merged;
}

export function useExperimentV2State() {
  const [state, setState] = useState(() => hydrate(readStored()));
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeStored(state), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  /* ---------- patches ---------- */

  const patch = useCallback((changes) => {
    setState((prev) => ({
      ...prev,
      ...(typeof changes === "function" ? changes(prev) : changes),
      dirty: true,
    }));
  }, []);

  const markSaved = useCallback(() => {
    setState((prev) => ({ ...prev, dirty: false, savedAt: Date.now() }));
  }, []);

  /* ---------- cell operations ---------- */

  const addCell = useCallback((type = "prompt", afterId = null) => {
    const now = Date.now();
    const starters = {
      prompt: "자연어 지시를 입력하세요.",
      markdown: "## 새 메모\n\n",
      code: "# Python\n",
      sql: "-- SQL\nSELECT *\nFROM your_table\nLIMIT 10;",
      result: "결과 플레이스홀더",
    };
    const titles = {
      prompt: "새 프롬프트 셀",
      markdown: "새 메모",
      code: "새 코드 셀",
      sql: "새 SQL 셀",
      result: "결과 셀",
    };
    const cell = {
      id: id(),
      type,
      title: titles[type] || "새 셀",
      content: starters[type] || "",
      status: "idle",
      output: null,
      logs: [],
      createdAt: now,
      updatedAt: now,
      collapsed: false,
      metadata: {},
    };
    setState((prev) => {
      const cells = prev.cells.slice();
      const idx = afterId
        ? cells.findIndex((c) => c.id === afterId)
        : cells.length - 1;
      const insertAt = idx < 0 ? cells.length : idx + 1;
      cells.splice(insertAt, 0, cell);
      return { ...prev, cells, activeCellId: cell.id, dirty: true };
    });
    return cell.id;
  }, []);

  const patchCell = useCallback((cellId, changes) => {
    setState((prev) => ({
      ...prev,
      cells: prev.cells.map((c) =>
        c.id === cellId ? { ...c, ...changes, updatedAt: Date.now() } : c
      ),
      dirty: true,
    }));
  }, []);

  const removeCell = useCallback((cellId) => {
    setState((prev) => ({
      ...prev,
      cells: prev.cells.filter((c) => c.id !== cellId),
      activeCellId:
        prev.activeCellId === cellId ? prev.cells[0]?.id || null : prev.activeCellId,
      dirty: true,
    }));
  }, []);

  const duplicateCell = useCallback((cellId) => {
    setState((prev) => {
      const idx = prev.cells.findIndex((c) => c.id === cellId);
      if (idx < 0) return prev;
      const src = prev.cells[idx];
      const copy = {
        ...src,
        id: id(),
        title: `${src.title} (복제)`,
        status: "idle",
        output: null,
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const cells = prev.cells.slice();
      cells.splice(idx + 1, 0, copy);
      return { ...prev, cells, activeCellId: copy.id, dirty: true };
    });
  }, []);

  const moveCell = useCallback((cellId, direction) => {
    setState((prev) => {
      const idx = prev.cells.findIndex((c) => c.id === cellId);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.cells.length) return prev;
      const cells = prev.cells.slice();
      [cells[idx], cells[swap]] = [cells[swap], cells[idx]];
      return { ...prev, cells, dirty: true };
    });
  }, []);

  const convertCell = useCallback(
    (cellId, newType) => {
      patchCell(cellId, { type: newType });
    },
    [patchCell]
  );

  const setActiveCell = useCallback((cellId) => {
    setState((prev) =>
      prev.activeCellId === cellId ? prev : { ...prev, activeCellId: cellId }
    );
  }, []);

  /* ---------- timeline ---------- */

  const appendTimeline = useCallback((event) => {
    const entry = {
      id: event?.id || id(),
      time: event?.time || Date.now(),
      actor: event?.actor || "system",
      type: event?.type || "note",
      summary: event?.summary || "",
      detail: event?.detail || "",
      relatedCellId: event?.relatedCellId || null,
      status: event?.status || "info",
    };
    setState((prev) => ({
      ...prev,
      timelineEvents: [...prev.timelineEvents.slice(-999), entry],
    }));
  }, []);

  const clearTimeline = useCallback(() => {
    setState((prev) => ({ ...prev, timelineEvents: [] }));
  }, []);

  /* ---------- chat history ---------- */

  const appendChat = useCallback((msg) => {
    const entry = {
      id: msg?.id || id(),
      role: msg?.role || "user", // user | agent | system
      content: msg?.content || "",
      time: msg?.time || Date.now(),
      relatedCellId: msg?.relatedCellId || null,
      compactSummary: msg?.compactSummary || null,
    };
    setState((prev) => ({
      ...prev,
      recentChat: [...prev.recentChat.slice(-19), entry],
      fullConversation: [...prev.fullConversation, entry],
    }));
  }, []);

  /* ---------- result summary ---------- */

  const setResultSummary = useCallback((summary) => {
    setState((prev) => ({ ...prev, resultSummary: summary, dirty: true }));
  }, []);

  const resetAll = useCallback(() => {
    const seeded = structuredClone(INITIAL_STATE);
    seeded.cells = starterCells();
    seeded.activeCellId = seeded.cells[0]?.id || null;
    setState(seeded);
    writeStored(seeded);
  }, []);

  const api = useMemo(
    () => ({
      state,
      patch,
      markSaved,
      addCell,
      patchCell,
      removeCell,
      duplicateCell,
      moveCell,
      convertCell,
      setActiveCell,
      appendTimeline,
      clearTimeline,
      appendChat,
      setResultSummary,
      resetAll,
    }),
    [
      state,
      patch,
      markSaved,
      addCell,
      patchCell,
      removeCell,
      duplicateCell,
      moveCell,
      convertCell,
      setActiveCell,
      appendTimeline,
      clearTimeline,
      appendChat,
      setResultSummary,
      resetAll,
    ]
  );

  return api;
}

export function formatRelative(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return new Date(ts).toLocaleString();
}

export function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}
