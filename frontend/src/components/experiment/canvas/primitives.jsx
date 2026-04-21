/**
 * Shared low-level primitives used by every notebook block.
 *
 * All styling comes from `canvas.css`. The primitives here stay presentation-
 * only so that individual blocks can compose them freely without repeating
 * ARIA / focus handling.
 */
import { forwardRef } from "react";

/** Inline chip for status + metadata. */
export function Chip({ kind = "info", children, title }) {
  const cls = {
    info: "notebook-canvas__chip--info",
    ok: "notebook-canvas__chip--ok",
    warn: "notebook-canvas__chip--warn",
    err: "notebook-canvas__chip--err",
  }[kind] || "notebook-canvas__chip--info";
  return (
    <span className={`notebook-canvas__chip ${cls}`} title={title}>
      {children}
    </span>
  );
}

/** Colored dot + optional pulse for "running" states. */
export function Dot({ kind = "info", pulse = false }) {
  const cls = {
    info: "notebook-canvas__dot--info",
    ok: "notebook-canvas__dot--ok",
    warn: "notebook-canvas__dot--warn",
    err: "notebook-canvas__dot--err",
    muted: "",
  }[kind] || "notebook-canvas__dot--info";
  return (
    <span
      className={`notebook-canvas__dot ${cls} ${pulse ? "notebook-canvas__dot--pulse" : ""}`}
      aria-hidden="true"
    />
  );
}

/** Button — matches the toolbar design language. */
export const NButton = forwardRef(function NButton(
  {
    variant = "secondary",
    size = "md",
    icon,
    children,
    className = "",
    ...rest
  },
  ref
) {
  const variantClass = {
    secondary: "",
    primary: "notebook-canvas__btn--primary",
    ghost: "notebook-canvas__btn--ghost",
    danger: "notebook-canvas__btn--danger",
    icon: "notebook-canvas__btn--icon",
  }[variant] || "";
  const iconOnly = variant === "icon" || (icon && !children);
  return (
    <button
      ref={ref}
      type="button"
      className={`notebook-canvas__btn ${variantClass} ${iconOnly ? "notebook-canvas__btn--icon" : ""} ${className}`.trim()}
      {...rest}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
});

/** Labelled text field. */
export function Field({
  label,
  hint,
  children,
  full = false,
  htmlFor,
}) {
  return (
    <div
      className={`notebook-block__field ${full ? "notebook-block__field--full" : ""}`}
    >
      {label ? (
        <label htmlFor={htmlFor} className="notebook-block__label">
          {label}
        </label>
      ) : null}
      {children}
      {hint ? (
        <span style={{ fontSize: 11, color: "var(--nc-muted)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

/** Map a notebook run status to a user-facing chip. */
export function RunStatusChip({ status }) {
  const mapping = {
    idle: { kind: "info", label: "대기", dot: "muted", pulse: false },
    queued: { kind: "info", label: "큐 대기", dot: "info", pulse: true },
    loading_data: { kind: "info", label: "데이터 로딩", dot: "info", pulse: true },
    validating: { kind: "info", label: "검증 중", dot: "info", pulse: true },
    training: { kind: "info", label: "학습 중", dot: "info", pulse: true },
    evaluating: { kind: "info", label: "평가 중", dot: "info", pulse: true },
    saving: { kind: "info", label: "저장 중", dot: "info", pulse: true },
    completed: { kind: "ok", label: "완료", dot: "ok", pulse: false },
    failed: { kind: "err", label: "실패", dot: "err", pulse: false },
  };
  const entry = mapping[status] || mapping.idle;
  return (
    <Chip kind={entry.kind}>
      <Dot kind={entry.dot} pulse={entry.pulse} />
      {entry.label}
    </Chip>
  );
}

/** Derived chip for the generic block status.
 *
 * Accepts both the canonical brief vocabulary
 *   (not_started | ready | running | completed | warning | failed)
 * and the legacy internal labels
 *   (idle | in_progress | done | warning | error)
 * so older call sites keep working during the rollout.
 */
const BLOCK_STATUS_MAP = {
  // canonical names from product brief
  not_started: { kind: "info", label: "시작 전", dot: "muted" },
  ready: { kind: "info", label: "준비됨", dot: "info" },
  running: { kind: "info", label: "진행 중", dot: "info", pulse: true },
  completed: { kind: "ok", label: "완료", dot: "ok" },
  warning: { kind: "warn", label: "검토 필요", dot: "warn" },
  failed: { kind: "err", label: "실패", dot: "err" },
  // legacy aliases — kept for backward compatibility
  idle: { kind: "info", label: "시작 전", dot: "muted" },
  in_progress: { kind: "info", label: "진행 중", dot: "info", pulse: true },
  done: { kind: "ok", label: "완료", dot: "ok" },
  error: { kind: "err", label: "실패", dot: "err" },
};

export function BlockStatusChip({ status }) {
  const entry = BLOCK_STATUS_MAP[status] || BLOCK_STATUS_MAP.not_started;
  return (
    <Chip kind={entry.kind} title={`상태: ${entry.label}`}>
      <Dot kind={entry.dot} pulse={!!entry.pulse} />
      {entry.label}
    </Chip>
  );
}
