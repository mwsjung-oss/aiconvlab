import { useMemo, useState } from "react";
import { WORKFLOW_STEPS } from "../../workflowConfig.js";
import RunPhaseStepper from "./RunPhaseStepper.jsx";

const TABS = [
  { id: "results", label: "Results" },
  { id: "history", label: "History" },
  { id: "logs", label: "Logs" },
  { id: "charts", label: "Charts" },
  { id: "tables", label: "Tables" },
  { id: "files", label: "Files" },
  { id: "report", label: "Report Draft" },
];

function fmtMetricValue(v) {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toFixed(1);
    if (abs >= 1) return v.toFixed(3);
    return v.toFixed(4);
  }
  return String(v);
}

/**
 * Phase 2c-2 · Run 비교 본문
 *
 * 선택된 2~3개의 run(history 객체)을 받아 공통 파라미터/지표를 열로 세워
 * 비교 테이블을 그린다. 각 지표에서 "가장 좋은" 값을 강조.
 *
 * "좋은 값" 휴리스틱: 키 이름에 loss/error/mae/mse/rmse/mape/log_loss가
 * 있으면 최소값을, 그 외 지표는 최대값을 best로 본다.
 */
function isLowerBetter(metricKey) {
  const k = String(metricKey).toLowerCase();
  return /loss|error|mae|mse|rmse|mape|perplexity/.test(k);
}

