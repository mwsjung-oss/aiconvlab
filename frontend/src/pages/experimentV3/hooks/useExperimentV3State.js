/**
 * useExperimentV3State
 * ------------------------------------------------------------
 * V3 전용 상태 훅. V2 의 autosave / clamp 패턴을 단순화해 재사용한다.
 *
 * 영속화 키: ailab_experiment_v3_state_v1   (V2 키와 독립)
 *
 * state 구조 (요약):
 *   projectName          상단 표시용 프로젝트명
 *   stage                현재 선택 단계 (define|data|run|analyze|report)
 *   activeActivityId     현재 선택된 Activity id
 *   cellsByActivity      { [activityId]: Cell[] }
 *   historyDrawerOpen    RunHistory 드로어 열림
 *   lastUploadedFile     최근 업로드된 CSV 이름
 *   savedAt              마지막 저장 시각(ms)
 *   dirty                저장 필요 여부
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITIES,
  STAGES,
  getFirstActivityOfStage,
} from "../config/activities.config.js";

const STORAGE_KEY = "ailab_experiment_v3_state_v1";
const AUTOSAVE_DEBOUNCE_MS = 500;

export const INITIAL_STATE = Object.freeze({
  projectName: "새 AI 실험",
  stage: STAGES[0].id,
  activeActivityId: getFirstActivityOfStage(STAGES[0].id)?.id ?? null,
  cellsByActivity: {},
  historyDrawerOpen: false,
  lastUploadedFile: null,
  savedAt: null,
  dirty: false,
  kernelReady: false,
});

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(state) {
  try {
    const safe = { ...state, dirty: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

function hydrate(saved) {
  const merged = { ...INITIAL_STATE, ...(saved || {}) };
  /* 기본값 검증. stage/activity 가 없거나 이상하면 첫 단계로. */
  if (!STAGES.some((s) => s.id === merged.stage)) {
    merged.stage = STAGES[0].id;
  }
  if (
    !merged.activeActivityId ||
    !ACTIVITIES.some((a) => a.id === merged.activeActivityId)
  ) {
    merged.activeActivityId =
      getFirstActivityOfStage(merged.stage)?.id ?? null;
  }
  if (!merged.cellsByActivity || typeof merged.cellsByActivity !== "object") {
    merged.cellsByActivity = {};
  }
  return merged;
}

function newCellId() {
  return `cell_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function makeCell({ type = "prompt", content = "", title = "" } = {}) {
  return {
    id: newCellId(),
    type, // prompt | code | markdown | sql
    title: title || defaultTitleForType(type),
    content,
    status: "idle", // idle | running | done | error
    outputs: [], // [{ type: 'stream'|'display'|'text'|'error', data: string }]
    executionCount: null,
    durationMs: null,
    runAt: null,
    traceIds: [], // 연관된 trace 식별자 (백엔드 /api/tracing)
  };
}

function defaultTitleForType(t) {
  switch (t) {
    case "code":
      return "Code";
    case "markdown":
      return "Markdown";
    case "sql":
      return "SQL";
    case "prompt":
    default:
      return "Prompt";
  }
}

export function useExperimentV3State() {
  const [state, setState] = useState(() => hydrate(readStored()));
  const saveTimer = useRef(null);

  /* autosave (debounce) */
  useEffect(() => {
    if (!state.dirty) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const ok = writeStored({ ...state, savedAt: Date.now() });
      if (ok) {
        setState((s) => ({ ...s, savedAt: Date.now(), dirty: false }));
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state]);

  const patch = useCallback((changes) => {
    setState((s) => ({ ...s, ...changes, dirty: true }));
  }, []);

  const setStage = useCallback(
    (stageId) => {
      const first = getFirstActivityOfStage(stageId);
      setState((s) => ({
        ...s,
        stage: stageId,
        activeActivityId: first?.id ?? s.activeActivityId,
        dirty: true,
      }));
    },
    []
  );

  const setActivity = useCallback((activityId) => {
    setState((s) => ({ ...s, activeActivityId: activityId, dirty: true }));
  }, []);

  const getCellsFor = useCallback(
    (activityId) => state.cellsByActivity?.[activityId] || [],
    [state.cellsByActivity]
  );

  const replaceCells = useCallback((activityId, cells) => {
    setState((s) => ({
      ...s,
      cellsByActivity: { ...s.cellsByActivity, [activityId]: cells },
      dirty: true,
    }));
  }, []);

  const addCell = useCallback(
    (activityId, type = "prompt", afterId = null, initial = {}) => {
      setState((s) => {
        const list = s.cellsByActivity?.[activityId] || [];
        const newCell = makeCell({ type, ...initial });
        const nextList = [...list];
        if (afterId == null) {
          nextList.push(newCell);
        } else {
          const idx = nextList.findIndex((c) => c.id === afterId);
          if (idx < 0) nextList.push(newCell);
          else nextList.splice(idx + 1, 0, newCell);
        }
        return {
          ...s,
          cellsByActivity: { ...s.cellsByActivity, [activityId]: nextList },
          dirty: true,
        };
      });
    },
    []
  );

  const patchCell = useCallback((activityId, cellId, changes) => {
    setState((s) => {
      const list = s.cellsByActivity?.[activityId] || [];
      const next = list.map((c) => (c.id === cellId ? { ...c, ...changes } : c));
      return {
        ...s,
        cellsByActivity: { ...s.cellsByActivity, [activityId]: next },
        dirty: true,
      };
    });
  }, []);

  const removeCell = useCallback((activityId, cellId) => {
    setState((s) => {
      const list = s.cellsByActivity?.[activityId] || [];
      return {
        ...s,
        cellsByActivity: {
          ...s.cellsByActivity,
          [activityId]: list.filter((c) => c.id !== cellId),
        },
        dirty: true,
      };
    });
  }, []);

  const moveCell = useCallback((activityId, cellId, dir) => {
    setState((s) => {
      const list = (s.cellsByActivity?.[activityId] || []).slice();
      const i = list.findIndex((c) => c.id === cellId);
      if (i < 0) return s;
      const j = dir === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      return {
        ...s,
        cellsByActivity: { ...s.cellsByActivity, [activityId]: list },
        dirty: true,
      };
    });
  }, []);

  const markSaved = useCallback(() => {
    setState((s) => ({ ...s, savedAt: Date.now(), dirty: false }));
  }, []);

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    setState(hydrate(null));
  }, []);

  const api = useMemo(
    () => ({
      state,
      patch,
      setStage,
      setActivity,
      getCellsFor,
      replaceCells,
      addCell,
      patchCell,
      removeCell,
      moveCell,
      markSaved,
      resetAll,
    }),
    [
      state,
      patch,
      setStage,
      setActivity,
      getCellsFor,
      replaceCells,
      addCell,
      patchCell,
      removeCell,
      moveCell,
      markSaved,
      resetAll,
    ]
  );

  return api;
}

export function hasLegacyV2Data() {
  try {
    const raw = localStorage.getItem("ailab_experiment_v2_state_v1");
    return Boolean(raw);
  } catch {
    return false;
  }
}

export function readLegacyV2Data() {
  try {
    const raw = localStorage.getItem("ailab_experiment_v2_state_v1");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function formatRelative(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
