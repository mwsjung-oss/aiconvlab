import StepNavigator from "./StepNavigator.jsx";

/**
 * 좌측 실험 컨텍스트 패널: 프로젝트 요약, 단계, 메타, 데이터셋, 최근 run
 */
export default function ExperimentSidebar({
  collapsed,
  onToggleCollapsed,
  activeWorkflowStep,
  onSelectStep,
  currentProjectId,
  currentProjectName,
  ownerLabel,
  modelLabel,
  datasets = [],
  history = null,
}) {
  const hasProject = currentProjectId != null;
  const recent = Array.isArray(history)
    ? history.slice().reverse().slice(0, 5)
    : [];

  return (
    <aside
      className={
        collapsed
          ? "experiment-sidebar experiment-sidebar--collapsed"
          : "experiment-sidebar"
      }
      aria-label="실험 컨텍스트"
    >
      <div className="experiment-sidebar-inner">
        <div className="experiment-sidebar-head">
          <h3 className="experiment-sidebar-title">컨텍스트</h3>
          <button
            type="button"
            className="experiment-sidebar-collapse-btn btn btn-secondary"
            onClick={onToggleCollapsed}
            title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            aria-expanded={!collapsed}
          >
            {collapsed ? "⟩" : "⟨"}
          </button>
        </div>

        {!collapsed && (
          <>
            <div
              className={
                hasProject
                  ? "experiment-project-card"
                  : "experiment-project-card experiment-project-card--empty"
              }
            >
              {!hasProject ? (
                <>
                  <p className="experiment-project-card-kicker">활성 프로젝트 없음</p>
                  <p className="experiment-project-card-body">
                    중앙 <strong>프로젝트</strong> 패널에서 제목·본문을 입력하거나 파일을 끌어다 놓은 뒤
                    <strong> 프로젝트 자동 등록</strong>으로 실험 맥락을 만듭니다.
                  </p>
                  <ol className="experiment-onboarding-steps">
                    <li>문제·아이디어 — KPI와 가설 정리</li>
                    <li>데이터 — 업로드·스키마·품질</li>
                    <li>실험 설계 — 모델·지표·설정</li>
                    <li>실행·평가 — 학습·예측·지표</li>
                    <li>반복·개선 — 비교·튜닝</li>
                    <li>리포트·배포 — 산출·체크리스트</li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="experiment-project-card-kicker">현재 프로젝트</p>
                  <p className="experiment-project-card-name">
                    {currentProjectName || `프로젝트 ${currentProjectId}`}
                  </p>
                  <p className="experiment-project-card-meta muted">
                    ID <code>{currentProjectId}</code>
                  </p>
                </>
              )}
            </div>

            <div className="experiment-sidebar-section">
              <h4 className="experiment-sidebar-section-title">실험 단계</h4>
              <StepNavigator
                activeStepId={activeWorkflowStep}
                onSelectStep={onSelectStep}
              />
            </div>

            <div className="experiment-sidebar-section experiment-meta-block">
              <h4 className="experiment-sidebar-section-title">메타데이터</h4>
              <dl className="experiment-meta-dl">
                <div>
                  <dt>소유/세션</dt>
                  <dd>{ownerLabel || "—"}</dd>
                </div>
                <div>
                  <dt>학습 모델(설계)</dt>
                  <dd>{modelLabel || "—"}</dd>
                </div>
                <div>
                  <dt>최종 수정</dt>
                  <dd title="포털에서 별도 타임스탬프를 제공하지 않을 수 있습니다.">
                    (브라우저 세션 기준)
                  </dd>
                </div>
              </dl>
            </div>

            <div className="experiment-sidebar-section">
              <h4 className="experiment-sidebar-section-title">워크스페이스 파일</h4>
              {datasets.length ? (
                <ul className="experiment-file-list">
                  {datasets.slice(0, 12).map((name) => (
                    <li key={name}>
                      <code>{name}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted experiment-placeholder-tiny">등록된 CSV가 없습니다.</p>
              )}
            </div>

            <div className="experiment-sidebar-section">
              <h4 className="experiment-sidebar-section-title">최근 학습 이력</h4>
              {recent.length ? (
                <ul className="experiment-recent-runs">
                  {recent.map((h, i) => (
                    <li key={`${h.model_id}-${i}`}>
                      <span className="experiment-recent-time">{h.created_at || "—"}</span>
                      <span className="experiment-recent-model">{h.model_type || "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted experiment-placeholder-tiny">이력이 없습니다.</p>
              )}
            </div>
          </>
        )}

        {collapsed && (
          <div className="experiment-sidebar-collapsed-rail" aria-hidden="true">
            <span className="experiment-sidebar-rail-hint">단계</span>
          </div>
        )}
      </div>

    </aside>
  );
}
