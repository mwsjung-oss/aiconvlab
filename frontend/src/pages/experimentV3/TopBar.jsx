/**
 * TopBar — 2 row header
 *   Row 1: 프로젝트명 · 저장 상태 · 홈 버튼 · 사용자 · 로그아웃
 *   Row 2: 5 stage tabs
 */
import { useMemo } from "react";
import { STAGES } from "./config/activities.config.js";
import { formatRelative } from "./hooks/useExperimentV3State.js";

export default function TopBar({
  projectName,
  onChangeProjectName,
  savedAt,
  dirty,
  user,
  onLogout,
  onGoHome,
  stage,
  onChangeStage,
}) {
  const initial = useMemo(() => {
    const src = user?.full_name || user?.email || "";
    return src ? src.trim().charAt(0).toUpperCase() : "?";
  }, [user]);

  const savedLabel = dirty
    ? "미저장"
    : savedAt
    ? `저장됨 ${formatRelative(savedAt)}`
    : "새 세션";
  const savedClass = dirty
    ? "expv3-save-state expv3-save-state--dirty"
    : savedAt
    ? "expv3-save-state expv3-save-state--saved"
    : "expv3-save-state";

  return (
    <>
      {/* Row 1 */}
      <header className="expv3-topbar-row1">
        <div className="expv3-brand">
          <span className="expv3-brand__mark">APS</span>
          <span>· Experiment</span>
        </div>

        <div className="expv3-project">
          <span className="expv3-project__label">Project</span>
          <input
            className="expv3-project__input"
            value={projectName || ""}
            onChange={(e) => onChangeProjectName(e.target.value)}
            placeholder="새 AI 실험"
            aria-label="프로젝트 이름"
          />
          <span className={savedClass} title="자동 저장 상태">
            {savedLabel}
          </span>
        </div>

        {onGoHome ? (
          <button
            type="button"
            className="expv3-btn expv3-btn--ghost"
            onClick={onGoHome}
            title="홈으로"
          >
            홈
          </button>
        ) : null}

        <div className="expv3-user" title={user?.email || ""}>
          <span className="expv3-user__avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="expv3-user__name">
            {user?.full_name || user?.email || "게스트"}
          </span>
        </div>

        {onLogout ? (
          <button
            type="button"
            className="expv3-btn expv3-btn--ghost"
            onClick={onLogout}
            title="로그아웃"
          >
            로그아웃
          </button>
        ) : null}
      </header>

      {/* Row 2 */}
      <nav className="expv3-tabs" aria-label="실험 단계">
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={
              stage === s.id ? "expv3-tab expv3-tab--active" : "expv3-tab"
            }
            onClick={() => onChangeStage(s.id)}
            title={s.short}
          >
            <span className="expv3-tab__num">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>
    </>
  );
}
