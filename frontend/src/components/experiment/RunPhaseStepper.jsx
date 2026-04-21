/**
 * Phase 2c-1 · Run Phase 세분화 스텝퍼
 *
 * 현재 프런트엔드 로딩 상태(upload/data/train/predict)를 기반으로 휴리스틱하게
 * 단계를 맵핑하여 "파이프라인 파이프라인" 이미지를 보여준다.
 *
 * 백엔드가 실제 phase 이벤트를 스트리밍하기 전까지는 아래 규칙으로 동작한다:
 *   - uploadLoading  → loading_data
 *   - dataLoading    → preprocessing
 *   - trainLoading   → training(7초 이상 진행되면 evaluating로 전이)
 *   - predictLoading → evaluating
 *   - trainResult || predictPreview → completed
 *   - err 발생 → failed
 *   - idle        → queued(프로젝트 있으면 ready)
 *
 * UI: 7개 phase를 가로 스테퍼로 표시. 현재 phase는 반짝 + primary, 지난 phase는
 * success 체크, 미래 phase는 muted.
 */

const PHASES = [
  { id: "queued", label: "대기", emoji: "•" },
  { id: "loading_data", label: "데이터 적재", emoji: "⬆" },
  { id: "preprocessing", label: "전처리", emoji: "⚙" },
  { id: "training", label: "학습", emoji: "▶" },
  { id: "evaluating", label: "평가", emoji: "◈" },
  { id: "saving", label: "저장", emoji: "⤓" },
  { id: "completed", label: "완료", emoji: "✓" },
];

function phaseIndex(phase) {
  return PHASES.findIndex((p) => p.id === phase);
}

/**
 * @param {{
 *   phase: string,
 *   failed?: boolean,
 *   elapsedSec?: number,
 *   lastRunAt?: string | null,
 * }} props
 */
export default function RunPhaseStepper({
  phase = "queued",
  failed = false,
  elapsedSec = 0,
  lastRunAt = null,
}) {
  const activeIdx = phaseIndex(phase);
  return (
    <div
      className={
        failed
          ? "run-phase-stepper run-phase-stepper--failed"
          : "run-phase-stepper"
      }
      role="group"
      aria-label="실행 파이프라인 상태"
    >
      <div className="run-phase-stepper-track">
        {PHASES.map((p, i) => {
          const state =
            activeIdx < 0
              ? "idle"
              : i < activeIdx
                ? "done"
                : i === activeIdx
                  ? "active"
                  : "future";
          return (
            <div
              key={p.id}
              className={`run-phase-step run-phase-step--${state}`}
              title={p.label}
            >
              <div className="run-phase-step-dot" aria-hidden="true">
                {state === "done" ? "✓" : p.emoji}
              </div>
              <div className="run-phase-step-label">{p.label}</div>
              {i < PHASES.length - 1 && (
                <div
                  className={
                    state === "done" || state === "active"
                      ? "run-phase-step-line run-phase-step-line--done"
                      : "run-phase-step-line"
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="run-phase-stepper-meta">
        {failed ? (
          <span className="run-phase-stepper-meta-err">실행 실패</span>
        ) : (
          <>
            <span className="run-phase-stepper-meta-label">현재:</span>{" "}
            <strong>{PHASES[activeIdx]?.label ?? "—"}</strong>
            {elapsedSec > 0 && (
              <span className="run-phase-stepper-meta-time">
                {" "}
                · 경과 {elapsedSec.toFixed(0)}s
              </span>
            )}
            {lastRunAt && (
              <span className="run-phase-stepper-meta-time">
                {" "}
                · 마지막 실행{" "}
                {new Date(lastRunAt).toLocaleString("ko-KR", {
                  hour12: false,
                })}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
