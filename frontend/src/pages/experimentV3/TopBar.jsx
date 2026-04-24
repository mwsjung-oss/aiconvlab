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
  aiProvider,
  onChangeAiProvider,
  aiHealth,
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

        {aiProvider && onChangeAiProvider ? (
          <AiSwitch
            value={aiProvider}
            onChange={onChangeAiProvider}
            health={aiHealth}
          />
        ) : null}

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

/**
 * AiSwitch — OpenAI ↔ Gemini 세그먼트 선택기
 *
 * - 2개 버튼을 좁은 pill 에 담아 헤더 우측(홈 버튼 왼쪽)에 배치한다.
 * - `health.{openai,gemini}` 가 false 면 해당 버튼 옆에 노란 점을 표시해
 *   "서버에 API 키 미등록" 을 알려 준다(기능 자체는 허용 — 관리자가 키를
 *   Render 에 넣는 즉시 동작하므로).
 */
function AiSwitch({ value, onChange, health }) {
  const items = [
    { id: "openai", label: "OpenAI" },
    { id: "gemini", label: "Gemini" },
  ];
  const tooltip = (id) => {
    if (health?.loading) return `${id} — 상태 확인 중`;
    if (health?.error) return `${id} — health 오류: ${health.error}`;
    const ok =
      (id === "openai" && health?.openai) ||
      (id === "gemini" && health?.gemini);
    return ok
      ? `${id} API 키가 서버에 등록되어 있습니다.`
      : `${id} API 키가 서버에 등록되어 있지 않습니다 (Render 환경변수 확인 필요).`;
  };
  return (
    <div
      className="expv3-ai-switch"
      role="radiogroup"
      aria-label="AI Provider 선택"
      title="프롬프트 실행에 사용할 AI 공급자"
    >
      <span className="expv3-ai-switch__label">AI</span>
      {items.map((it) => {
        const active = value === it.id;
        const ok =
          (it.id === "openai" && health?.openai) ||
          (it.id === "gemini" && health?.gemini);
        const dotClass =
          "expv3-ai-switch__dot " +
          (health?.loading
            ? "expv3-ai-switch__dot--pending"
            : ok
            ? "expv3-ai-switch__dot--ok"
            : "expv3-ai-switch__dot--off");
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={
              "expv3-ai-switch__btn" +
              (active ? " expv3-ai-switch__btn--active" : "")
            }
            onClick={() => onChange(it.id)}
            title={tooltip(it.id)}
          >
            <span className={dotClass} aria-hidden="true" />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