function RunCompareBody({ runs }) {
  const paramKeys = useMemo(() => {
    const ks = new Set();
    runs.forEach((r) => {
      ["task_type", "model_type", "dataset", "filename", "target_column"].forEach(
        (k) => {
          if (r?.[k] != null) ks.add(k);
        }
      );
    });
    return Array.from(ks);
  }, [runs]);

  const metricKeys = useMemo(() => {
    const ks = new Set();
    runs.forEach((r) => {
      if (r?.metrics && typeof r.metrics === "object") {
        Object.keys(r.metrics).forEach((k) => ks.add(k));
      }
    });
    return Array.from(ks);
  }, [runs]);

  const bestIdxByMetric = useMemo(() => {
    const map = {};
    metricKeys.forEach((mk) => {
      let bestIdx = -1;
      let bestVal = null;
      runs.forEach((r, i) => {
        const v = r?.metrics?.[mk];
        if (typeof v !== "number" || !Number.isFinite(v)) return;
        if (bestIdx < 0) {
          bestIdx = i;
          bestVal = v;
          return;
        }
        const wantLower = isLowerBetter(mk);
        if ((wantLower && v < bestVal) || (!wantLower && v > bestVal)) {
          bestIdx = i;
          bestVal = v;
        }
      });
      map[mk] = bestIdx;
    });
    return map;
  }, [runs, metricKeys]);

  return (
    <div className="run-compare-wrap">
      <div className="run-compare-scroll">
        <table className="run-compare-table">
          <thead>
            <tr>
              <th style={{ minWidth: 120 }}>항목</th>
              {runs.map((r, i) => (
                <th key={i}>
                  <div className="run-compare-col-head">
                    <span className="run-compare-col-tag">Run {i + 1}</span>
                    <span className="run-compare-col-sub">
                      {r?.created_at || "—"}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="run-compare-section">
              <td colSpan={runs.length + 1}>파라미터</td>
            </tr>
            {paramKeys.map((pk) => (
              <tr key={pk}>
                <td className="run-compare-k">{pk}</td>
                {runs.map((r, i) => (
                  <td key={i} className="run-compare-v">
                    {r?.[pk] != null ? String(r[pk]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="run-compare-section">
              <td colSpan={runs.length + 1}>지표</td>
            </tr>
            {metricKeys.map((mk) => (
              <tr key={mk}>
                <td className="run-compare-k">
                  {mk}
                  <small className="run-compare-k-sub">
                    {isLowerBetter(mk) ? "낮을수록 좋음" : "높을수록 좋음"}
                  </small>
                </td>
                {runs.map((r, i) => {
                  const v = r?.metrics?.[mk];
                  const best = bestIdxByMetric[mk] === i;
                  return (
                    <td
                      key={i}
                      className={
                        best
                          ? "run-compare-v run-compare-v--best"
                          : "run-compare-v"
                      }
                      title={
                        best
                          ? `${isLowerBetter(mk) ? "최소" : "최대"} · 최고값`
                          : undefined
                      }
                    >
                      {fmtMetricValue(v)}
                      {best && (
                        <span className="run-compare-best-badge" aria-hidden="true">
                          ★
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!metricKeys.length && (
              <tr>
                <td
                  colSpan={runs.length + 1}
                  className="run-compare-empty"
                >
                  선택한 run에 비교 가능한 지표가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepContextBanner({ activeWorkflowStep }) {
  const step = WORKFLOW_STEPS.find((s) => s.id === activeWorkflowStep);
  if (!step) return null;
  const hints = {
    step1: "브리프·KPI·문제 캔버스를 오른쪽에서 정리합니다.",
    step2: "데이터셋·스키마·품질 체크리스트를 확인합니다.",
    step3: "실험 계획·모델·하이퍼파라미터 요약을 둡니다.",
    step4: "로그·지표·차트·예측 산출을 넓게 봅니다.",
    step5: "이전 run과 비교·개선 아이디어를 모읍니다.",
    step6: "리포트 목차·내보내기·배포 체크리스트입니다.",
  };
  return (
    <div className="experiment-results-step-banner">
      <strong>
        {step.label} · {step.labelEn}
      </strong>
      <span className="muted">{hints[step.id] || step.hint}</span>
    </div>
  );
}

export default function ExperimentResultsPanel({
  activeWorkflowStep,
  currentProjectId,
  trainResult,
  plotUrl,
  trainErr,
  trainMsg,
  predictPreview,
  predictErr,
  predictMsg,
  history,
  datasets,
  selectedFile,
  preview,
  jobs,
  reportSummary,
  reportFiles,
  resultsCollapsed,
  onToggleResultsCollapsed,
  fullscreen,
  onToggleFullscreen,
  runPhase,
  runFailed,
  runElapsedSec,
}) {
  const [tab, setTab] = useState("results");
  /** Phase 2c-2 · History 탭에서 선택된 run 인덱스(최대 3개) */
  const [selectedRunIdxs, setSelectedRunIdxs] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  const latestHistory = useMemo(() => {
    if (!Array.isArray(history) || !history.length) return null;
    return history.slice().reverse()[0];
  }, [history]);

  const jobLines = useMemo(() => {
    if (!Array.isArray(jobs) || !jobs.length) return "";
    return jobs
      .slice(0, 12)
      .map((j) => `${j.status || "?"} · ${j.kind || ""} · ${j.id || ""}`)
      .join("\n");
  }, [jobs]);

  const resultsBody = () => {
    if (trainErr) {
      return <pre className="experiment-results-pre experiment-results-pre--err">{trainErr}</pre>;
    }
    if (predictErr) {
      return <pre className="experiment-results-pre experiment-results-pre--err">{predictErr}</pre>;
    }
    if (trainResult) {
      return (
        <pre className="experiment-results-pre">
          {JSON.stringify(
            {
              model_id: trainResult.model_id,
              metrics: trainResult.metrics,
              message: trainMsg,
            },
            null,
            2
          )}
        </pre>
      );
    }
    if (predictPreview) {
      return (
        <pre className="experiment-results-pre">
          {JSON.stringify(
            {
              rows: predictPreview.rows,
              output_file: predictPreview.output_file,
              message: predictMsg,
            },
            null,
            2
          )}
        </pre>
      );
    }
    if (latestHistory) {
      return (
        <pre className="experiment-results-pre">
          {JSON.stringify(latestHistory, null, 2)}
        </pre>
      );
    }
    return (
      <p className="experiment-results-placeholder muted">
        {currentProjectId
          ? "학습·예측을 실행하면 요약 지표와 model_id가 이 탭에 표시됩니다."
          : "프로젝트를 등록한 뒤 파이프라인을 실행하면 결과가 쌓입니다."}
      </p>
    );
  };

  const logsBody = () => {
    const lines = [
      trainMsg && `train: ${trainMsg}`,
      predictMsg && `predict: ${predictMsg}`,
      jobLines && `jobs:\n${jobLines}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!lines) {
      return (
        <p className="experiment-results-placeholder muted">
          Jobs·학습·예측 메시지가 여기에 집계됩니다.
        </p>
      );
    }
    return <pre className="experiment-results-pre">{lines}</pre>;
  };

  const chartsBody = () => {
    if (plotUrl) {
      return (
        <div className="experiment-results-chart-wrap">
          <img src={plotUrl} alt="학습 결과 차트" className="experiment-results-chart-img" />
        </div>
      );
    }
    return (
      <p className="experiment-results-placeholder muted">
        학습 완료 후 생성되는 차트가 여기에 표시됩니다.
      </p>
    );
  };

  const tablesBody = () => {
    if (preview?.data?.length > 0 && preview.columns) {
      return (
        <div className="table-wrap experiment-results-table-wrap">
          <p className="hint">
            {selectedFile ? (
              <>
                파일 <code>{selectedFile}</code> · 총 {preview.total_rows}행 중 상위{" "}
                {preview.preview_rows}행
              </>
            ) : (
              "미리보기 데이터"
            )}
          </p>
          <table>
            <thead>
              <tr>
                {preview.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.data.map((row, i) => (
                <tr key={i}>
                  {preview.columns.map((c) => (
                    <td key={c}>
                      {row[c] !== null && row[c] !== undefined ? String(row[c]) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (predictPreview?.preview?.length) {
      return (
        <pre className="experiment-results-pre">
          {JSON.stringify(predictPreview.preview, null, 2)}
        </pre>
      );
    }
    return (
      <p className="experiment-results-placeholder muted">
        데이터 단계에서 미리보기를 갱신하거나, 예측 산출이 있으면 표 형태로 표시됩니다.
      </p>
    );
  };

  const filesBody = () => {
    if (datasets?.length) {
      return (
        <ul className="experiment-results-files">
          {datasets.map((f) => (
            <li key={f}>
              <code>{f}</code>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p className="experiment-results-placeholder muted">업로드된 워크스페이스 파일이 없습니다.</p>
    );
  };

  const reportBody = () => {
    if (reportSummary) {
      return (
        <pre className="experiment-results-pre">
          {JSON.stringify(reportSummary, null, 2)}
        </pre>
      );
    }
    if (reportFiles?.length) {
      return (
        <ul className="experiment-results-files">
          {reportFiles.map((f, i) => (
            <li key={i}>
              <code>{typeof f === "string" ? f : f.name || JSON.stringify(f)}</code>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p className="experiment-results-placeholder muted">
        Reports 단계에서 생성된 초안·파일이 연결되면 이 탭에 나타납니다.
      </p>
    );
  };

  const historyRuns = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return history.slice().reverse();
  }, [history]);

  const selectedRuns = useMemo(() => {
    return selectedRunIdxs
      .map((i) => historyRuns[i])
      .filter((r) => r != null);
  }, [selectedRunIdxs, historyRuns]);

  const toggleRunSelection = (idx) => {
    setSelectedRunIdxs((prev) => {
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      if (prev.length >= 3) return prev; // 최대 3개
      return [...prev, idx];
    });
  };

  const historyBody = () => {
    if (!historyRuns.length) {
      return (
        <p className="experiment-results-placeholder muted">
          아직 실행 이력이 없습니다. 학습·예측을 한 번 이상 실행하면 run이 여기에 쌓입니다.
        </p>
      );
    }
    const canCompare = selectedRunIdxs.length >= 2;
    return (
      <div className="experiment-history-pane">
        <div className="experiment-history-toolbar">
          <span className="experiment-history-toolbar-info">
            {selectedRunIdxs.length} / 3 선택
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canCompare}
            onClick={() => setShowCompare((v) => !v)}
            title="선택된 run(2~3개)을 비교"
          >
            {showCompare ? "비교 닫기" : "비교 보기"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!selectedRunIdxs.length}
            onClick={() => {
              setSelectedRunIdxs([]);
              setShowCompare(false);
            }}
          >
            선택 해제
          </button>
        </div>
        {showCompare && canCompare && (
          <RunCompareBody runs={selectedRuns} />
        )}
        <div className="run-history-scroll">
          <table className="run-history-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} aria-label="선택"></th>
                <th>시간</th>
                <th>과제</th>
                <th>모델</th>
                <th>데이터셋</th>
                <th>주요 지표</th>
              </tr>
            </thead>
            <tbody>
              {historyRuns.slice(0, 30).map((r, i) => {
                const checked = selectedRunIdxs.includes(i);
                const disabled =
                  !checked && selectedRunIdxs.length >= 3;
                const topMetrics = r?.metrics
                  ? Object.entries(r.metrics)
                      .slice(0, 3)
                      .map(
                        ([k, v]) =>
                          `${k}: ${fmtMetricValue(v)}`
                      )
                      .join(" · ")
                  : "—";
                return (
                  <tr
                    key={`${r.model_id || "run"}-${i}`}
                    className={
                      checked
                        ? "run-history-row run-history-row--checked"
                        : "run-history-row"
                    }
                    onClick={() => {
                      if (disabled) return;
                      toggleRunSelection(i);
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleRunSelection(i)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Run ${i + 1} 선택`}
                      />
                    </td>
                    <td className="run-history-cell-time">
                      {r?.created_at || "—"}
                    </td>
                    <td>{r?.task_type || "—"}</td>
                    <td>{r?.model_type || "—"}</td>
                    <td
                      className="run-history-cell-ds"
                      title={r?.dataset || r?.filename || ""}
                    >
                      {r?.dataset || r?.filename || "—"}
                    </td>
                    <td className="run-history-cell-m">{topMetrics}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const panel = () => {
    switch (tab) {
      case "results":
        return resultsBody();
      case "history":
        return historyBody();
      case "logs":
        return logsBody();
      case "charts":
        return chartsBody();
      case "tables":
        return tablesBody();
      case "files":
        return filesBody();
      case "report":
        return reportBody();
      default:
        return null;
    }
  };

  return (
    <aside
      className={
        fullscreen
          ? "experiment-results experiment-results--fullscreen"
          : resultsCollapsed
            ? "experiment-results experiment-results--collapsed"
            : "experiment-results"
      }
      aria-label="실험 산출물"
    >
      <div className="experiment-results-head">
        <h3 className="experiment-results-title">산출물</h3>
        <div className="experiment-results-head-actions">
          <button
            type="button"
            className="btn btn-secondary experiment-results-icon-btn"
            onClick={onToggleResultsCollapsed}
            title={resultsCollapsed ? "산출물 패널 펼치기" : "산출물 패널 접기"}
          >
            {resultsCollapsed ? "◀" : "▶"}
          </button>
          <button
            type="button"
            className="btn btn-secondary experiment-results-icon-btn"
            onClick={onToggleFullscreen}
            title={fullscreen ? "전체 화면 종료" : "산출물 전체 화면"}
          >
            {fullscreen ? "⤓" : "⤢"}
          </button>
        </div>
      </div>

      {!resultsCollapsed && (
        <>
          <StepContextBanner activeWorkflowStep={activeWorkflowStep} />
          {runPhase && (
            <RunPhaseStepper
              phase={runPhase}
              failed={!!runFailed}
              elapsedSec={runElapsedSec || 0}
              lastRunAt={
                Array.isArray(history) && history.length
                  ? history[history.length - 1]?.created_at
                  : null
              }
            />
          )}
          <div className="experiment-results-tabs" role="tablist" aria-label="산출물 보기">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={
                  tab === t.id
                    ? "experiment-results-tab experiment-results-tab--active"
                    : "experiment-results-tab"
                }
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="experiment-results-body"
            role="tabpanel"
            aria-label={TABS.find((x) => x.id === tab)?.label}
          >
            {panel()}
          </div>
        </>
      )}
    </aside>
  );
}
