/**
 * Experiment 상단 스트립용 실행 상태 표시.
 * @param {{ status: "idle" | "ready" | "running" | "completed" | "error" }} props
 */
export default function RunStatusBadge({ status = "idle" }) {
  const cfg = {
    idle: { label: "Idle", className: "experiment-run-badge experiment-run-badge--idle" },
    ready: { label: "Ready", className: "experiment-run-badge experiment-run-badge--ready" },
    running: { label: "Running", className: "experiment-run-badge experiment-run-badge--running" },
    completed: { label: "Completed", className: "experiment-run-badge experiment-run-badge--completed" },
    error: { label: "Error", className: "experiment-run-badge experiment-run-badge--error" },
  };
  const x = cfg[status] || cfg.idle;
  return (
    <span className={x.className} title={`실행 상태: ${x.label}`}>
      {x.label}
    </span>
  );
}
