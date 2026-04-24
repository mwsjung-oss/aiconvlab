/**
 * NotebookCell — a single Colab/Jupyter-style cell.
 *
 * Supported types: "prompt" | "code" | "sql" | "markdown" | "result"
 *
 * A cell has:
 *   - an execution marker column on the left (Jupyter In[] style)
 *   - a type chip
 *   - an editable title
 *   - a toolbar (collapse, duplicate, convert, move up/down, delete)
 *   - a monospace/natural editor depending on type
 *   - an inline output panel and optional logs stream when running
 */
import { useMemo } from "react";
import { formatTime } from "./useExperimentV2State.js";

const TYPE_LABEL = {
  prompt: "Prompt",
  code: "Code",
  sql: "SQL",
  markdown: "Markdown",
  result: "Result",
};

const CONVERTIBLE_TYPES = ["prompt", "code", "sql", "markdown"];

export default function NotebookCell({
  cell,
  index,
  total,
  isActive,
  onFocus,
  onPatch,
  onRun,
  onDuplicate,
  onDelete,
  onMove,
  onConvert,
  onAddAfter,
}) {
  const running = cell.status === "running";
  const errored = cell.status === "error";

  const execMarker = useMemo(() => {
    if (running) return "[*]";
    if (cell.status === "complete") return `[${index + 1}]`;
    if (cell.status === "error") return "[!]";
    return "[ ]";
  }, [cell.status, index, running]);

  const className = [
    "expv2-cell",
    `expv2-cell--${cell.type}`,
    isActive ? "expv2-cell--active" : "",
    running ? "expv2-cell--running" : "",
    errored ? "expv2-cell--error" : "",
    cell.collapsed ? "expv2-cell--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={className}
      onFocus={onFocus}
      onClick={onFocus}
      aria-label={`${TYPE_LABEL[cell.type]} 셀`}
    >
      <header className="expv2-cell__head">
        <span className="expv2-cell__exec-marker" aria-hidden="true">
          {execMarker}
        </span>
        <span
          className={`expv2-cell__type-chip expv2-cell__type-chip--${cell.type}`}
        >
          {TYPE_LABEL[cell.type] || cell.type}
        </span>
        <input
          type="text"
          value={cell.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          className="expv2-cell__title"
          placeholder="셀 제목"
          aria-label="셀 제목"
        />
        <div className="expv2-cell__tools">
          <CellStatus status={cell.status} updatedAt={cell.updatedAt} />
          <button
            type="button"
            className="expv2-btn expv2-btn--icon expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onPatch({ collapsed: !cell.collapsed });
            }}
            title={cell.collapsed ? "셀 펼치기" : "셀 접기"}
            aria-label={cell.collapsed ? "셀 펼치기" : "셀 접기"}
          >
            {cell.collapsed ? "▸" : "▾"}
          </button>
          {CONVERTIBLE_TYPES.includes(cell.type) ? (
            <select
              value={cell.type}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                onConvert(cell.id, e.target.value);
              }}
              className="expv2-btn expv2-btn--sm"
              title="셀 유형 변경"
              aria-label="셀 유형 변경"
            >
              {CONVERTIBLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="expv2-btn expv2-btn--icon expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onMove(cell.id, "up");
            }}
            disabled={index === 0}
            title="위로 이동"
            aria-label="위로 이동"
          >
            ▲
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--icon expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onMove(cell.id, "down");
            }}
            disabled={index >= total - 1}
            title="아래로 이동"
            aria-label="아래로 이동"
          >
            ▼
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--icon expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(cell.id);
            }}
            title="셀 복제"
            aria-label="셀 복제"
          >
            ⎘
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--icon expv2-btn--ghost expv2-btn--sm expv2-btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("이 셀을 삭제할까요?")) onDelete(cell.id);
            }}
            title="셀 삭제"
            aria-label="셀 삭제"
          >
            🗑
          </button>
        </div>
      </header>

      <div className="expv2-cell__body">
        <div className="expv2-cell__runner">
          <button
            type="button"
            className="expv2-cell__run-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRun(cell.id);
            }}
            disabled={running}
            title="셀 실행"
            aria-label="셀 실행"
          >
            {running ? "⏳" : "▶"}
          </button>
        </div>
        <div className="expv2-cell__editor">
          <textarea
            value={cell.content}
            onChange={(e) => onPatch({ content: e.target.value })}
            className={`expv2-cell__textarea expv2-cell__textarea--${cell.type}`}
            rows={Math.max(
              2,
              Math.min(20, (cell.content || "").split("\n").length)
            )}
            placeholder={placeholderFor(cell.type)}
            spellCheck={cell.type === "markdown" || cell.type === "prompt"}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {errored && cell.metadata?.errorMessage ? (
        <div className="expv2-cell__error-banner">⚠ {cell.metadata.errorMessage}</div>
      ) : null}

      {cell.logs && cell.logs.length ? (
        <div className="expv2-cell__logs" aria-label="실행 로그">
          {cell.logs.slice(-30).map((l, i) => (
            <div key={i} className="expv2-cell__log-row">
              <span className="expv2-cell__log-time">{formatTime(l.ts)}</span>
              {l.line}
            </div>
          ))}
        </div>
      ) : null}

      {cell.output ? <CellOutput cell={cell} /> : null}

      {/* Insertion bar between cells */}
      <div className="expv2-cell-insert" aria-hidden="true">
        <span className="expv2-cell-insert__line" />
        <span className="expv2-cell-insert__btns">
          <button
            type="button"
            className="expv2-btn expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddAfter(cell.id, "prompt");
            }}
          >
            + Prompt
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddAfter(cell.id, "code");
            }}
          >
            + Code
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--ghost expv2-btn--sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddAfter(cell.id, "markdown");
            }}
          >
            + Markdown
          </button>
        </span>
        <span className="expv2-cell-insert__line" />
      </div>
    </section>
  );
}

