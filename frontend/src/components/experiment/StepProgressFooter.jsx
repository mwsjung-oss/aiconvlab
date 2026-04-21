import { useMemo } from "react";
import { WORKFLOW_STEPS } from "../../workflowConfig.js";

/**
 * Phase 2c-3 (간소화) · Step Progress Footer
 *
 * 중앙 스테이지 하단에 "← 이전 · 다음 →" 네비와 6단계 체크 카드를 제공.
 * 완전한 스택형 문서 레이아웃 대신, 탭 기반 현 구조를 유지하면서
 * "문서 같은" 진행 감각을 보강한다.
 *
 * 각 단계의 상태(todo/in_progress/done)는 context 휴리스틱으로 추정:
 *   - step1: currentProjectId 있으면 done
 *   - step2: datasets.length ≥ 1 이면 done
 *   - step3: trainResult 있으면 done, 진행 중이면 in_progress
 *   - step4: trainResult || predictPreview 있으면 done
 *   - step5: history.length ≥ 2 이면 done, 1이면 in_progress
 *   - step6: reportSummary 있으면 done
 * 현재 활성 단계는 무조건 at-least in_progress 로 취급(done 조건 충족 시 done 유지).
 */
export default function StepProgressFooter({
  activeStepId,
  onSelectStep,
  context,
}) {
  const activeIdx = WORKFLOW_STEPS.findIndex((s) => s.id === activeStepId);
  const prev = activeIdx > 0 ? WORKFLOW_STEPS[activeIdx - 1] : null;
  const next =
    activeIdx >= 0 && activeIdx < WORKFLOW_STEPS.length - 1
      ? WORKFLOW_STEPS[activeIdx + 1]
      : null;

  const statuses = useMemo(() => {
    const ctx = context || {};
    const c = ctx.currentProjectId ? "done" : "todo";
    const ds =
      Array.isArray(ctx.datasets) && ctx.datasets.length > 0 ? "done" : "todo";
    const tr = ctx.trainResult?.model_id
      ? "done"
      : ctx.trainLoading
        ? "in_progress"
        : "todo";
    const ev =
      ctx.trainResult?.model_id || ctx.predictPreview
        ? "done"
        : ctx.predictLoading
          ? "in_progress"
          : "todo";
    const hist = Array.isArray(ctx.history)
      ? ctx.history.length >= 2
        ? "done"
        : ctx.history.length === 1
          ? "in_progress"
          : "todo"
      : "todo";
    const rep = ctx.reportSummary ? "done" : "todo";
    const map = {
      step1: c,
      step2: ds,
      step3: tr,
      step4: ev,
      step5: hist,
      step6: rep,
    };
    if (activeStepId && map[activeStepId] === "todo") {
      map[activeStepId] = "in_progress";
    }
    return map;
  }, [context, activeStepId]);

  const completedCount = Object.values(statuses).filter(
    (s) => s === "done"
  ).length;
  const progressPct = Math.round((completedCount / WORKFLOW_STEPS.length) * 100);

  return (
    <section className="step-progress-footer" aria-label="실험 진행도">
      <div className="step-progress-footer-head">
        <div className="step-progress-footer-meta">
          <strong>실험 진행도</strong>
          <span className="muted">
            {" "}
            · {completedCount}/{WORKFLOW_STEPS.length} 단계 완료 ({progressPct}%)
          </span>
        </div>
        <div className="step-progress-footer-nav">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!prev}
            onClick={() => prev && onSelectStep?.(prev.id)}
            title={prev ? `${prev.label}로 이동 (Alt+${activeIdx})` : "이전 단계 없음"}
          >
            ← 이전 {prev ? `· ${prev.label}` : ""}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!next}
            onClick={() => next && onSelectStep?.(next.id)}
            title={next ? `${next.label}로 이동 (Alt+${activeIdx + 2})` : "마지막 단계"}
          >
            {next ? `다음 · ${next.label} →` : "완료"}
          </button>
        </div>
      </div>

      <div className="step-progress-footer-bar" aria-hidden="true">
        <div
          className="step-progress-footer-bar-fill"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="step-progress-footer-list" role="list">
        {WORKFLOW_STEPS.map((step, idx) => {
          const s = statuses[step.id] || "todo";
          const isActive = step.id === activeStepId;
          return (
            <li key={step.id}>
              <button
                type="button"
                className={[
                  "step-progress-footer-item",
                  `step-progress-footer-item--${s}`,
                  isActive ? "step-progress-footer-item--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelectStep?.(step.id)}
                title={`${idx + 1}. ${step.label} · ${step.labelEn}${
                  s === "done"
                    ? " (완료)"
                    : s === "in_progress"
                      ? " (진행 중)"
                      : ""
                }`}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="step-progress-footer-item-num" aria-hidden="true">
                  {s === "done" ? "✓" : idx + 1}
                </span>
                <span className="step-progress-footer-item-body">
                  <span className="step-progress-footer-item-ko">
                    {step.label}
                  </span>
                  <span className="step-progress-footer-item-en">
                    {step.labelEn}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
