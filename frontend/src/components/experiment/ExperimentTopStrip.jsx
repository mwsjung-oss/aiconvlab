import RunStatusBadge from "./RunStatusBadge.jsx";

/**
 * Experiment 전용 상단 스트립: 프로젝트·모델·상태·빠른 액션 + (optional) 서브 내비 슬롯
 */
export default function ExperimentTopStrip({
  currentProjectSelectValue,
  onProjectChange,
  selectableProjects,
  onNewProject,
  runStatus,
  task,
  onTaskChange,
  modelType,
  onModelTypeChange,
  modelOptions,
  onCompareRuns,
  onExport,
  childrenSubNav,
}) {
  return (
    <div className="experiment-top-strip">
      <div className="experiment-top-strip-row experiment-top-strip-row--primary">
        <div className="experiment-top-strip-cluster experiment-top-strip-cluster--project">
          <div className="experiment-top-strip-field">
            <span className="workflow-current-project-label">프로젝트</span>
            <div className="experiment-top-strip-inline">
              <select
                className="workflow-project-select"
                value={currentProjectSelectValue}
                onChange={onProjectChange}
                title="진행 중인 프로젝트"
              >
                <option value="">선택 안 함</option>
                {selectableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (ID: {p.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary workflow-project-new-btn"
                onClick={onNewProject}
              >
                New Project
              </button>
            </div>
          </div>
        </div>

        <div className="experiment-top-strip-cluster experiment-top-strip-cluster--model">
          <div className="experiment-top-strip-field">
            <span className="experiment-top-strip-field-label">과제</span>
            <label className="experiment-model-label">
              <select
                className="experiment-model-select"
                value={task}
                onChange={(e) => onTaskChange(e.target.value)}
              >
                <option value="classification">분류</option>
                <option value="regression">회귀</option>
                <option value="time_series">시계열</option>
                <option value="anomaly_detection">이상 탐지</option>
              </select>
            </label>
          </div>
          <div className="experiment-top-strip-field">
            <span className="experiment-top-strip-field-label">학습 모델</span>
            <label className="experiment-model-label">
              <select
                className="experiment-model-select experiment-model-select--wide"
                value={modelType}
                onChange={(e) => onModelTypeChange(e.target.value)}
              >
                {(modelOptions || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="experiment-top-strip-cluster experiment-top-strip-cluster--status">
          <div className="experiment-top-strip-field">
            <span className="experiment-top-strip-status-label">실행 상태</span>
            <RunStatusBadge status={runStatus} />
          </div>
        </div>

        <div className="experiment-top-strip-cluster experiment-top-strip-cluster--actions">
          <button
            type="button"
            className="btn btn-secondary experiment-top-strip-action-btn"
            disabled
            title="브라우저·세션 상태는 자동 유지됩니다. 별도 저장 API는 연결되어 있지 않습니다."
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary experiment-top-strip-action-btn"
            onClick={onCompareRuns}
            title="실험 플랫폼에서 Run 비교·스윕"
          >
            Compare Runs
          </button>
          <button
            type="button"
            className="btn btn-secondary experiment-top-strip-action-btn"
            onClick={onExport}
            title="리포트·산출 화면으로 이동"
          >
            Export
          </button>
        </div>
      </div>
      {childrenSubNav ? (
        <div className="experiment-top-strip-sub">{childrenSubNav}</div>
      ) : null}
    </div>
  );
}
