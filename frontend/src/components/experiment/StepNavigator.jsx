import { WORKFLOW_STEPS } from "../../workflowConfig.js";

/**
 * 실험 단계 세로 내비게이션
 */
export default function StepNavigator({
  activeStepId,
  onSelectStep,
  compact = false,
}) {
  return (
    <nav className="experiment-step-nav" aria-label="실험 단계">
      <ol className="experiment-step-nav-list">
        {WORKFLOW_STEPS.map((step, idx) => {
          const isCurrent = activeStepId === step.id;
          return (
            <li
              key={step.id}
              className={
                isCurrent
                  ? "experiment-step-nav-item experiment-step-nav-item--current"
                  : "experiment-step-nav-item"
              }
            >
              <button
                type="button"
                className={
                  isCurrent
                    ? "experiment-step-nav-btn experiment-step-nav-btn--active"
                    : "experiment-step-nav-btn"
                }
                title={`${step.labelEn}: ${step.hint}`}
                onClick={() => onSelectStep?.(step.id)}
              >
                <span className="experiment-step-nav-num">{idx + 1}</span>
                <span className="experiment-step-nav-text">
                  <span className="experiment-step-nav-label">{step.label}</span>
                  {!compact && (
                    <span className="experiment-step-nav-en">{step.labelEn}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
