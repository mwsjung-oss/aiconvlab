import {
  JobStatusBars,
  RecentTrainViz,
  ResourceBars,
  TaskTypeMix,
} from "../components/DashboardCharts.jsx";

export default function DashboardPage({
  datasets,
  models,
  history,
  systemStatus,
  gpuStatus,
  jobs,
  isOperator,
  onRefreshAll,
}) {
  const lastModel = models?.[models.length - 1] ?? null;
  const activeJobs = (jobs || []).filter((j) => j.status === "queued" || j.status === "running").length;
  const activeJobRows = (jobs || []).filter((j) => j.status === "queued" || j.status === "running").slice(0, 5);
  const failedJobs = (jobs || []).filter((j) => j.status === "failed").length;
  const gpu0 = gpuStatus?.gpus?.[0];

  const phaseText = (phase, status) => {
    const m = {
      queued: "대기",
      loading_user: "준비",
      training: "학습",
      predicting: "예측",
      done: "완료",
      failed: "실패",
    };
    if (phase && m[phase]) return m[phase];
    if (status === "queued") return "대기";
    if (status === "running") return "실행";
    return status || "-";
  };

  return (
    <div className="dash-page">
      <header className="dash-page-header">
        <div className="dash-page-title-block">
          <h2 className="dash-page-h2">대시보드</h2>
          <p className="dash-page-lead hint">
            데이터 업로드 → 미리보기 → 학습 → Jobs/결과 순으로 진행하면 됩니다.
          </p>
        </div>
        <button type="button" className="btn btn-secondary dash-refresh-btn" onClick={onRefreshAll}>
          전체 새로고침
        </button>
      </header>

      <section className="panel panel--dense dash-kpi-panel" aria-label="요약 지표">
        <div className="dash-kpi-grid">
          <div className="stat-card stat-card--compact">
            <div className="stat-label">데이터셋</div>
            <div className="stat-value">{datasets?.length ?? 0}</div>
          </div>
          <div className="stat-card stat-card--compact">
            <div className="stat-label">학습 모델</div>
            <div className="stat-value">{models?.length ?? 0}</div>
          </div>
          {isOperator && (
            <>
              <div className="stat-card stat-card--compact">
                <div className="stat-label">실행 중 잡</div>
                <div className="stat-value stat-value--accent">{activeJobs}</div>
              </div>
              <div className="stat-card stat-card--compact">
                <div className="stat-label">실패 잡</div>
                <div className="stat-value stat-value--warn">{failedJobs}</div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="dash-visual-row" aria-label="차트 및 분포">
        {isOperator && systemStatus && (
          <div className="panel panel--dense dash-visual-cell">
            <ResourceBars systemStatus={systemStatus} gpu0={gpu0} />
          </div>
        )}
        {isOperator && (
          <div className="panel panel--dense dash-visual-cell">
            <JobStatusBars jobs={jobs} />
          </div>
        )}
        <div className="panel panel--dense dash-visual-cell">
          <TaskTypeMix history={history} />
        </div>
        <div className="panel panel--dense dash-visual-cell">
          <RecentTrainViz history={history} limit={14} />
        </div>
      </section>

      <div className="dash-two-col">
        {isOperator && (
          <section className="panel panel--dense">
            <h2 className="panel-heading-row">진행 중 작업</h2>
            {activeJobRows.length ? (
              <div className="table-wrap table-wrap--short">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>유형</th>
                      <th>단계</th>
                      <th>진행률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeJobRows.map((j) => {
                      const progress = Math.max(0, Math.min(100, Number(j.progress) || 0));
                      return (
                        <tr key={j.job_id}>
                          <td>{j.job_id?.slice(0, 8)}…</td>
                          <td>{j.kind}</td>
                          <td>{phaseText(j.phase, j.status)}</td>
                          <td className="table-cell-progress">
                            <div className="dash-mini-pct">{Math.round(progress)}%</div>
                            <div className="dash-progress-track">
                              <div className="dash-progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hint">현재 진행 중인 작업이 없습니다.</p>
            )}
          </section>
        )}

        <section className="panel panel--dense">
          <h2 className="panel-heading-row">최근 모델</h2>
          {lastModel ? (
            <table className="mini-table mini-table--tight">
              <tbody>
                <tr>
                  <th>ID</th>
                  <td>{lastModel.model_id}</td>
                </tr>
                <tr>
                  <th>데이터셋</th>
                  <td>{lastModel.filename}</td>
                </tr>
                <tr>
                  <th>과제</th>
                  <td>{lastModel.task}</td>
                </tr>
                <tr>
                  <th>모델</th>
                  <td>{lastModel.model_type}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="hint">아직 학습된 모델이 없습니다.</p>
          )}
        </section>
      </div>

      <section className="panel panel--dense">
        <h2 className="panel-heading-row">학습 이력</h2>
        {history && history.length > 0 ? (
          <div className="table-wrap table-wrap--medium">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>데이터</th>
                  <th>과제</th>
                  <th>모델</th>
                  <th>산출</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(-8).map((h) => (
                  <tr key={h.model_id}>
                    <td>{h.model_id.slice(0, 8)}…</td>
                    <td>{h.filename}</td>
                    <td>{h.task_type}</td>
                    <td>{h.model_type}</td>
                    <td>{h.outputs?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">학습 이력이 아직 없습니다.</p>
        )}
      </section>
    </div>
  );
}
