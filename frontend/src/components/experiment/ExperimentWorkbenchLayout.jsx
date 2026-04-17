import ExperimentSidebar from "./ExperimentSidebar.jsx";
import ExperimentResultsPanel from "./ExperimentResultsPanel.jsx";

/**
 * Colab 스타일 3열: 좌 컨텍스트 · 중앙(에이전트+단계 폼) · 우 산출물
 */
export default function ExperimentWorkbenchLayout({
  activeWorkflowStep,
  onSelectStep,
  currentProjectId,
  currentProjectName,
  ownerLabel,
  modelLabel,
  datasets,
  history,
  sidebarCollapsed,
  onSidebarCollapsedChange,
  resultsPanelProps,
  children,
}) {
  const resultsCollapsed = !!resultsPanelProps?.resultsCollapsed;
  return (
    <div className="experiment-workbench-root">
      <div
        className={
          resultsCollapsed
            ? "experiment-workbench experiment-workbench--results-collapsed"
            : "experiment-workbench"
        }
      >
        <ExperimentSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() =>
            onSidebarCollapsedChange?.(!sidebarCollapsed)
          }
          activeWorkflowStep={activeWorkflowStep}
          onSelectStep={onSelectStep}
          currentProjectId={currentProjectId}
          currentProjectName={currentProjectName}
          ownerLabel={ownerLabel}
          modelLabel={modelLabel}
          datasets={datasets}
          history={history}
        />
        <div className="experiment-workbench-center">{children}</div>
        <ExperimentResultsPanel {...resultsPanelProps} />
      </div>
      <div
        className="experiment-mobile-jump"
        role="navigation"
        aria-label="패널로 이동"
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            document
              .querySelector(".experiment-sidebar")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          컨텍스트
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            document
              .querySelector(".experiment-results")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        >
          산출물
        </button>
      </div>
    </div>
  );
}
