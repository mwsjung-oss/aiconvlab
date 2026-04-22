/**
 * DynamicCell — Colab-style ad-hoc cell appended under the 6 fixed blocks.
 *
 * Supported types:
 *   - prompt   : natural-language instruction → sent to the currently selected
 *                agent via /api/agent/run. Output renders inline (markdown-ish).
 *   - markdown : rendered as read-only preview when not editing. Pure note cell.
 *   - code     : Python snippet. Execution is stubbed for now — we keep the
 *                structure so a backend notebook engine can wire in later.
 *   - sql      : SQL snippet. Same stub semantics as code.
 */
import { useCallback, useState } from "react";
import { NButton, Chip } from "./primitives.jsx";
import { runAgent } from "../../../api/notebookApi.js";
import { formatRelative } from "./useNotebookState.js";

const TYPE_LABEL = {
  prompt: "Prompt",
  markdown: "Markdown",
  code: "Python",
  sql: "SQL",
};

const TYPE_ICON = {
  prompt: "💬",
  markdown: "📝",
  code: "🐍",
  sql: "🗄",
};

export default function DynamicCell({
  cell,
  index,
  total,
  provider = "openai",
  activeAgent = "smart",
  useRag = true,
  onPatch,
  onRemove,
  onMove,
  onTimeline,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const updateContent = useCallback(
    (value) => onPatch({ content: value }),
    [onPatch]
  );

  const updateTitle = useCallback(
    (value) => onPatch({ title: value }),
    [onPatch]
  );

  /** Executes the cell. Prompt → LLM gateway; code/sql → local stub (scaffold). */
  const runCell = useCallback(async () => {
    setErr("");
    setBusy(true);
    onPatch({ status: "running", ts: Date.now() });
    onTimeline?.({
      actor: "user",
      eventType: "cell_run",
      summary: `${TYPE_LABEL[cell.type] || cell.type} 셀 실행: ${cell.title || "(제목 없음)"}`,
      status: "info",
      ref: { cellId: cell.id },
    });
    try {
      if (cell.type === "prompt") {
        const result = await runAgent({
          agent: activeAgent,
          task: cell.content || "",
          context: {
            source: "dynamic_cell",
            cellTitle: cell.title,
          },
          provider,
          options: { use_rag: useRag },
        });
        onPatch({
          status: "completed",
          output: {
            kind: "agent",
            data: result?.output ?? null,
            meta: {
              provider: result?.provider,
              model: result?.model,
              elapsed_ms: result?.elapsed_ms,
              usedRag: !!useRag,
            },
          },
          ts: Date.now(),
        });
        onTimeline?.({
          actor: "agent",
          eventType: "suggestion",
          summary: `Prompt 응답 수신 · ${activeAgent}`,
          detail:
            typeof result?.output === "string"
              ? result.output
              : result?.output,
          status: "ok",
          ref: { cellId: cell.id, agent: activeAgent, provider },
        });
      } else if (cell.type === "markdown") {
        onPatch({
          status: "completed",
          output: { kind: "preview", data: cell.content },
          ts: Date.now(),
        });
      } else {
        // code / sql — scaffold only; surface a friendly "not connected" note.
        onPatch({
          status: "completed",
          output: {
            kind: "stub",
            data:
              "⚠ 코드 실행 엔진이 아직 연결되지 않았습니다. (백엔드 Notebook runner 연동 예정)\n저장된 스니펫은 노트북 상태와 함께 영속화됩니다.",
          },
          ts: Date.now(),
        });
      }
    } catch (ex) {
      const msg = ex?.message || String(ex);
      setErr(msg);
      onPatch({ status: "failed", ts: Date.now() });
      onTimeline?.({
        actor: "system",
        eventType: "error",
        summary: `셀 실행 실패: ${cell.title || cell.id}`,
        detail: msg,
        status: "err",
        ref: { cellId: cell.id },
      });
    } finally {
      setBusy(false);
    }
  }, [cell, onPatch, onTimeline, provider, activeAgent, useRag]);

  return (
    <section
      className={`notebook-cell notebook-cell--${cell.type}`}
      aria-label={`${TYPE_LABEL[cell.type] || cell.type} 셀`}
    >
      <header className="notebook-cell__head">
        <span className="notebook-cell__type" aria-hidden="true">
          {TYPE_ICON[cell.type] || "•"} {TYPE_LABEL[cell.type] || cell.type}
        </span>
        <input
          type="text"
          className="notebook-cell__title"
          value={cell.title}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="셀 제목"
          aria-label="셀 제목"
        />
        <StatusChip status={cell.status} />
        <div className="notebook-cell__head-actions">
          <NButton
            variant="ghost"
            icon="▲"
            onClick={() => onMove(cell.id, "up")}
            disabled={index === 0}
            title="위로 이동"
          />
          <NButton
            variant="ghost"
            icon="▼"
            onClick={() => onMove(cell.id, "down")}
            disabled={index >= total - 1}
            title="아래로 이동"
          />
          <NButton
            variant="ghost"
            icon="🗑"
            onClick={() => {
              if (window.confirm("이 셀을 삭제할까요?")) onRemove(cell.id);
            }}
            title="셀 삭제"
          />
        </div>
      </header>

      <div className="notebook-cell__editor">
        <textarea
          value={cell.content}
          onChange={(e) => updateContent(e.target.value)}
          rows={Math.min(
            10,
            Math.max(3, (cell.content || "").split("\n").length)
          )}
          className={`notebook-cell__textarea notebook-cell__textarea--${cell.type}`}
          spellCheck={cell.type === "markdown" || cell.type === "prompt"}
          placeholder={
            cell.type === "prompt"
              ? "자연어 지시를 입력하세요."
              : cell.type === "markdown"
                ? "마크다운/메모를 작성하세요."
                : cell.type === "code"
                  ? "# Python"
                  : "-- SQL"
          }
          aria-label={`${TYPE_LABEL[cell.type]} 편집 영역`}
        />
      </div>

      <footer className="notebook-cell__foot">
        <span className="notebook-cell__hint">
          {cell.type === "prompt"
            ? `현재 Agent: ${activeAgent}${useRag ? " · RAG" : ""}`
            : cell.type === "markdown"
              ? "실행 시 읽기 전용 미리보기를 생성합니다."
              : "실행 엔진 미연결 — 저장은 정상 동작"}
        </span>
        <span className="notebook-cell__spacer" />
        {cell.ts ? (
          <span className="notebook-cell__ts" title={new Date(cell.ts).toLocaleString()}>
            {formatRelative(cell.ts)}
          </span>
        ) : null}
        <NButton
          variant="primary"
          icon={busy ? "⏳" : "▶"}
          onClick={runCell}
          disabled={busy}
        >
          {busy ? "실행 중" : "Run"}
        </NButton>
      </footer>

      {err ? (
        <div className="notebook-cell__error">⚠ {err}</div>
      ) : null}

      {cell.output ? <DynamicCellOutput output={cell.output} /> : null}
    </section>
  );
}

function StatusChip({ status }) {
  const map = {
    idle: { kind: "info", label: "대기" },
    running: { kind: "info", label: "실행 중" },
    completed: { kind: "ok", label: "완료" },
    failed: { kind: "err", label: "실패" },
  };
  const m = map[status] || map.idle;
  return <Chip kind={m.kind}>{m.label}</Chip>;
}

function DynamicCellOutput({ output }) {
  if (!output) return null;
  if (output.kind === "preview") {
    return (
      <div className="notebook-cell__output notebook-cell__output--markdown">
        <pre className="notebook-cell__output-md">{output.data || ""}</pre>
      </div>
    );
  }
  if (output.kind === "stub") {
    return (
      <div className="notebook-cell__output notebook-cell__output--stub">
        {output.data}
      </div>
    );
  }
  // agent output — render key pieces if structured, else JSON.
  const data = output.data;
  if (data == null) {
    return (
      <div className="notebook-cell__output notebook-cell__output--empty">
        (응답 없음)
      </div>
    );
  }
  if (typeof data === "string") {
    return (
      <div className="notebook-cell__output notebook-cell__output--agent">
        <pre className="notebook-cell__output-md">{data}</pre>
      </div>
    );
  }
  const text =
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
    <div className="notebook-cell__output notebook-cell__output--agent">
      {output.meta?.provider ? (
        <div className="notebook-cell__output-meta">
          {output.meta.provider}
          {output.meta.model ? ` · ${output.meta.model}` : ""}
          {output.meta.usedRag ? " · RAG" : ""}
          {output.meta.elapsed_ms
            ? ` · ${Math.round(output.meta.elapsed_ms)}ms`
            : ""}
        </div>
      ) : null}
      {text ? <p className="notebook-cell__output-text">{text}</p> : null}
      {list ? (
        <ul className="notebook-cell__output-list">
          {list.slice(0, 8).map((it, i) => (
            <li key={i}>{typeof it === "string" ? it : JSON.stringify(it)}</li>
          ))}
        </ul>
      ) : null}
      {!text && !list ? (
        <pre className="notebook-cell__output-pre">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
