import { useCallback, useEffect, useRef } from "react";
import StepBlock from "../StepBlock.jsx";
import ContextualAIAssist from "../ContextualAIAssist.jsx";
import InlineAgentOutput from "../InlineAgentOutput.jsx";
import { Field, NButton, RunStatusChip } from "../primitives.jsx";
import { formatElapsed } from "../useNotebookState.js";
import { writeTimeline } from "../notebookBridge.js";

/**
 * Canonical run state machine. The mock run below steps through each phase
 * with a small timeout so the UI shows rich progress feedback even without
 * a real training backend wired up.
 */
const RUN_PHASES = [
  { key: "queued", label: "큐 대기", duration: 400, progress: 5 },
  { key: "loading_data", label: "데이터 로딩", duration: 700, progress: 20 },
  { key: "validating", label: "검증", duration: 500, progress: 30 },
  { key: "training", label: "학습", duration: 1600, progress: 75 },
  { key: "evaluating", label: "평가", duration: 800, progress: 90 },
  { key: "saving", label: "아티팩트 저장", duration: 400, progress: 100 },
];

function generateMetrics(problemType) {
  const rand = (min, max, digits = 3) =>
    +(Math.random() * (max - min) + min).toFixed(digits);
  if (problemType === "regression" || problemType === "forecasting") {
    return {
      MAE: rand(0.08, 0.22),
      RMSE: rand(0.12, 0.34),
      MAPE: rand(0.04, 0.12),
      R2: rand(0.78, 0.94),
    };
  }
  return {
    accuracy: rand(0.78, 0.93),
    precision: rand(0.72, 0.9),
    recall: rand(0.7, 0.92),
    f1: rand(0.74, 0.9),
    roc_auc: rand(0.82, 0.96),
  };
}

