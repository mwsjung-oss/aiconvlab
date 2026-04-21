/**
 * Lightweight, localStorage-backed state store for the Notebook Canvas.
 *
 * We avoid adding Zustand/Redux: the notebook has a small, well-bounded state
 * shape (6 blocks × a few fields + run history + UI prefs), so a pair of
 * custom hooks gives us autosave + persistence without a new dependency.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "ailab_notebook_state_v1";
const AUTOSAVE_DEBOUNCE_MS = 400;

/** Canonical, always-present notebook shape. Used as a seed + schema guard. */
export const INITIAL_NOTEBOOK_STATE = Object.freeze({
  problem: {
    title: "",
    objective: "",
    kpi: "",
    constraints: "",
    notes: "",
    status: "idle", // idle | in_progress | done | warning
    expanded: true,
    agentOutput: null, // last AgentResult.output
    agentMeta: null, // { provider, model, elapsed_ms, usedRag }
  },
  data: {
    datasetId: "",
    targetColumn: "",
    featureNotes: "",
    nullSummary: "",
    typeSummary: "",
    warnings: [],
    status: "idle",
    expanded: true,
    agentOutput: null,
    agentMeta: null,
  },
  model: {
    problemType: "classification",
    candidateModels: "",
    baselineModel: "",
    parameters: "",
    notes: "",
    status: "idle",
    expanded: false,
    agentOutput: null,
    agentMeta: null,
  },
  run: {
    runName: "",
    configSummary: "",
    status: "idle", // idle | queued | loading_data | validating | training | evaluating | saving | completed | failed
    progress: 0,
    currentStage: "",
    elapsedSec: 0,
    startedAt: null,
    logs: [],
    metrics: null,
    expanded: true,
    agentOutput: null,
    agentMeta: null,
  },
  compare: {
    runA: "",
    runB: "",
    mode: "metrics", // metrics | params | both
    expanded: false,
    agentOutput: null,
    agentMeta: null,
  },
  report: {
    reportType: "summary",
    audience: "executive", // student | professor | executive | client
    exportType: "markdown", // markdown | pdf | html
    preview: "",
    artifacts: [],
    status: "idle",
    expanded: false,
    agentOutput: null,
    agentMeta: null,
  },
  ui: {
    inspectorCollapsed: false,
    knowledgeOpen: false,
    consoleOpen: true,
    provider: "openai",
    useRag: true,
    dirty: false,
    lastSavedAt: null,
  },
  runs: [], // RunRecord[]
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
    /* ignore quota errors */
  }
}

/** Deep-merge previously persisted state on top of the schema so future
 *  releases that add a new field don't crash older stored JSON. */
function hydrate(saved) {
  if (!saved) return structuredClone(INITIAL_NOTEBOOK_STATE);
  const merged = structuredClone(INITIAL_NOTEBOOK_STATE);
  for (const key of Object.keys(merged)) {
    if (saved[key] && typeof saved[key] === "object") {
      if (Array.isArray(merged[key])) {
        merged[key] = Array.isArray(saved[key]) ? saved[key] : merged[key];
      } else {
        merged[key] = { ...merged[key], ...saved[key] };
      }
    }
  }
  return merged;
}

export function useNotebookState() {
  const [state, setState] = useState(() => hydrate(readStored()));
  const saveTimer = useRef(null);

  const persist = useCallback((next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeStored(next);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    persist(state);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, persist]);

  /** Shallow-merge helpers keyed per block. Reduces useState boilerplate in
   *  every individual block component. */
  const patchBlock = useCallback((block, changes) => {
    setState((prev) => ({
      ...prev,
      [block]: { ...prev[block], ...changes },
      ui: { ...prev.ui, dirty: true },
    }));
  }, []);

  const setBlockStatus = useCallback(
    (block, status) => patchBlock(block, { status }),
    [patchBlock]
  );

  const toggleBlock = useCallback(
    (block) =>
      setState((prev) => ({
        ...prev,
        [block]: { ...prev[block], expanded: !prev[block].expanded },
      })),
    []
  );

  const setAgentOutput = useCallback(
    (block, output, meta) => patchBlock(block, { agentOutput: output, agentMeta: meta }),
    [patchBlock]
  );

  const patchUi = useCallback((changes) => {
    setState((prev) => ({ ...prev, ui: { ...prev.ui, ...changes } }));
  }, []);

  const appendLog = useCallback((line) => {
    setState((prev) => ({
      ...prev,
      run: {
        ...prev.run,
        logs: [...prev.run.logs.slice(-499), {
          ts: Date.now(),
          line: String(line ?? ""),
        }],
      },
    }));
  }, []);

  const addRun = useCallback((record) => {
    setState((prev) => ({
      ...prev,
      runs: [record, ...prev.runs].slice(0, 50),
    }));
  }, []);

  const patchRun = useCallback((runId, changes) => {
    setState((prev) => ({
      ...prev,
      runs: prev.runs.map((r) => (r.id === runId ? { ...r, ...changes } : r)),
    }));
  }, []);

  const markSaved = useCallback(() => {
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, dirty: false, lastSavedAt: Date.now() },
    }));
  }, []);

  const resetAll = useCallback(() => {
    const fresh = structuredClone(INITIAL_NOTEBOOK_STATE);
    setState(fresh);
    writeStored(fresh);
  }, []);

  const api = useMemo(
    () => ({
      state,
      patchBlock,
      setBlockStatus,
      toggleBlock,
      setAgentOutput,
      patchUi,
      appendLog,
      addRun,
      patchRun,
      markSaved,
      resetAll,
    }),
    [
      state,
      patchBlock,
      setBlockStatus,
      toggleBlock,
      setAgentOutput,
      patchUi,
      appendLog,
      addRun,
      patchRun,
      markSaved,
      resetAll,
    ]
  );

  return api;
}

/** Timestamp formatter used across the canvas (Run history, status chips). */
export function formatRelative(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "방금 전";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return new Date(ts).toLocaleString();
}

export function formatElapsed(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}
