import { Children, useCallback, useEffect, useState } from "react";
import ExperimentResultsPanel from "./ExperimentResultsPanel.jsx";
import {
  AI_PROVIDER_OPTIONS,
  readStoredAiProvider,
  writeStoredAiProvider,
} from "../../api/aiProviderPref.js";

/** 리사이저 한계·기본값 (모두 px). Cursor처럼 사용자 조정 후 영속화한다. */
const SIDEBAR_W_KEY = "ailab_exp_sidebar_w";
const RESULTS_W_KEY = "ailab_exp_results_w";
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 340;
const RESULTS_MIN = 220;
const RESULTS_MAX = 640;
const RESULTS_DEFAULT = 340;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function readStoredWidth(key, dflt, min, max) {
  if (typeof window === "undefined") return dflt;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return dflt;
    const n = Number(raw);
    if (!Number.isFinite(n)) return dflt;
    return clamp(Math.round(n), min, max);
  } catch {
    return dflt;
  }
}

function writeStoredWidth(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * 3열(+리사이즈 핸들) 레이아웃:
 *   좌(AI Agent 대화창) · 중앙(단계별 실행 폼) · 우(산출물)
 * 데스크톱(>=1100px)에서 좌/우 패널 경계를 마우스로 드래그하여 폭을 조정할 수 있다.
 *
 * children으로 [<좌: AiChatPage/>, <중앙: 실행 스테이지 div/>] 2개를 순서대로 전달받는다.
 */
export default function ExperimentWorkbenchLayout({
  sidebarCollapsed,
  onSidebarCollapsedChange,
  resultsPanelProps,
  collapsedRail,
  children,
}) {
  const childArr = Children.toArray(children);
  const leftPanel = childArr[0] ?? null;
  const centerPanel = childArr[1] ?? null;

  // AI Agent 모델 선택 (AiChatPage와 localStorage + 커스텀 이벤트로 동기화)
  const [aiProvider, setAiProviderState] = useState(() => readStoredAiProvider());
  useEffect(() => {
    const sync = () => setAiProviderState(readStoredAiProvider());
    window.addEventListener("ailab-ai-provider-change", sync);
    return () => window.removeEventListener("ailab-ai-provider-change", sync);
  }, []);
  const handleAiProviderChange = useCallback((e) => {
    const v = e.target.value;
    setAiProviderState(v);
    writeStoredAiProvider(v);
  }, []);
  const resultsCollapsed = !!resultsPanelProps?.resultsCollapsed;
  const sidebarActuallyCollapsed = !!sidebarCollapsed;

  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readStoredWidth(SIDEBAR_W_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX)
  );
  const [resultsWidth, setResultsWidth] = useState(() =>
    readStoredWidth(RESULTS_W_KEY, RESULTS_DEFAULT, RESULTS_MIN, RESULTS_MAX)
  );

  useEffect(() => {
    writeStoredWidth(SIDEBAR_W_KEY, sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    writeStoredWidth(RESULTS_W_KEY, resultsWidth);
  }, [resultsWidth]);

  /** pointer 기반 드래그: setPointerCapture로 윈도우 밖 이탈에도 안정적으로 동작한다. */
  const handlePointerDown = useCallback(
    (side) => (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handleEl = e.currentTarget;
      const startX = e.clientX;
      const startWidth = side === "left" ? sidebarWidth : resultsWidth;

      try {
        handleEl.setPointerCapture(e.pointerId);
      } catch {
        /* ignore older browsers */
      }

      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (side === "left") {
          setSidebarWidth(clamp(startWidth + dx, SIDEBAR_MIN, SIDEBAR_MAX));
        } else {
          // 우측 핸들은 오른쪽으로 드래그하면 산출물 패널이 좁아지도록 부호 반전
          setResultsWidth(clamp(startWidth - dx, RESULTS_MIN, RESULTS_MAX));
        }
      };

      const cleanup = (ev) => {
        try {
          if (ev && typeof ev.pointerId === "number") {
            handleEl.releasePointerCapture(ev.pointerId);
          }
        } catch {
          /* ignore */
        }
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeEventListener("pointerup", cleanup);
        handleEl.removeEventListener("pointercancel", cleanup);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
      };

      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", cleanup);
      handleEl.addEventListener("pointercancel", cleanup);
    },
    [sidebarWidth, resultsWidth]
  );

  const resetSidebarWidth = useCallback(
    () => setSidebarWidth(SIDEBAR_DEFAULT),
    []
  );
  const resetResultsWidth = useCallback(
    () => setResultsWidth(RESULTS_DEFAULT),
    []
  );

  const handleKeyDown = useCallback(
    (side) => (e) => {
      let delta = 0;
      if (e.key === "ArrowLeft") delta = e.shiftKey ? -40 : -10;
      else if (e.key === "ArrowRight") delta = e.shiftKey ? 40 : 10;
      else if (e.key === "Home") {
        if (side === "left") resetSidebarWidth();
        else resetResultsWidth();
        e.preventDefault();
        return;
      } else {
        return;
      }
      e.preventDefault();
      if (side === "left") {
        setSidebarWidth((v) => clamp(v + delta, SIDEBAR_MIN, SIDEBAR_MAX));
      } else {
        setResultsWidth((v) => clamp(v - delta, RESULTS_MIN, RESULTS_MAX));
      }
    },
    [resetSidebarWidth, resetResultsWidth]
  );

  // 접힌 상태 폭: Phase 2b 스펙에 따라 좌측 sidebar rail 72px, 산출물 48px.
  // (.experiment-left-panel--collapsed 내부 CSS와 일치시킴)
  const gridStyle = {
    "--exp-sidebar-w": `${sidebarActuallyCollapsed ? 72 : sidebarWidth}px`,
    "--exp-results-w": `${resultsCollapsed ? 48 : resultsWidth}px`,
  };

  const containerClass = [
    "experiment-workbench",
    resultsCollapsed ? "experiment-workbench--results-collapsed" : "",
    sidebarActuallyCollapsed ? "experiment-workbench--sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="experiment-workbench-root">
      <div className={containerClass} style={gridStyle}>
        <div
          className={
            sidebarActuallyCollapsed
              ? "experiment-left-panel experiment-left-panel--collapsed"
              : "experiment-left-panel"
          }
          aria-label="AI Agent 대화창"
        >
          <div className="experiment-left-panel-header">
            <span className="experiment-left-panel-title">AI Agent</span>
            {!sidebarActuallyCollapsed && (
              <label
                className="experiment-left-panel-provider"
                title="AI 모델(백엔드) 선택"
              >
                <span className="experiment-left-panel-provider-label">모델</span>
                <select
                  className="experiment-left-panel-provider-select"
                  value={aiProvider}
                  onChange={handleAiProviderChange}
                  aria-label="AI 모델 선택"
                >
                  {AI_PROVIDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="experiment-left-panel-collapse-btn"
              onClick={() =>
                onSidebarCollapsedChange?.(!sidebarCollapsed)
              }
              title={sidebarActuallyCollapsed ? "펼치기" : "접기"}
              aria-label={sidebarActuallyCollapsed ? "펼치기" : "접기"}
            >
              {sidebarActuallyCollapsed ? "›" : "‹"}
            </button>
          </div>
          {!sidebarActuallyCollapsed && (
            <div className="experiment-left-panel-body">{leftPanel}</div>
          )}
          {sidebarActuallyCollapsed && collapsedRail && (
            <div className="experiment-left-panel-rail" aria-label="빠른 단계 이동">
              {collapsedRail}
            </div>
          )}
        </div>
        <div
          className="experiment-resize-handle experiment-resize-handle--left"
          role="separator"
          aria-orientation="vertical"
          aria-label="AI Agent 패널 폭 조정 (←/→ 키로 조정, Home으로 초기화)"
          aria-valuenow={sidebarActuallyCollapsed ? 52 : sidebarWidth}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={sidebarActuallyCollapsed ? -1 : 0}
          onPointerDown={
            sidebarActuallyCollapsed ? undefined : handlePointerDown("left")
          }
          onDoubleClick={sidebarActuallyCollapsed ? undefined : resetSidebarWidth}
          onKeyDown={sidebarActuallyCollapsed ? undefined : handleKeyDown("left")}
          title="드래그하여 폭 조정 · 더블클릭으로 초기화"
        />
        <div className="experiment-workbench-center">{centerPanel}</div>
        <div
          className="experiment-resize-handle experiment-resize-handle--right"
          role="separator"
          aria-orientation="vertical"
          aria-label="산출물 패널 폭 조정 (←/→ 키로 조정, Home으로 초기화)"
          aria-valuenow={resultsCollapsed ? 52 : resultsWidth}
          aria-valuemin={RESULTS_MIN}
          aria-valuemax={RESULTS_MAX}
          tabIndex={resultsCollapsed ? -1 : 0}
          onPointerDown={
            resultsCollapsed ? undefined : handlePointerDown("right")
          }
          onDoubleClick={resultsCollapsed ? undefined : resetResultsWidth}
          onKeyDown={resultsCollapsed ? undefined : handleKeyDown("right")}
          title="드래그하여 폭 조정 · 더블클릭으로 초기화"
        />
        <ExperimentResultsPanel {...resultsPanelProps} />
      </div>
      <div
        className="experiment-mobile-jump"
        role="navigation"
        aria-label="패널로 이동"
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            document
              .querySelector(".experiment-left-panel")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          AI Agent
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            document
              .querySelector(".experiment-results")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          산출물
        </button>
      </div>
    </div>
  );
}