export default function RunEvaluateBlock({
  state,
  patch,
  ui,
  onToggle,
  active,
  onFocus,
  appendLog,
  addRun,
  patchRun,
}) {
  const run = state.run;
  const model = state.model;
  const problem = state.problem;
  const abortRef = useRef(null);

  const buildContext = () =>
    [
      problem.objective && `목표: ${problem.objective}`,
      model.problemType && `문제 유형: ${model.problemType}`,
      model.candidateModels && `후보 모델: ${model.candidateModels}`,
      run.metrics && `결과 지표: ${JSON.stringify(run.metrics)}`,
      run.logs?.length
        ? `최근 로그: ${run.logs.slice(-5).map((l) => l.line).join(" | ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

  const actions = [
    {
      id: "interpret",
      label: "결과 해석",
      icon: "🔬",
      build: () => ({
        agent: "report",
        task: `아래 실행 결과를 바탕으로 executive_summary / key_findings / risks 를 작성해 주세요.\n${buildContext()}`,
      }),
    },
    {
      id: "diagnose",
      label: "실패 진단",
      icon: "🩺",
      build: () => ({
        agent: "report",
        task: `다음 실행이 실패했다고 가정하고, 가능한 원인 5가지와 검증 방법을 risks / recommendations 필드에 정리해 주세요.\n${buildContext()}`,
      }),
    },
    {
      id: "nextrun",
      label: "다음 실행 제안",
      icon: "🚀",
      build: () => ({
        agent: "model",
        task: `현재 결과를 기반으로 다음 실험 1개를 recommended_models / hyperparameters / evaluation_metrics 로 제안해 주세요.\n${buildContext()}`,
      }),
    },
  ];

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.cancelled = true;
      abortRef.current = null;
    }
    patch({ status: "idle", progress: 0, currentStage: "" });
    appendLog("⏹ 사용자 요청으로 실행 취소됨");
  }, [patch, appendLog]);

  const startRun = useCallback(async () => {
    if (run.status !== "idle" && run.status !== "completed" && run.status !== "failed") {
      return;
    }
    const runId = `run-${Date.now()}`;
    const runName =
      run.runName?.trim() ||
      `Run ${new Date().toISOString().slice(5, 16).replace("T", " ")}`;

    const token = { cancelled: false };
    abortRef.current = token;

    patch({
      status: "queued",
      progress: 0,
      currentStage: "queued",
      startedAt: Date.now(),
      elapsedSec: 0,
      metrics: null,
    });
    appendLog(`▶ ${runName} 시작 (model=${model.baselineModel || "auto"})`);
    writeTimeline({
      actor: "user",
      eventType: "train",
      summary: `Run 시작: ${runName}`,
      detail: {
        model: model.baselineModel || "auto",
        dataset: state.data.datasetId || "—",
        problemType: model.problemType,
      },
      status: "info",
      ref: { blockKey: "run", runId },
    });

    addRun({
      id: runId,
      name: runName,
      startedAt: Date.now(),
      model: model.baselineModel || "auto",
      dataset: state.data.datasetId || "—",
      status: "queued",
      keyMetric: null,
      isBest: false,
      note: "",
    });

    const start = Date.now();
    for (const phase of RUN_PHASES) {
      if (token.cancelled) return;
      patch({
        status: phase.key,
        currentStage: phase.label,
        progress: phase.progress,
        elapsedSec: Math.floor((Date.now() - start) / 1000),
      });
      appendLog(`· ${phase.label} (${phase.progress}%)`);
      const phaseEventType =
        phase.key === "loading_data"
          ? "load"
          : phase.key === "validating"
            ? "preprocess"
            : phase.key === "evaluating"
              ? "evaluate"
              : "train";
      writeTimeline({
        actor: "system",
        eventType: phaseEventType,
        summary: `${phase.label} (${phase.progress}%)`,
        status: "info",
        ref: { blockKey: "run", runId },
      });
      await new Promise((r) => setTimeout(r, phase.duration));
    }

    if (token.cancelled) return;
    const metrics = generateMetrics(model.problemType);
    const keyMetricName = metrics.accuracy
      ? "accuracy"
      : metrics.f1
        ? "f1"
        : metrics.MAPE
          ? "MAPE"
          : Object.keys(metrics)[0];
    patch({
      status: "completed",
      progress: 100,
      currentStage: "completed",
      metrics,
      elapsedSec: Math.floor((Date.now() - start) / 1000),
    });
    patchRun(runId, {
      status: "completed",
      finishedAt: Date.now(),
      keyMetric: { name: keyMetricName, value: metrics[keyMetricName] },
      metrics,
    });
    appendLog(`✅ 완료 (${keyMetricName}=${metrics[keyMetricName]})`);
    writeTimeline({
      actor: "system",
      eventType: "evaluate",
      summary: `Run 완료 · ${keyMetricName}=${metrics[keyMetricName]}`,
      detail: { runName, runId, metrics },
      status: "ok",
      ref: { blockKey: "run", runId },
    });
    abortRef.current = null;
  }, [
    run.status,
    run.runName,
    patch,
    appendLog,
    addRun,
    patchRun,
    model.baselineModel,
    model.problemType,
    state.data.datasetId,
  ]);

  // elapsed ticker while running
  useEffect(() => {
    if (!run.startedAt) return undefined;
    if (["completed", "failed", "idle"].includes(run.status)) return undefined;
    const id = setInterval(() => {
      patch({
        elapsedSec: Math.floor((Date.now() - run.startedAt) / 1000),
      });
    }, 1000);
    return () => clearInterval(id);
  }, [run.startedAt, run.status, patch]);

  const isRunning = !["idle", "completed", "failed"].includes(run.status);

  return (
    <StepBlock
      id="block-run"
      index="4"
      title="Run & Evaluate · 실행·평가"
      subtitle="실험을 실행하고 실시간 진행·지표·로그를 확인합니다."
      status={
        run.status === "completed"
          ? "done"
          : run.status === "failed"
            ? "error"
            : isRunning
              ? "in_progress"
              : "idle"
      }
      expanded={run.expanded}
      active={active}
      onToggle={onToggle}
      onFocusBlock={onFocus}
      headerActions={<RunStatusChip status={run.status} />}
    >
      <div className="notebook-block__row">
        <Field label="Run 이름" htmlFor="r-name" full>
          <input
            id="r-name"
            type="text"
            placeholder="자동 생성됨. 의미 있는 이름을 입력 가능합니다."
            value={run.runName}
            onChange={(e) => patch({ runName: e.target.value })}
          />
        </Field>
        <Field label="설정 요약" htmlFor="r-summary" full>
          <textarea
            id="r-summary"
            rows={2}
            placeholder="예: XGBoost max_depth=6, n_estimators=400"
            value={run.configSummary}
            onChange={(e) => patch({ configSummary: e.target.value })}
          />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <NButton
          variant="primary"
          icon="▶"
          onClick={startRun}
          disabled={isRunning}
        >
          실행
        </NButton>
        <NButton variant="danger" onClick={cancel} disabled={!isRunning}>
          중지
        </NButton>
        {run.elapsedSec > 0 ? (
          <span
            style={{
              alignSelf: "center",
              fontSize: 12,
              color: "var(--nc-muted)",
            }}
          >
            경과: {formatElapsed(run.elapsedSec)}
          </span>
        ) : null}
      </div>

      <div className="notebook-run__progress">
        <div
          className={`notebook-run__bar ${
            isRunning && run.progress > 0 && run.progress < 100
              ? ""
              : ""
          }`}
          role="progressbar"
          aria-valuenow={run.progress || 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="notebook-run__bar-fill"
            style={{ width: `${run.progress || 0}%` }}
          />
        </div>
        <div className="notebook-run__meta">
          <span className="notebook-run__stage">
            {run.currentStage || "대기 중"}
          </span>
          <span>progress: {run.progress || 0}%</span>
        </div>
      </div>

      {run.metrics ? <MetricsStrip metrics={run.metrics} /> : null}

      {run.logs?.length ? (
        <div className="notebook-console" aria-label="최근 실행 로그">
          {run.logs.slice(-60).map((l, i) => (
            <div className="notebook-console__line" key={i}>
              <span className="notebook-console__ts">
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              {l.line}
            </div>
          ))}
        </div>
      ) : null}

      <ContextualAIAssist
        blockKey="run"
        actions={actions}
        provider={ui.provider}
        useRag={ui.useRag}
        onResult={(output, meta) => {
          patch({ agentOutput: output, agentMeta: meta });
        }}
      />

      {run.agentOutput ? (
        <InlineAgentOutput output={run.agentOutput} meta={run.agentMeta} />
      ) : null}
    </StepBlock>
  );
}

function MetricsStrip({ metrics }) {
  return (
    <div className="notebook-metrics" aria-label="최근 실행 지표">
      {Object.entries(metrics).map(([k, v]) => (
        <div className="notebook-metric" key={k}>
          <span className="notebook-metric__label">{k}</span>
          <span className="notebook-metric__value">
            {typeof v === "number" ? v.toFixed(3) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}
