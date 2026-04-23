/**
 * ExperimentPageV2
 * -------------------------------------------------------------
 * Forced rebuild of the APS Experiment page as a Colab/Jupyter-style
 * notebook workspace.
 *
 * Layout (desktop):
 *   +--------------------------- top bar -----------------------------+
 *   |                                                                 |
 *   +--------+-------------------------------+------------------------+
 *   | LEFT   |  CENTER notebook workspace    |  RIGHT analysis sidebar|
 *   | (280)  |  (dominant, flex 1fr)         |  (360)                 |
 *   +--------+-------------------------------+------------------------+
 *   |                  BOTTOM activity timeline                        |
 *   +----------------------------------------------------------------+
 *
 * - The legacy Experiment UI is kept in the codebase via
 *   `./ExperimentPageLegacy.jsx` (not routed anymore).
 * - This page does NOT import or reuse any piece of the legacy visual
 *   shell (`ExperimentWorkbenchLayout`, `ExperimentCanvas`, etc.).
 *   It only reuses pure API/logic modules (`notebookApi`, `notebookBridge`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./experimentV2.css";

import LeftAgentSidebar from "./LeftAgentSidebar.jsx";
import CenterNotebookWorkspace from "./CenterNotebookWorkspace.jsx";
import RightAnalysisSidebar from "./RightAnalysisSidebar.jsx";
import BottomTracePanel from "./BottomTracePanel.jsx";
import {
  useExperimentV2State,
  formatRelative,
  LAYOUT_LIMITS,
  clampLeftWidth,
  clampRightWidth,
  clampTraceHeight,
} from "./useExperimentV2State.js";
import { gatewayHealth, safeCall } from "../../api/notebookApi.js";
import { setTimelineSink } from "../../components/experiment/canvas/notebookBridge.js";

export default function ExperimentPageV2({ onLeaveExperiment } = {}) {
  const controller = useExperimentV2State();
  const { state, patch, markSaved, appendTimeline, appendChat } = controller;

  const [gatewayStatus, setGatewayStatus] = useState(null);
  const [showFullChat, setShowFullChat] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);

  /* Bridge the shared `writeTimeline` sink to this page's state so any
     legacy/shared component (Inspector, etc.) keeps working. */
  useEffect(() => {
    setTimelineSink(appendTimeline);
    return () => setTimelineSink(null);
  }, [appendTimeline]);

  /* Check gateway status once. */
  useEffect(() => {
    let abort = false;
    (async () => {
      const res = await safeCall(() => gatewayHealth());
      if (!abort) setGatewayStatus(res.ok ? res.data : null);
    })();
    return () => {
      abort = true;
    };
  }, []);

  /* Save handler. */
  const handleSave = useCallback(() => {
    markSaved();
    appendTimeline({
      actor: "user",
      type: "save",
      summary: "노트북 저장",
      status: "ok",
    });
  }, [markSaved, appendTimeline]);

  /* Quick actions from left sidebar — seed prompt cells and run. */
  const handleQuickAction = useCallback(
    async (id) => {
      const presets = {
        load: {
          title: "데이터 로드 지침",
          prompt:
            "현재 프로젝트 데이터셋 구조를 설명하고, pandas 로드 코드 초안을 작성해 주세요.",
          agent: "data",
        },
        preprocess: {
          title: "전처리 제안",
          prompt:
            "결측치, 이상치, 범주형 인코딩, 스케일링 관점에서 전처리 파이프라인 단계를 제안해 주세요.",
          agent: "data",
        },
        recommend: {
          title: "모델 추천",
          prompt:
            "이 문제(분류/회귀 여부 추정 포함)에 적합한 후보 모델 3가지를 근거와 함께 추천해 주세요.",
          agent: "model",
        },
        explain: {
          title: "결과 해설",
          prompt:
            "최근 실행 결과의 핵심 지표와 리스크, 다음 개선 아이디어 3가지를 요약해 주세요.",
          agent: "report",
        },
        report: {
          title: "리포트 초안",
          prompt:
            "본 실험 세션을 경영진 대상으로 1페이지 요약 리포트로 작성해 주세요.",
          agent: "report",
        },
      };
      const p = presets[id];
      if (!p) return;
      const newId = controller.addCell("prompt");
      controller.patchCell(newId, { title: p.title, content: p.prompt });
      patch({ agent: p.agent });
    },
    [controller, patch]
  );

  /* Jump to a cell from timeline / bridge. */
  const jumpToCell = useCallback(
    (cellId) => {
      controller.setActiveCell(cellId);
      setTimeout(() => {
        const el = document.querySelector(
          `[data-expv2-cell-id="${cellId}"]`
        );
        if (el && "scrollIntoView" in el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    },
    [controller]
  );

  const handleExport = useCallback(
    (kind) => {
      const safeNb = {
        title: state.notebookTitle,
        cells: state.cells.map((c) => ({
          id: c.id,
          type: c.type,
          title: c.title,
          content: c.content,
          status: c.status,
          output: c.output,
          updatedAt: c.updatedAt,
        })),
        savedAt: Date.now(),
        version: "experiment-v2",
      };
      const download = (filename, blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      };

      if (kind === "json") {
        download(
          `${slug(state.notebookTitle)}.experiment.json`,
          new Blob([JSON.stringify(safeNb, null, 2)], {
            type: "application/json",
          })
        );
      } else if (kind === "markdown") {
        const md = toMarkdown(safeNb);
        download(
          `${slug(state.notebookTitle)}.md`,
          new Blob([md], { type: "text/markdown" })
        );
      } else if (kind === "copy") {
        const compact = state.cells
          .map(
            (c) =>
              `### ${c.title} (${c.type})\n${
                c.content || ""
              }\n\n출력: ${safeStr(c.output?.data)}`
          )
          .join("\n\n---\n\n");
        navigator.clipboard?.writeText(compact);
      }
      appendTimeline({
        actor: "user",
        type: "export",
        summary: `노트북 내보내기: ${kind}`,
        status: "ok",
      });
    },
    [state, appendTimeline]
  );

  /* --- Layout class hooks --- */
  const mainClass = useMemo(() => {
    const base = "expv2-main expv2-main--resizable";
    if (state.leftSidebarCollapsed && state.rightSidebarCollapsed)
      return `${base} expv2-main--both-collapsed`;
    if (state.leftSidebarCollapsed) return `${base} expv2-main--left-collapsed`;
    if (state.rightSidebarCollapsed)
      return `${base} expv2-main--right-collapsed`;
    return base;
  }, [state.leftSidebarCollapsed, state.rightSidebarCollapsed]);

  /* Grid-template-columns 를 사용자 조정 폭으로 조립.
     접힌 사이드바는 44px 고정(아이콘 전용), 펼쳐진 경우 state.leftWidth / rightWidth
     를 반영한다. gutter(6px)는 좌/우 패널이 펼쳐진 경우에만 노출해 드래그 가능.
     접힌 쪽의 gutter는 폭 0으로 줄여 클릭 영역을 없앤다. */
  const mainStyle = useMemo(() => {
    const leftCol = state.leftSidebarCollapsed ? "44px" : `${state.leftWidth}px`;
    const rightCol = state.rightSidebarCollapsed
      ? "44px"
      : `${state.rightWidth}px`;
    const leftGutter = state.leftSidebarCollapsed ? "0px" : "6px";
    const rightGutter = state.rightSidebarCollapsed ? "0px" : "6px";
    return {
      gridTemplateColumns: `${leftCol} ${leftGutter} minmax(0, 1fr) ${rightGutter} ${rightCol}`,
    };
  }, [
    state.leftSidebarCollapsed,
    state.rightSidebarCollapsed,
    state.leftWidth,
    state.rightWidth,
  ]);

  /* Pointer-drag resizer: 좌/우 패널 폭, 하단 타임라인 높이에 공통 적용.
     onChange는 raw px 를 받아 state를 업데이트한다(호출부에서 clamp). */
  const resizingRef = useRef(null);
  useEffect(() => {
    function handleMove(e) {
      const r = resizingRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;
      r.onChange({ dx, dy, startValue: r.startValue, event: e });
    }
    function handleUp() {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      document.body.classList.remove("expv2-resizing");
      document.body.style.removeProperty("cursor");
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, []);

  const beginColumnDrag = useCallback(
    (side) => (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startValue = side === "left" ? state.leftWidth : state.rightWidth;
      resizingRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startValue,
        onChange: ({ dx }) => {
          if (side === "left") {
            const next = clampLeftWidth(startValue + dx);
            patch({ leftWidth: next });
          } else {
            /* 오른쪽 패널은 드래그 방향이 반대 — 오른쪽으로 끌면 좁아진다. */
            const next = clampRightWidth(startValue - dx);
            patch({ rightWidth: next });
          }
        },
      };
      document.body.classList.add("expv2-resizing");
      document.body.style.cursor = "col-resize";
    },
    [state.leftWidth, state.rightWidth, patch]
  );

  const beginTraceDrag = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startValue = state.traceHeight;
      resizingRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startValue,
        onChange: ({ dy }) => {
          /* 위로 끌면 타임라인이 커진다. */
          const next = clampTraceHeight(startValue - dy);
          patch({ traceHeight: next });
        },
      };
      document.body.classList.add("expv2-resizing");
      document.body.style.cursor = "row-resize";
    },
    [state.traceHeight, patch]
  );

  const resetLayout = useCallback(() => {
    patch({
      leftWidth: LAYOUT_LIMITS.leftDefault,
      rightWidth: LAYOUT_LIMITS.rightDefault,
      traceHeight: LAYOUT_LIMITS.traceDefault,
    });
  }, [patch]);

  return (
    <div className="expv2" role="application" aria-label="Experiment V2 Notebook">
      {/* TOP BAR */}
      <header className="expv2-top">
        <div className="expv2-top__title">
          <span className="expv2-top__title-icon" aria-hidden="true">
            🧪
          </span>
          <span
            className="expv2-top__title-input"
            style={{ border: "none", background: "transparent" }}
          >
            APS · Experiment
          </span>
          <span className="expv2-top__meta">
            <span>Notebook v2</span>
            <span>·</span>
            <span>
              {state.dirty
                ? "미저장"
                : state.savedAt
                ? `저장됨 ${formatRelative(state.savedAt)}`
                : "새 세션"}
            </span>
          </span>
        </div>
        <div className="expv2-top__spacer" />
        <div className="expv2-top__actions">
          {onLeaveExperiment ? (
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost"
              onClick={onLeaveExperiment}
              title="대시보드로 돌아가기"
            >
              ← 대시보드
            </button>
          ) : null}
          <button
            type="button"
            className="expv2-btn"
            onClick={() =>
              patch({
                leftSidebarCollapsed: !state.leftSidebarCollapsed,
              })
            }
            title="왼쪽 사이드바 토글"
          >
            {state.leftSidebarCollapsed ? "Left ▸" : "◂ Left"}
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() =>
              patch({
                rightSidebarCollapsed: !state.rightSidebarCollapsed,
              })
            }
            title="오른쪽 사이드바 토글"
          >
            {state.rightSidebarCollapsed ? "◂ Right" : "Right ▸"}
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() =>
              patch({
                bottomPanelMode:
                  state.bottomPanelMode === "hidden" ? "timeline" : "hidden",
              })
            }
            title="타임라인 토글"
          >
            {state.bottomPanelMode === "hidden" ? "Timeline ▴" : "Timeline ▾"}
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--primary"
            onClick={handleSave}
          >
            저장
          </button>
        </div>
      </header>

      {/* MAIN 3-COLUMN (폭 조정 가능) */}
      <div className={mainClass} style={mainStyle}>
        <LeftAgentSidebar
          state={state}
          collapsed={state.leftSidebarCollapsed}
          onToggleCollapse={() =>
            patch({ leftSidebarCollapsed: !state.leftSidebarCollapsed })
          }
          onChangeAgent={(a) => patch({ agent: a })}
          onChangeProvider={(p) => patch({ provider: p })}
          onToggleRag={(v) => patch({ useRag: v })}
          onOpenFullChat={() => setShowFullChat(true)}
          onQuickAction={handleQuickAction}
          gatewayStatus={gatewayStatus}
        />

        {state.leftSidebarCollapsed ? (
          <div className="expv2-gutter expv2-gutter--disabled" aria-hidden="true" />
        ) : (
          <div
            className="expv2-gutter expv2-gutter--col"
            role="separator"
            aria-orientation="vertical"
            aria-label="AI Assist 창 폭 조정"
            onPointerDown={beginColumnDrag("left")}
            onDoubleClick={resetLayout}
            title="드래그로 폭 조정 · 더블클릭으로 기본값 복원"
          />
        )}

        <CenterNotebookWorkspace
          state={state}
          controller={controller}
          onSave={handleSave}
        />

        {state.rightSidebarCollapsed ? (
          <div className="expv2-gutter expv2-gutter--disabled" aria-hidden="true" />
        ) : (
          <div
            className="expv2-gutter expv2-gutter--col"
            role="separator"
            aria-orientation="vertical"
            aria-label="Inspector 창 폭 조정"
            onPointerDown={beginColumnDrag("right")}
            onDoubleClick={resetLayout}
            title="드래그로 폭 조정 · 더블클릭으로 기본값 복원"
          />
        )}

        <RightAnalysisSidebar
          state={state}
          collapsed={state.rightSidebarCollapsed}
          onToggleCollapse={() =>
            patch({ rightSidebarCollapsed: !state.rightSidebarCollapsed })
          }
          onChangeTab={(t) => patch({ rightPanelTab: t })}
          onExport={handleExport}
        />
      </div>

      {/* BOTTOM TRACE (높이 조정 가능) */}
      <BottomTracePanel
        state={state}
        collapsed={state.bottomPanelMode === "hidden"}
        onToggleCollapse={() =>
          patch({
            bottomPanelMode:
              state.bottomPanelMode === "hidden" ? "timeline" : "hidden",
          })
        }
        onClear={() => controller.clearTimeline()}
        onJumpToCell={jumpToCell}
        onOpenConversation={() => setShowFullChat(true)}
        onOpenPrompts={() => setShowPrompts(true)}
        onBeginResize={beginTraceDrag}
        onResetLayout={resetLayout}
      />

      {showFullChat ? (
        <HistoryModal
          title="전체 대화 기록"
          onClose={() => setShowFullChat(false)}
          items={state.fullConversation}
          empty="아직 대화가 없습니다."
        />
      ) : null}

      {showPrompts ? (
        <HistoryModal
          title="프롬프트 기록"
          onClose={() => setShowPrompts(false)}
          items={state.fullConversation.filter((m) => m.role === "user")}
          empty="아직 프롬프트가 없습니다."
        />
      ) : null}
    </div>
  );
}

