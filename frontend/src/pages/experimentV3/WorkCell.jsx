/**
 * WorkCell — V3 실험 셀
 *   타입: prompt | code | markdown | sql
 *   상단: 타입 배지, 실행 카운트, 제목, 이동/복제/삭제 아이콘, 실행 버튼
 *   본문: textarea
 *   하단: outputs (stream/display_data/execute_result/error 렌더)
 */
import { useCallback } from "react";

function OutputsRenderer({ outputs }) {
  if (!outputs || outputs.length === 0) return null;
  return (
    <div className="expv3-cell__output">
      {outputs.map((out, i) => {
        if (out.type === "error") {
          return (
            <pre key={i} className="expv3-cell__error">
              {out.data}
            </pre>
          );
        }
        if (out.type === "image_png") {
          const src = `data:image/png;base64,${out.data}`;
          return (
            <img
              key={i}
              src={src}
              alt="output figure"
              loading="lazy"
            />
          );
        }
        if (out.type === "html") {
          // eslint-disable-next-line react/no-danger
          return (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: out.data }}
            />
          );
        }
        /* stream / text / execute_result */
        return <pre key={i}>{String(out.data ?? "")}</pre>;
      })}
    </div>
  );
}

export default function WorkCell({
  cell,
  isActive,
  isRunning,
  canRun,
  onFocus,
  onPatch,
  onRun,
  onDelete,
  onMove,
  onAddAfter,
}) {
  const statusClass =
    cell.status === "running"
      ? "expv3-cell expv3-cell--running"
      : cell.status === "error"
      ? "expv3-cell expv3-cell--error"
      : isActive
      ? "expv3-cell expv3-cell--active"
      : "expv3-cell";

  const badgeClass = `expv3-cell__badge expv3-cell__badge--${cell.type}`;
  const taClass = `expv3-cell__textarea expv3-cell__textarea--${cell.type}`;

  const titleReadOnly = cell.type === "prompt" || cell.type === "sql";
  const staticTitle =
    (cell.title && String(cell.title).trim()) ||
    (cell.type === "sql" ? "SQL" : "프롬프트");

  const onKeyDown = useCallback(
    (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canRun) onRun(cell);
      }
    },
    [canRun, onRun, cell]
  );

  return (
    <div
      className={statusClass}
      data-cell-id={cell.id}
      onFocus={onFocus}
    >
      <div className="expv3-cell__head">
        <span className={badgeClass}>{cell.type}</span>
        <span className="expv3-cell__run-count" title="실행 횟수">
          [{cell.executionCount ?? " "}]
        </span>
        {titleReadOnly ? (
          <span
            className="expv3-cell__title expv3-cell__title--static"
            title="질문·지시는 아래 본문에만 입력하세요. 이 줄은 셀 구분용 이름입니다 (템플릿/활동에서 자동 지정될 수 있음)."
            aria-label="셀 이름(읽기 전용)"
          >
            {staticTitle}
          </span>
        ) : (
          <input
            className="expv3-cell__title"
            value={cell.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            placeholder="셀 제목"
            aria-label="셀 제목"
          />
        )}
        <div className="expv3-cell__tools">
          <button
            type="button"
            className="expv3-cell__tool"
            onClick={() => onMove("up")}
            title="위로"
            aria-label="위로"
          >
            ▲
          </button>
          <button
            type="button"
            className="expv3-cell__tool"
            onClick={() => onMove("down")}
            title="아래로"
            aria-label="아래로"
          >
            ▼
          </button>
          <button
            type="button"
            className="expv3-cell__tool"
            onClick={() => onDelete()}
            title="삭제"
            aria-label="삭제"
          >
            🗑
          </button>
        </div>
        {cell.type === "markdown" ? null : (
          <button
            type="button"
            className="expv3-cell__run"
            onClick={() => onRun(cell)}
            disabled={!canRun || isRunning}
            title="실행 (Cmd/Ctrl + Enter)"
          >
            {isRunning ? "실행 중…" : "실행 ▶"}
          </button>
        )}
      </div>

      <div className="expv3-cell__body">
        <textarea
          className={taClass}
          value={cell.content}
          onChange={(e) => onPatch({ content: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder={placeholderFor(cell.type)}
          rows={Math.max(2, Math.min(18, (cell.content || "").split("\n").length))}
          spellCheck={cell.type === "markdown" || cell.type === "prompt"}
        />
      </div>

      <OutputsRenderer outputs={cell.outputs} />
    </div>
  );
}

function placeholderFor(type) {
  switch (type) {
    case "code":
      return "# Python 코드\nimport pandas as pd";
    case "sql":
      return "-- SQL 쿼리\nSELECT * FROM ...";
    case "markdown":
      return "## 마크다운 노트";
    case "prompt":
    default:
      return "자연어 프롬프트를 입력하세요. (Cmd/Ctrl+Enter 로 실행)";
  }
}
