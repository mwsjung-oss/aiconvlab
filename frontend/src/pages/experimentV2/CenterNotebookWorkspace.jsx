/**
 * CenterNotebookWorkspace
 * -------------------------------------------------------------
 * The dominant workspace. Contains:
 *   - NotebookHeader (title, selector, save status, Run All, Add Cell)
 *   - InstructionComposer (prominent NL instruction bar)
 *   - NotebookCellList
 */
import { useCallback, useRef, useState } from "react";
import NotebookCell from "./NotebookCell.jsx";
import { runAgent, safeCall } from "../../api/notebookApi.js";
import { formatRelative } from "./useExperimentV2State.js";

export default function CenterNotebookWorkspace({
  state,
  controller, // { patch, patchCell, addCell, removeCell, duplicateCell, moveCell, convertCell, setActiveCell, appendTimeline, appendChat, setResultSummary, markSaved }
  onRunAll,
  onSave,
}) {
  const {
    cells,
    activeCellId,
    notebookTitle,
    instructionDraft,
    isRunning,
    savedAt,
    dirty,
    agent,
    provider,
    useRag,
  } = state;

  const abortRef = useRef({});

  /* -------- per-cell run -------- */
  const runCell = useCallback(
    async (cellId) => {
      const cell = cells.find((c) => c.id === cellId);
      if (!cell) return;

      if (cell.type === "markdown") {
        controller.patchCell(cell.id, {
          status: "complete",
          output: { kind: "preview", data: cell.content },
        });
        controller.appendTimeline({
          actor: "user",
          type: "markdown",
          summary: `Markdown 미리보기: ${cell.title}`,
          relatedCellId: cell.id,
          status: "info",
        });
        return;
      }

      if (cell.type === "code" || cell.type === "sql") {
        controller.patchCell(cell.id, {
          status: "complete",
          output: {
            kind: "stub",
            data:
              cell.type === "code"
                ? "코드 실행 백엔드가 아직 연결되지 않았습니다. Python 러너는 backend TODO에 남겨 두었습니다."
                : "SQL 실행 엔진이 아직 연결되지 않았습니다. backend TODO에 남겨 두었습니다.",
          },
        });
        controller.appendTimeline({
          actor: "system",
          type: cell.type === "code" ? "code-run-stub" : "sql-run-stub",
          summary: `${cell.type.toUpperCase()} 셀은 실행 런너 대기 상태입니다`,
          relatedCellId: cell.id,
          status: "warn",
        });
        return;
      }

      if (cell.type === "result") {
        controller.appendTimeline({
          actor: "user",
          type: "note",
          summary: "결과 셀은 다른 셀의 출력으로 채워집니다.",
          relatedCellId: cell.id,
          status: "info",
        });
        return;
      }

      // Prompt cell — dispatch to backend /api/agent/run
      const ctrl = new AbortController();
      abortRef.current[cell.id] = ctrl;
      controller.patchCell(cell.id, {
        status: "running",
        output: null,
        logs: [
          ...(cell.logs || []),
          { ts: Date.now(), line: `→ agent=${agent} provider=${provider} rag=${useRag}` },
        ],
        metadata: { ...(cell.metadata || {}), errorMessage: null },
      });
      controller.appendTimeline({
        actor: "user",
        type: "request",
        summary: `프롬프트 실행: ${cell.title}`,
        detail: cell.content,
        relatedCellId: cell.id,
        status: "info",
      });
      controller.appendChat({
        role: "user",
        content: cell.content,
        relatedCellId: cell.id,
        compactSummary: cell.title,
      });

      const started = Date.now();
      const res = await safeCall(() =>
        runAgent({
          agent,
          task: cell.content,
          context: notebookTitle ? `Notebook: ${notebookTitle}` : undefined,
          provider,
          options: useRag ? { inner: "smart" } : undefined,
          signal: ctrl.signal,
        })
      );
      const elapsed_ms = Date.now() - started;

      if (!res.ok) {
        controller.patchCell(cell.id, {
          status: "error",
          metadata: { ...(cell.metadata || {}), errorMessage: res.error },
          logs: [
            ...(cell.logs || []),
            { ts: Date.now(), line: `✗ ${res.error}` },
          ],
        });
        controller.appendTimeline({
          actor: "agent",
          type: "error",
          summary: `프롬프트 실패: ${res.error}`,
          detail: res.error,
          relatedCellId: cell.id,
          status: "error",
        });
        return;
      }

      const payload = res.data;
      const meta = { ...(payload?.meta || {}), elapsed_ms, provider, usedRag: useRag };
      controller.patchCell(cell.id, {
        status: "complete",
        output: { kind: "agent", data: payload?.data, meta },
        logs: [
          ...(cell.logs || []),
          {
            ts: Date.now(),
            line: `✓ ${elapsed_ms}ms${
              payload?.meta?.model ? ` · model=${payload.meta.model}` : ""
            }`,
          },
        ],
      });
      const summary =
        payload?.data?.executive_summary ||
        payload?.data?.dataset_summary ||
        payload?.data?.orchestration_notes ||
        "(응답)";
      controller.appendChat({
        role: "agent",
        content: typeof summary === "string" ? summary : JSON.stringify(summary),
        relatedCellId: cell.id,
        compactSummary:
          typeof summary === "string"
            ? summary.slice(0, 160)
            : "(structured result)",
      });
      controller.appendTimeline({
        actor: "agent",
        type: "response",
        summary: `응답 수신 (${elapsed_ms}ms)`,
        detail:
          typeof summary === "string" ? summary : JSON.stringify(summary, null, 2),
        relatedCellId: cell.id,
        status: "ok",
      });
      controller.setResultSummary({
        cellId: cell.id,
        title: cell.title,
        summary,
        raw: payload?.data,
        meta,
      });
    },
    [cells, agent, provider, useRag, notebookTitle, controller]
  );

  /* -------- composer submit -------- */
  const submitInstruction = useCallback(async () => {
    const task = (instructionDraft || "").trim();
    if (!task) return;
    // Insert a new prompt cell at the end, carrying the draft, then run it.
    const newId = controller.addCell("prompt");
    controller.patchCell(newId, {
      title: truncateTitle(task),
      content: task,
    });
    controller.patch({ instructionDraft: "" });
    // Allow the state to propagate before running — simplest is to queue a microtask.
    queueMicrotask(() => runCell(newId));
  }, [instructionDraft, controller, runCell]);

  /* -------- run all -------- */
  const handleRunAll = useCallback(async () => {
    if (onRunAll) return onRunAll();
    controller.patch({ isRunning: true });
    for (const c of cells) {
      if (c.type === "prompt" || c.type === "code" || c.type === "sql") {
        // eslint-disable-next-line no-await-in-loop
        await runCell(c.id);
      }
    }
    controller.patch({ isRunning: false });
  }, [onRunAll, cells, runCell, controller]);

  return (
    <main className="expv2-center" aria-label="노트북 작업 공간">
      {/* Notebook header */}
      <header className="expv2-center__head">
        <div className="expv2-center__head-left">
          <span className="expv2-center__head-title">📓</span>
          <input
            type="text"
            value={notebookTitle}
            onChange={(e) =>
              controller.patch({ notebookTitle: e.target.value })
            }
            placeholder="노트북 제목"
            className="expv2-top__title-input"
            style={{ fontSize: 15 }}
            aria-label="노트북 제목"
          />
        </div>
        <div className="expv2-center__head-sub">
          {dirty ? (
            <span className="expv2-chip expv2-chip--warn">미저장</span>
          ) : savedAt ? (
            <span className="expv2-chip expv2-chip--ok">
              저장됨 · {formatRelative(savedAt)}
            </span>
          ) : (
            <span className="expv2-chip">새 노트북</span>
          )}
          <span style={{ marginLeft: 10 }}>
            {cells.length}개 셀 · {isRunning ? "실행 중…" : "대기"}
          </span>
        </div>
        <div className="expv2-center__head-spacer" />
        <div className="expv2-top__actions">
          <button
            type="button"
            className="expv2-btn"
            onClick={() => controller.addCell("markdown")}
          >
            + Markdown
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() => controller.addCell("code")}
          >
            + Code
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() => controller.addCell("sql")}
          >
            + SQL
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() => controller.addCell("prompt")}
          >
            + Prompt
          </button>
          <span style={{ width: 8 }} />
          <button
            type="button"
            className="expv2-btn"
            onClick={onSave}
            title="현재 노트북을 로컬에 저장"
          >
            저장
          </button>
          <button
            type="button"
            className="expv2-btn expv2-btn--primary"
            onClick={handleRunAll}
            disabled={isRunning}
          >
            {isRunning ? "실행 중…" : "▶ 전체 실행"}
          </button>
        </div>
      </header>

      {/* Instruction composer */}
      <InstructionComposer
        value={instructionDraft}
        onChange={(v) => controller.patch({ instructionDraft: v })}
        onSubmit={submitInstruction}
        disabled={isRunning}
      />

      {/* Cell list */}
      <div className="expv2-cells">
        {cells.length === 0 ? (
          <div className="expv2-empty">셀이 없습니다. 상단에서 셀을 추가하세요.</div>
        ) : null}
        {cells.map((cell, idx) => (
          <NotebookCell
            key={cell.id}
            cell={cell}
            index={idx}
            total={cells.length}
            isActive={cell.id === activeCellId}
            onFocus={() => controller.setActiveCell(cell.id)}
            onPatch={(changes) => controller.patchCell(cell.id, changes)}
            onRun={runCell}
            onDuplicate={controller.duplicateCell}
            onDelete={controller.removeCell}
            onMove={controller.moveCell}
            onConvert={controller.convertCell}
            onAddAfter={(afterId, type) => controller.addCell(type, afterId)}
          />
        ))}

        {/* Always-visible trailing add-cell bar */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
          <div
            style={{
              display: "inline-flex",
              gap: 6,
              padding: 3,
              border: "1px dashed var(--border)",
              borderRadius: 999,
            }}
          >
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={() => controller.addCell("prompt")}
            >
              + Prompt
            </button>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={() => controller.addCell("code")}
            >
              + Code
            </button>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={() => controller.addCell("sql")}
            >
              + SQL
            </button>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={() => controller.addCell("markdown")}
            >
              + Markdown
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function InstructionComposer({ value, onChange, onSubmit, disabled }) {
  const [hovering, setHovering] = useState(false);
  return (
    <div
      className="expv2-compose"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <textarea
        className="expv2-compose__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={
          "자연어로 실험 지시를 입력하세요. (Cmd/Ctrl+Enter로 실행) · 예: '이진 분류 파이프라인 초안'"
        }
        rows={1}
      />
      <button
        type="button"
        className="expv2-btn expv2-btn--primary expv2-compose__send"
        disabled={disabled || !(value || "").trim()}
        onClick={onSubmit}
        title="Cmd/Ctrl + Enter"
      >
        ▶ Run
      </button>
      {hovering ? (
        <div className="expv2-compose__hint">
          제출하면 새 Prompt 셀이 생성되고 즉시 실행됩니다.
        </div>
      ) : null}
    </div>
  );
}

function truncateTitle(s) {
  const t = String(s || "").split("\n")[0].trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t || "프롬프트";
}