/* ------------------- Modal ------------------- */

function HistoryModal({ title, items, empty, onClose }) {
  return (
    <div
      className="expv2 expv2-modal"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="expv2-modal__panel" onClick={(e) => e.stopPropagation()}>
        <header className="expv2-modal__head">
          <span className="expv2-modal__title">{title}</span>
          <button
            type="button"
            className="expv2-btn expv2-btn--ghost expv2-btn--icon"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕
          </button>
        </header>
        <div className="expv2-modal__body">
          {items.length === 0 ? (
            <div className="expv2-empty">{empty}</div>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "expv2-msg expv2-msg--user"
                    : m.role === "agent"
                    ? "expv2-msg expv2-msg--agent"
                    : "expv2-msg"
                }
              >
                <div className="expv2-msg__head">
                  {m.role} · {new Date(m.time).toLocaleString()}
                </div>
                <div>
                  {typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content, null, 2)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------- helpers ------------------- */

function slug(s) {
  return (
    String(s || "notebook")
      .toLowerCase()
      .replace(/[^a-z0-9\u3131-\uD79D]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "notebook"
  );
}

function safeStr(v) {
  if (v == null) return "(없음)";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function toMarkdown(nb) {
  const lines = [`# ${nb.title || "Experiment"}`, ""];
  for (const c of nb.cells) {
    lines.push(`## ${c.title} — _${c.type}_`);
    if (c.type === "markdown") {
      lines.push(c.content || "");
    } else if (c.type === "code" || c.type === "sql") {
      lines.push("```" + (c.type === "sql" ? "sql" : "python"));
      lines.push(c.content || "");
      lines.push("```");
    } else {
      lines.push("> " + (c.content || "").split("\n").join("\n> "));
    }
    if (c.output?.data) {
      lines.push("", "**Output**", "");
      lines.push("```");
      lines.push(
        typeof c.output.data === "string"
          ? c.output.data
          : JSON.stringify(c.output.data, null, 2)
      );
      lines.push("```");
    }
    lines.push("");
  }
  return lines.join("\n");
}
