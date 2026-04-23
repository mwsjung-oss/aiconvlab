/**
 * CenterNotebookWorkspace
 * -------------------------------------------------------------
 * The dominant workspace. Contains:
 *   - NotebookHeader (title, selector, save status, Run All, Add Cell)
 *   - InstructionComposer (prominent NL instruction bar)
 *   - NotebookCellList
 */
import { useCallback, useEffect, useRef, useState } from "react";
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

  /* ------------------------------------------------------------
     Left-side scroll rail
     ------------------------------------------------------------
     노트북 셀 목록이 세로로 넘칠 때, 실험 창 좌측에 "위/아래" 버튼을
     띄워 한 손으로도 빠르게 이동할 수 있게 한다. overflow 상태는
     ResizeObserver + scroll 이벤트로 실시간 추적한다. */
  const cellsRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    overflow: false,
    atTop: true,
    atBottom: true,
  });

  const updateScrollState = useCallback(() => {
    const el = cellsRef.current;
    if (!el) return;
    const overflow = el.scrollHeight - el.clientHeight > 4;
    const atTop = el.scrollTop <= 2;
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setScrollState((prev) =>
      prev.overflow === overflow &&
      prev.atTop === atTop &&
      prev.atBottom === atBottom
        ? prev
        : { overflow, atTop, atBottom }
    );
  }, []);

  useEffect(() => {
    const el = cellsRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => updateScrollState());
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    }
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      if (ro) ro.disconnect();
    };
  }, [updateScrollState, cells.length]);

  const scrollBy = useCallback((direction) => {
    const el = cellsRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientHeight * 0.6));
    el.scrollBy({ top: direction === "up" ? -step : step, behavior: "smooth" });
  }, []);

  /* 버튼을 누르고 있는 동안 연속 스크롤. */
  const holdTimerRef = useRef(null);
  const startHoldScroll = useCallback(
    (direction) => {
      scrollBy(direction);
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      holdTimerRef.current = setInterval(() => scrollBy(direction), 260);
    },
    [scrollBy]
  );
  const stopHoldScroll = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  /* ------------------------------------------------------------
     Drag-to-scroll (grab & pan)
     ------------------------------------------------------------
     셀 목록 영역의 빈 공간을 눌러 끌면 세로 스크롤이 이동한다.
     textarea / input / button / select 등 인터랙티브 요소에서 시작한
     pointerdown 은 무시하여 텍스트 편집·버튼 클릭을 방해하지 않는다.
     터치 입력(pointerType === "touch") 은 브라우저 기본 스와이프에
     위임한다. 4px 미만의 이동은 "클릭"으로 간주해 drag 모드에 진입하지
     않는다 → 우발적 선택·포커스 손실을 방지. */
  const dragRef = useRef(null);
  const INTERACTIVE_SELECTOR =
    'textarea, input, select, button, a, [contenteditable="true"], ' +
    ".expv2-scrollrail, .expv2-cell-insert";

  const onCellsPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.pointerType === "touch") return;
    const target = e.target;
    if (target && target.closest && target.closest(INTERACTIVE_SELECTOR))
      return;
    const el = cellsRef.current;
    if (!el) return;
    dragRef.current = {
      startY: e.clientY,
      startScrollTop: el.scrollTop,
      pointerId: e.pointerId,
      active: false,
    };
  }, []);

  const onCellsPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) < 4) return;
      d.active = true;
      try {
        cellsRef.current?.setPointerCapture?.(d.pointerId);
      } catch (_err) {
        /* noop — 일부 브라우저에서 pointerCapture 실패해도 동작 계속 */
      }
      document.body.classList.add("expv2-dragging");
    }
    e.preventDefault();
    if (cellsRef.current) {
      cellsRef.current.scrollTop = d.startScrollTop - dy;
    }
  }, []);

  const endCellsDrag = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.active) {
      try {
        cellsRef.current?.releasePointerCapture?.(d.pointerId);
      } catch (_err) {
        /* noop */
      }
      document.body.classList.remove("expv2-dragging");
    }
    dragRef.current = null;
    if (e) {
      /* 드래그가 실제로 발생했다면 click 이벤트를 한 번 삼켜 텍스트가
         선택되거나 하위 버튼이 트리거되는 것을 방지한다. */
    }
  }, []);

  /* ------------------------------------------------------------
     Wheel redirector
     ------------------------------------------------------------
     헤더·Composer·말미 삽입 바처럼 `.expv2-cells` 바깥 영역에서 마우스
     휠을 돌려도 셀 목록이 스크롤되도록 delta 를 리디렉션한다.
     이미 `.expv2-cells` 내부에서 발생한 이벤트거나, textarea·select 같이
     자체 휠 스크롤이 의미 있는 요소에서는 브라우저 기본 동작에 맡긴다.
     React 의 onWheel 은 일부 환경에서 passive 로 등록되어 preventDefault
     가 무시될 수 있으므로 native addEventListener({passive:false}) 를
     사용한다. */
  const mainRef = useRef(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const handler = (e) => {
      const cellsEl = cellsRef.current;
      if (!cellsEl) return;
      const t = e.target;
      if (
        t &&
        t.closest &&
        t.closest(".expv2-cells, textarea, select, .expv2-compose__textarea")
      ) {
        return;
      }
      const canScroll = cellsEl.scrollHeight - cellsEl.clientHeight > 2;
      if (!canScroll) return;
      if (e.deltaY === 0) return;
      cellsEl.scrollTop += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

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
    <main
      className="expv2-center"
      aria-label="노트북 작업 공간"
      ref={mainRef}
    >
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

      {/* Cell list + 좌측 스크롤 레일
         overflow 시에만 위/아래 버튼이 노출된다. 버튼을 누르면 0.6 화면
         높이만큼 부드럽게 스크롤, 길게 누르면 260ms 주기로 연속 스크롤. */}
      <div className="expv2-cells-wrap">
        {scrollState.overflow ? (
          <div
            className="expv2-scrollrail"
            role="toolbar"
            aria-label="노트북 셀 스크롤"
          >
            <button
              type="button"
              className="expv2-scrollrail__btn"
              onClick={() => scrollBy("up")}
              onPointerDown={() => startHoldScroll("up")}
              onPointerUp={stopHoldScroll}
              onPointerLeave={stopHoldScroll}
              onPointerCancel={stopHoldScroll}
              disabled={scrollState.atTop}
              aria-label="위로 스크롤"
              title="위로 (더블클릭: 맨 위)"
              onDoubleClick={() =>
                cellsRef.current?.scrollTo({ top: 0, behavior: "smooth" })
              }
            >
              ▲
            </button>
            <button
              type="button"
              className="expv2-scrollrail__btn"
              onClick={() => scrollBy("down")}
              onPointerDown={() => startHoldScroll("down")}
              onPointerUp={stopHoldScroll}
              onPointerLeave={stopHoldScroll}
              onPointerCancel={stopHoldScroll}
              disabled={scrollState.atBottom}
              aria-label="아래로 스크롤"
              title="아래로 (더블클릭: 맨 아래)"
              onDoubleClick={() =>
                cellsRef.current?.scrollTo({
                  top: cellsRef.current.scrollHeight,
                  behavior: "smooth",
                })
              }
            >
              ▼
            </button>
          </div>
        ) : null}
      <div
        className="expv2-cells"
        ref={cellsRef}
        onPointerDown={onCellsPointerDown}
        onPointerMove={onCellsPointerMove}
        onPointerUp={endCellsDrag}
        onPointerCancel={endCellsDrag}
      >
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
