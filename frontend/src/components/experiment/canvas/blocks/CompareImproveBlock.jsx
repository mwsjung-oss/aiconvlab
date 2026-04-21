import { useMemo } from "react";
import StepBlock from "../StepBlock.jsx";
import ContextualAIAssist from "../ContextualAIAssist.jsx";
import InlineAgentOutput from "../InlineAgentOutput.jsx";
import { Field } from "../primitives.jsx";
import { formatRelative } from "../useNotebookState.js";

export default function CompareImproveBlock({
  state,
  patch,
  ui,
  onToggle,
  active,
  onFocus,
  patchRun,
}) {
  const compare = state.compare;
  const runs = Array.isArray(state.runs) ? state.runs : [];

  const runA = useMemo(
    () => runs.find((r) => r.id === compare.runA) || runs[0] || null,
    [runs, compare.runA]
  );
  const runB = useMemo(
    () => runs.find((r) => r.id === compare.runB) || runs[1] || null,
    [runs, compare.runB]
  );

  const deltas = useMemo(() => {
    if (!runA?.metrics || !runB?.metrics) return [];
    const keys = new Set([
      ...Object.keys(runA.metrics),
      ...Object.keys(runB.metrics),
    ]);
    return Array.from(keys).map((k) => {
      const a = runA.metrics?.[k];
      const b = runB.metrics?.[k];
      const delta = typeof a === "number" && typeof b === "number" ? b - a : null;
      return { name: k, a, b, delta };
    });
  }, [runA, runB]);

  const markBest = (runId) => {
    runs.forEach((r) => patchRun(r.id, { isBest: r.id === runId }));
  };

  const actions = [
    {
      id: "explain",
      label: "성능 차이 설명",
      icon: "🧩",
      build: () => ({
        agent: "report",
        task: `두 실행의 key_findings 와 recommendations 필드에 성능 차이의 원인 가설과 검증 방법을 작성해 주세요.\n\nRun A: ${JSON.stringify({
          name: runA?.name,
          model: runA?.model,
          metrics: runA?.metrics,
        })}\nRun B: ${JSON.stringify({
          name: runB?.name,
          model: runB?.model,
          metrics: runB?.metrics,
        })}`,
      }),
    },
    {
      id: "next",
      label: "다음 실험 추천",
      icon: "🔭",
      build: () => ({
        agent: "report",
        task: `위 두 실행을 비교하여 next_experiments 필드에 3가지 실험 아이디어와 우선순위를 제안해 주세요.\nRun A: ${JSON.stringify(
          runA?.metrics
        )}\nRun B: ${JSON.stringify(runB?.metrics)}`,
      }),
    },
  ];

  return (
    <StepBlock
      id="block-compare"
      index="5"
      title="Compare & Improve · 비교·개선"
      subtitle="두 실험을 선택해 파라미터·지표를 비교하고 개선 방향을 도출합니다."
      status={runs.length >= 2 ? "in_progress" : "idle"}
      expanded={compare.expanded}
      active={active}
      onToggle={onToggle}
      onFocusBlock={onFocus}
    >
      <div className="notebook-block__row">
        <Field label="Run A" htmlFor="c-a">
          <select
            id="c-a"
            value={compare.runA}
            onChange={(e) => patch({ runA: e.target.value })}
          >
            <option value="">— 선택 —</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.model}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Run B" htmlFor="c-b">
          <select
            id="c-b"
            value={compare.runB}
            onChange={(e) => patch({ runB: e.target.value })}
          >
            <option value="">— 선택 —</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.model}
              </option>
            ))}
          </select>
        </Field>
        <Field label="비교 모드" htmlFor="c-mode">
          <select
            id="c-mode"
            value={compare.mode}
            onChange={(e) => patch({ mode: e.target.value })}
          >
            <option value="metrics">지표(metrics)</option>
            <option value="params">파라미터(params)</option>
            <option value="both">둘 다</option>
          </select>
        </Field>
      </div>

      {runA && runB ? (
        <div className="notebook-output">
          <div className="notebook-output__title">
            Metric deltas · B − A
          </div>
          <div className="notebook-output__grid">
            {deltas.length === 0 ? (
              <span className="notebook-output__empty">
                두 실행 모두 지표가 있어야 비교가 가능합니다.
              </span>
            ) : (
              deltas.map((d) => (
                <div key={d.name} className="notebook-output__kv">
                  <span className="notebook-output__kv-label">{d.name}</span>
                  <span className="notebook-output__kv-value">
                    {fmt(d.a)} → {fmt(d.b)}{" "}
                    {d.delta !== null ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: d.delta >= 0 ? "#86efac" : "#fca5a5",
                          marginLeft: 4,
                        }}
                      >
                        ({d.delta >= 0 ? "+" : ""}
                        {d.delta.toFixed(3)})
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="notebook-canvas__btn"
              onClick={() => markBest(runA.id)}
            >
              Run A 를 Best 로
            </button>
            <button
              type="button"
              className="notebook-canvas__btn"
              onClick={() => markBest(runB.id)}
            >
              Run B 를 Best 로
            </button>
          </div>
        </div>
      ) : (
        <div className="notebook-empty">
          최소 2건의 실행 이후에 비교가 활성화됩니다.
          {runs.length
            ? ` (현재 ${runs.length}건, 마지막: ${formatRelative(
                runs[0]?.startedAt
              )})`
            : ""}
        </div>
      )}

      <ContextualAIAssist
        blockKey="compare"
        actions={actions}
        provider={ui.provider}
        useRag={ui.useRag}
        onResult={(output, meta) => {
          patch({ agentOutput: output, agentMeta: meta });
        }}
      />

      {compare.agentOutput ? (
        <InlineAgentOutput output={compare.agentOutput} meta={compare.agentMeta} />
      ) : null}
    </StepBlock>
  );
}

function fmt(v) {
  if (typeof v === "number") return v.toFixed(3);
  if (v === undefined || v === null) return "—";
  return String(v);
}
