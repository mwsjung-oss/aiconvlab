/**
 * ExperimentCanvas — the notebook-style center stage.
 *
 * Composition:
 *   - Sticky toolbar (provider/RAG toggles, save/run/compare/export, knowledge)
 *   - Scrollable column of 6 step blocks (Problem → Data → Model → Run → Compare → Report)
 *   - Inline run history summary (last 5) + execution console
 *   - Floating KnowledgeDrawer panel
 *
 * Canvas is fully self-contained: backend-facing calls go through
 * `src/api/notebookApi.js` (so no prop drilling to App.jsx is required).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./canvas.css";
import { useNotebookState, formatRelative } from "./useNotebookState.js";
import { NButton, Chip } from "./primitives.jsx";
import ProblemDefinitionBlock from "./blocks/ProblemDefinitionBlock.jsx";
import DataCheckBlock from "./blocks/DataCheckBlock.jsx";
import ModelDesignBlock from "./blocks/ModelDesignBlock.jsx";
import RunEvaluateBlock from "./blocks/RunEvaluateBlock.jsx";
import CompareImproveBlock from "./blocks/CompareImproveBlock.jsx";
import ReportExportBlock from "./blocks/ReportExportBlock.jsx";
import RunHistoryList from "./RunHistoryList.jsx";
import KnowledgeDrawer from "./KnowledgeDrawer.jsx";
import ActivityTimeline from "./ActivityTimeline.jsx";
import DynamicCellList from "./DynamicCellList.jsx";
import { gatewayHealth, safeCall } from "../../../api/notebookApi.js";
import { setTimelineSink } from "./notebookBridge.js";

export default function ExperimentCanvas({
  projectName = "",
  datasetOptions = [],
  onExitNotebook,
}) {
  const {
    state,
    patchBlock,
    toggleBlock,
    patchUi,
    appendLog,
    addRun,
    patchRun,
    markSaved,
    resetAll,
    appendTimeline,
    clearTimeline,
    addCell,
    patchCell,
    removeCell,
    moveCell,
  } = useNotebookState();

  const [activeBlock, setActiveBlock] = useState("problem");
  const [gatewayStatus, setGatewayStatus] = useState(null);
  const scrollRef = useRef(null);

  // Fetch gateway health once so the toolbar can show OpenAI/Gemini key flags.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const r = await safeCall(() => gatewayHealth());
      if (mounted && r.ok) setGatewayStatus(r.data);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Install the shared timeline sink so ContextualAIAssist (embedded in every
  // block) can emit structured events without prop-drilling.
  useEffect(() => {
    setTimelineSink(appendTimeline);
    return () => setTimelineSink(null);
  }, [appendTimeline]);

  // Autosave → lastSavedAt is updated inside the store on every mutation via
  // `patchBlock`. We surface a Save button purely for user affordance; clicking
  // it just flushes the `dirty` flag.
  const save = () => {
    markSaved();
    appendTimeline({
      actor: "user",
      eventType: "save",
      summary: "노트북 변경 사항 저장",
      status: "ok",
    });
  };

  const exportNotebook = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), projectName, state },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aps-notebook-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    appendTimeline({
      actor: "user",
      eventType: "export",
      summary: `노트북 JSON 내보내기 (${state.runs.length} runs)`,
      status: "ok",
    });
  };

  const scrollToBlock = (id) => {
    const el = document.getElementById(`block-${id}`);
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /**
   * Quick action dispatcher — binds the top-of-canvas quick buttons to their
   * corresponding step block + scroll target. Each invocation also records a
   * structured timeline event for replay/audit.
   */
  const runQuickAction = (actionId) => {
    const map = {
      load_data: { block: "data", label: "데이터 로드/검토" },
      suggest_preprocess: { block: "data", label: "전처리 제안" },
      recommend_model: { block: "model", label: "모델 추천" },
      explain_result: { block: "run", label: "결과 해설" },
      draft_report: { block: "report", label: "리포트 초안" },
    };
    const entry = map[actionId];
    if (!entry) return;
    scrollToBlock(entry.block);
    setActiveBlock(entry.block);
    if (!state[entry.block]?.expanded) toggleBlock(entry.block);
    appendTimeline({
      actor: "user",
      eventType: "request",
      summary: `Quick action · ${entry.label}`,
      status: "info",
      ref: { blockKey: entry.block },
    });
  };

  const gatewayChip = useMemo(() => {
    if (!gatewayStatus) return <Chip kind="info">게이트웨이 확인 중</Chip>;
    const o = gatewayStatus.openai_configured;
    const g = gatewayStatus.gemini_configured;
    if (o && g) return <Chip kind="ok">OpenAI · Gemini 준비됨</Chip>;
    if (o) return <Chip kind="info">OpenAI 준비됨</Chip>;
    if (g) return <Chip kind="info">Gemini 준비됨</Chip>;
    return <Chip kind="warn">API 키 미구성</Chip>;
  }, [gatewayStatus]);

  return (
    <div className="notebook-canvas" aria-label="Experiment notebook canvas">
      <header className="notebook-canvas__toolbar">
        <span className="notebook-canvas__toolbar-title">
          🧪 Experiment Notebook
          {projectName ? ` · ${projectName}` : ""}
        </span>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--nc-text-secondary)",
          }}
        >
          <span>Provider</span>
          <select
            value={state.ui.provider}
            onChange={(e) => patchUi({ provider: e.target.value })}
            style={{
              background: "var(--nc-elevated)",
              border: "1px solid var(--nc-border)",
              color: "var(--nc-text)",
              borderRadius: 6,
              padding: "3px 6px",
              fontSize: 12,
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </label>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--nc-text-secondary)",
          }}
          title="Dynamic 셀 · Quick action에서 기본으로 사용할 에이전트"
        >
          <span>Agent</span>
          <select
            value={state.ui.activeAgent}
            onChange={(e) => patchUi({ activeAgent: e.target.value })}
            style={{
              background: "var(--nc-elevated)",
              border: "1px solid var(--nc-border)",
              color: "var(--nc-text)",
              borderRadius: 6,
              padding: "3px 6px",
              fontSize: 12,
            }}
          >
            <option value="smart">Smart (RAG)</option>
            <option value="data">Data Agent</option>
            <option value="model">Model Agent</option>
            <option value="report">Report Agent</option>
            <option value="general">General Assistant</option>
          </select>
        </label>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--nc-text-secondary)",
          }}
          title="모든 AI 액션이 지식베이스를 참조합니다."
        >
          <input
            type="checkbox"
            checked={state.ui.useRag}
            onChange={(e) => patchUi({ useRag: e.target.checked })}
          />
          RAG 사용
        </label>

        {gatewayChip}

        {state.ui.dirty ? (
          <span className="notebook-dirty" title="저장되지 않은 변경">
            변경 사항 있음
          </span>
        ) : state.ui.lastSavedAt ? (
          <span
            style={{ fontSize: 11, color: "var(--nc-muted)" }}
            title={new Date(state.ui.lastSavedAt).toLocaleString()}
          >
            저장됨 · {formatRelative(state.ui.lastSavedAt)}
          </span>
        ) : null}

        <span className="notebook-canvas__toolbar-spacer" />

        <NButton icon="💾" onClick={save} title="변경 사항 플러시">
          Save
        </NButton>
        <NButton
          icon="▶"
          variant="primary"
          onClick={() => {
            scrollToBlock("run");
            setActiveBlock("run");
          }}
        >
          Run
        </NButton>
        <NButton
          icon="🔀"
          onClick={() => {
            scrollToBlock("compare");
            setActiveBlock("compare");
          }}
        >
          Compare
        </NButton>
        <NButton icon="⬇" onClick={exportNotebook}>
          Export
        </NButton>
        <NButton
          icon="📚"
          onClick={() => patchUi({ knowledgeOpen: !state.ui.knowledgeOpen })}
          title="지식베이스(RAG) 열기"
        >
          Knowledge
        </NButton>
        <NButton
          icon="🤖"
          onClick={() => patchUi({ aiSidebarFlash: Date.now() })}
          title="좌측 AI Agent 패널로 이동"
        >
          AI
        </NButton>
        {onExitNotebook ? (
          <NButton
            icon="↩"
            variant="ghost"
            onClick={onExitNotebook}
            title="페이지 모드로 돌아가기"
          >
            Pages
          </NButton>
        ) : null}
      </header>

      {/* Stage navigation chips */}
      <nav
        aria-label="단계 바로가기"
        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        {STAGES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className="notebook-canvas__btn"
            style={
              activeBlock === s.key
                ? {
                    background: "rgba(37, 99, 235, 0.15)",
                    borderColor: "var(--nc-primary)",
                    color: "#bfdbfe",
                  }
                : undefined
            }
            onClick={() => {
              setActiveBlock(s.key);
              scrollToBlock(s.key);
            }}
          >
            <span style={{ color: "var(--nc-muted)", marginRight: 6 }}>
              {i + 1}
            </span>
            {s.label}
          </button>
        ))}
      </nav>

      {/* Quick Actions — most common worker-centered shortcuts. */}
      <div className="notebook-quickbar" aria-label="빠른 작업">
        <span className="notebook-quickbar__label">빠른 작업</span>
        {QUICK_ACTIONS.map((q) => (
          <button
            key={q.id}
            type="button"
            className="notebook-quickbar__btn"
            title={q.hint}
            onClick={() => runQuickAction(q.id)}
          >
            <span aria-hidden="true">{q.icon}</span> {q.label}
          </button>
        ))}
      </div>

      <div
        className="notebook-canvas__scroll"
        ref={scrollRef}
        aria-label="노트북 본문"
      >
        <div className="notebook-canvas__blocks">
          <ProblemDefinitionBlock
            state={state}
            patch={(c) => patchBlock("problem", c)}
            ui={state.ui}
            onToggle={() => toggleBlock("problem")}
            active={activeBlock === "problem"}
            onFocus={() => setActiveBlock("problem")}
          />
          <DataCheckBlock
            state={state}
            patch={(c) => patchBlock("data", c)}
            ui={state.ui}
            onToggle={() => toggleBlock("data")}
            active={activeBlock === "data"}
            onFocus={() => setActiveBlock("data")}
            datasetOptions={datasetOptions}
          />
          <ModelDesignBlock
            state={state}
            patch={(c) => patchBlock("model", c)}
            ui={state.ui}
            onToggle={() => toggleBlock("model")}
            active={activeBlock === "model"}
            onFocus={() => setActiveBlock("model")}
          />
          <RunEvaluateBlock
            state={state}
            patch={(c) => patchBlock("run", c)}
            ui={state.ui}
            onToggle={() => toggleBlock("run")}
            active={activeBlock === "run"}
            onFocus={() => setActiveBlock("run")}
            appendLog={appendLog}
            addRun={addRun}
            patchRun={patchRun}
          />
          <CompareImproveBlock
            state={state}
            patch={(c) => patchBlock("compare", c)}
            ui={state.ui}
            onToggle={() => toggleBlock("compare")}
            active={activeBlock === "compare"}
            onFocus={() => setActiveBlock("compare")}
            patchRun={patchRun}
          />
          <ReportExportBlock
            state={state}
            patch={(c) => patchBlock("report", c)}
            ui={state.ui}
            onToggle={() => toggleBlock("report")}
            active={activeBlock === "report"}
            onFocus={() => setActiveBlock("report")}
          />

          {/* Run history summary */}
          <section className="notebook-block">
            <header className="notebook-block__header">
              <span className="notebook-block__index" aria-hidden="true">
                ⌛
              </span>
              <div className="notebook-block__titles">
                <h3 className="notebook-block__title">Run History</h3>
                <span className="notebook-block__subtitle">
                  최근 실행 이력 · 최대 50건
                </span>
              </div>
              <div className="notebook-block__header-actions">
                <Chip kind="info">{state.runs.length} runs</Chip>
                <NButton
                  variant="ghost"
                  onClick={() => {
                    if (
                      window.confirm(
                        "노트북 상태와 Run 이력을 모두 초기화할까요?"
                      )
                    ) {
                      resetAll();
                      appendTimeline({
                        actor: "user",
                        eventType: "note",
                        summary: "노트북 전체 초기화",
                        status: "warn",
                      });
                    }
                  }}
                  title="전체 초기화"
                >
                  🗑
                </NButton>
              </div>
            </header>
            <div className="notebook-block__body">
              <RunHistoryList
                runs={state.runs}
                onSelectForCompareA={(id) =>
                  patchBlock("compare", { runA: id, expanded: true })
                }
                onSelectForCompareB={(id) =>
                  patchBlock("compare", { runB: id, expanded: true })
                }
                onMarkBest={(id) =>
                  state.runs.forEach((r) =>
                    patchRun(r.id, { isBest: r.id === id })
                  )
                }
                onEditNote={(id, note) => patchRun(id, { note })}
              />
            </div>
          </section>

          {/* Dynamic Colab-style cells (prompt/markdown/code/sql) */}
          <DynamicCellList
            cells={state.cells}
            provider={state.ui.provider}
            activeAgent={state.ui.activeAgent}
            useRag={state.ui.useRag}
            onAddCell={(type) => {
              const newId = addCell(type);
              appendTimeline({
                actor: "user",
                eventType: "note",
                summary: `${type} 셀 추가`,
                status: "info",
                ref: { cellId: newId },
              });
            }}
            onPatchCell={patchCell}
            onRemoveCell={(id) => {
              removeCell(id);
              appendTimeline({
                actor: "user",
                eventType: "note",
                summary: "셀 삭제",
                status: "warn",
                ref: { cellId: id },
              });
            }}
            onMoveCell={moveCell}
            onTimeline={appendTimeline}
          />
        </div>
      </div>

      {/* Structured activity timeline (bottom drawer). */}
      <ActivityTimeline
        open={state.ui.timelineOpen}
        timeline={state.timeline}
        onToggle={() =>
          patchUi({ timelineOpen: !state.ui.timelineOpen })
        }
        onClear={clearTimeline}
        onJumpToBlock={(blockKey) => {
          setActiveBlock(blockKey);
          scrollToBlock(blockKey);
        }}
        onOpenFullChat={() => patchUi({ aiSidebarFlash: Date.now() })}
      />

      <KnowledgeDrawer
        open={state.ui.knowledgeOpen}
        onClose={() => patchUi({ knowledgeOpen: false })}
        provider={state.ui.provider}
      />
    </div>
  );
}

const QUICK_ACTIONS = [
  { id: "load_data", icon: "📂", label: "Load Data", hint: "데이터 블록으로 이동" },
  {
    id: "suggest_preprocess",
    icon: "🧹",
    label: "Suggest Preprocessing",
    hint: "데이터 블록의 전처리 AI 액션 안내",
  },
  {
    id: "recommend_model",
    icon: "🧠",
    label: "Recommend Model",
    hint: "모델 설계 블록으로 이동",
  },
  {
    id: "explain_result",
    icon: "📊",
    label: "Explain Result",
    hint: "실행·평가 블록의 결과 해설 AI 액션",
  },
  {
    id: "draft_report",
    icon: "📝",
    label: "Draft Report",
    hint: "리포트 블록으로 이동",
  },
];

const STAGES = [
  { key: "problem", label: "문제" },
  { key: "data", label: "데이터" },
  { key: "model", label: "설계" },
  { key: "run", label: "실행" },
  { key: "compare", label: "비교" },
  { key: "report", label: "리포트" },
];
