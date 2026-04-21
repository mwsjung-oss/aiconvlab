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
import { gatewayHealth, safeCall } from "../../../api/notebookApi.js";

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

  // Autosave → lastSavedAt is updated inside the store on every mutation via
  // `patchBlock`. We surface a Save button purely for user affordance; clicking
  // it just flushes the `dirty` flag.
  const save = () => {
    markSaved();
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
  };

  const scrollToBlock = (id) => {
    const el = document.getElementById(`block-${id}`);
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
        </div>
      </div>

      <KnowledgeDrawer
        open={state.ui.knowledgeOpen}
        onClose={() => patchUi({ knowledgeOpen: false })}
        provider={state.ui.provider}
      />
    </div>
  );
}

const STAGES = [
  { key: "problem", label: "문제" },
  { key: "data", label: "데이터" },
  { key: "model", label: "설계" },
  { key: "run", label: "실행" },
  { key: "compare", label: "비교" },
  { key: "report", label: "리포트" },
];