function placeholderFor(type) {
  switch (type) {
    case "prompt":
      return "자연어 지시를 입력하세요. (예: '클래스 불균형 대응 기법을 제안해 주세요')";
    case "code":
      return "# Python";
    case "sql":
      return "-- SQL";
    case "markdown":
      return "## 마크다운 메모\n";
    default:
      return "";
  }
}

function CellStatus({ status, updatedAt }) {
  const map = {
    idle: { dot: "", label: "대기", chipClass: "" },
    running: { dot: "running", label: "실행 중", chipClass: "info" },
    complete: { dot: "ok", label: "완료", chipClass: "ok" },
    error: { dot: "err", label: "실패", chipClass: "err" },
  };
  const entry = map[status] || map.idle;
  return (
    <span className="expv2-cell__status" title={updatedAt ? `업데이트: ${new Date(updatedAt).toLocaleString()}` : ""}>
      {entry.dot ? <span className={`expv2-dot expv2-dot--${entry.dot}`} /> : null}
      {entry.label}
    </span>
  );
}

function CellOutput({ cell }) {
  const out = cell.output;
  if (!out) return null;

  if (cell.type === "markdown" || out.kind === "preview") {
    return (
      <div className="expv2-cell__output expv2-cell__output--md">
        <pre>{out.data ?? cell.content}</pre>
      </div>
    );
  }

  if (out.kind === "stub") {
    return (
      <div className="expv2-cell__output expv2-cell__output--stub">
        {out.data}
      </div>
    );
  }

  // Agent-style structured output
  const data = out.data;
  if (data == null) {
    return (
      <div className="expv2-cell__output">
        <div className="expv2-cell__output-head">
          <span>Output</span>
        </div>
        <div style={{ color: "var(--dim)", fontStyle: "italic" }}>
          (응답 없음)
        </div>
      </div>
    );
  }
  const text =
    (typeof data === "string" && data) ||
    data.executive_summary ||
    data.dataset_summary ||
    data.orchestration_notes ||
    null;
  const list =
    (Array.isArray(data.key_findings) && data.key_findings) ||
    (Array.isArray(data.recommendations) && data.recommendations) ||
    (Array.isArray(data.recommended_preprocessing) &&
      data.recommended_preprocessing) ||
    null;

  return (
    <div className="expv2-cell__output">
      <div className="expv2-cell__output-head">
        <span>Output</span>
        {out.meta?.provider ? (
          <span>
            {out.meta.provider}
            {out.meta.model ? ` · ${out.meta.model}` : ""}
            {out.meta.usedRag ? " · RAG" : ""}
            {out.meta.elapsed_ms
              ? ` · ${Math.round(out.meta.elapsed_ms)}ms`
              : ""}
          </span>
        ) : null}
      </div>
      {text ? <p className="expv2-cell__output-text">{text}</p> : null}
      {list ? (
        <ul className="expv2-cell__output-list">
          {list.slice(0, 8).map((it, i) => (
            <li key={i}>
              {typeof it === "string" ? it : JSON.stringify(it)}
            </li>
          ))}
        </ul>
      ) : null}
      {!text && !list ? (
        <pre className="expv2-cell__output-pre">
          {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
