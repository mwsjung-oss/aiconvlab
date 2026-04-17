import { useMemo, useState } from "react";
import { WORKFLOW_STEPS } from "../../workflowConfig.js";

const TABS = [
  { id: "results", label: "Results" },
  { id: "logs", label: "Logs" },
  { id: "charts", label: "Charts" },
  { id: "tables", label: "Tables" },
  { id: "files", label: "Files" },
  { id: "report", label: "Report Draft" },
];

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
}) {
  const [tab, setTab] = useState("results");

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

  const panel = () => {
    switch (tab) {
      case "results":
        return resultsBody();
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
