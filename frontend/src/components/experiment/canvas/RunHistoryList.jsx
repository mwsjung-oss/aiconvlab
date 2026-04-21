/**
 * Persistent run history surfaced in the canvas toolbar and inside the
 * Compare block. Best run is highlighted; each row supports
 *   - reopening (selects both compare slots to include it)
 *   - marking as best
 *   - inline note editing
 */
import { formatRelative } from "./useNotebookState.js";

export default function RunHistoryList({
  runs = [],
  onSelectForCompareA,
  onSelectForCompareB,
  onMarkBest,
  onEditNote,
}) {
  if (runs.length === 0) {
    return (
      <div className="notebook-empty">
        아직 실행한 Run 이 없습니다. 4단계에서 실행을 시작해 보세요.
      </div>
    );
  }
  return (
    <div className="notebook-history">
      {runs.map((r) => {
        const km = r.keyMetric;
        return (
          <div
            key={r.id}
            className={`notebook-history__item ${
              r.isBest ? "notebook-history__item--best" : ""
            }`}
          >
            <span title={r.status}>{statusIcon(r.status)}</span>
            <div>
              <div className="notebook-history__name">
                {r.name} {r.isBest ? "· ★ Best" : ""}
              </div>
              <div className="notebook-history__meta">
                {r.model} · {r.dataset} · {formatRelative(r.startedAt)}
              </div>
            </div>
            <span className="notebook-history__metric">
              {km ? `${km.name}=${typeof km.value === "number" ? km.value.toFixed(3) : km.value}` : "—"}
            </span>
            <span style={{ display: "inline-flex", gap: 4 }}>
              <button
                type="button"
                className="notebook-canvas__btn"
                onClick={() => onSelectForCompareA?.(r.id)}
                title="비교 슬롯 A 로 선택"
              >
                A
              </button>
              <button
                type="button"
                className="notebook-canvas__btn"
                onClick={() => onSelectForCompareB?.(r.id)}
                title="비교 슬롯 B 로 선택"
              >
                B
              </button>
              <button
                type="button"
                className="notebook-canvas__btn"
                onClick={() => onMarkBest?.(r.id)}
                title="Best 로 표시"
              >
                ★
              </button>
              <button
                type="button"
                className="notebook-canvas__btn"
                onClick={() => {
                  const note = window.prompt("Run 메모", r.note || "");
                  if (note !== null) onEditNote?.(r.id, note);
                }}
                title="메모"
              >
                ✎
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function statusIcon(status) {
  switch (status) {
    case "completed":
      return "✅";
    case "failed":
      return "❌";
    case "training":
    case "evaluating":
    case "loading_data":
    case "validating":
    case "queued":
      return "⏳";
    default:
      return "·";
  }
}
