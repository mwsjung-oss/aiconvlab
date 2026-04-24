/**
 * ActivityWorkspace — 우측 80%
 *   - 헤더(활동 제목·커널 상태·히스토리 토글·우측 유틸)
 *   - 본문(Guide + [FileUploader] + CellList)
 *   - RunHistory 드로어
 */
import { useCallback, useMemo, useState } from "react";
import GuidePanel from "./GuidePanel.jsx";
import WorkCell from "./WorkCell.jsx";
import FileUploader from "./FileUploader.jsx";
import RunHistory from "./RunHistory.jsx";
import { apiJson } from "../../api.js";

export default function ActivityWorkspace({
  activity,
  stage,
  cells,
  activeCellId,
  onSetActiveCell,
  onPatchCell,
  onAddCell,
  onRemoveCell,
  onMoveCell,
  kernel,
  tracing,
  user,
  aiProvider = "openai",
  aiConfigured = false,
  onRefreshAiHealth,
}) {
  const [runningCellId, setRunningCellId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const userId = user?.email || "anon";

  const activityTraces = useMemo(
    () => (activity ? tracing.listFor(activity.id) : []),
    [activity, tracing]
  );

  const handleUsePromptTemplate = useCallback(
    (t) => {
      if (!activity) return;
      onAddCell(activity.id, "prompt", null, {
        content: t.body,
        title: t.label,
      });
    },
    [activity, onAddCell]
  );

  const handleUseCodeTemplate = useCallback(
    (t) => {
      if (!activity) return;
      onAddCell(activity.id, "code", null, {
        content: t.code,
        title: t.label,
      });
    },
    [activity, onAddCell]
  );

  const recordTrace = useCallback(
    (partial) => {
      if (!activity) return;
      tracing.record({
        ...partial,
        stage,
        activity_id: activity.id,
        userId,
      });
    },
    [activity, stage, tracing, userId]
  );

  const runCell = useCallback(
    async (cell) => {
      if (!activity) return;
      if (cell.type === "markdown") return;
      setRunningCellId(cell.id);
      onPatchCell(activity.id, cell.id, {
        status: "running",
        outputs: [],
        runAt: Date.now(),
      });
      const startedAt = Date.now();

      if (cell.type === "code") {
        await recordTrace({
          kind: "code",
          content: cell.content,
          cell_id: cell.id,
        });
        if (!kernel.status.ready) {
          await kernel.start();
        }
        const res = await kernel.execute(cell.content, {
          activityId: activity.id,
          cellId: cell.id,
        });
        const duration = Date.now() - startedAt;
        if (res.ok) {
          onPatchCell(activity.id, cell.id, {
            status: res.status === "error" ? "error" : "done",
            outputs: res.outputs || [],
            executionCount: res.execution_count ?? null,
            durationMs: duration,
          });
          await recordTrace({
            kind: res.status === "error" ? "error" : "result",
            content: summarizeOutputs(res.outputs) || "(no output)",
            outputs: res.outputs,
            execution_count: res.execution_count,
            duration_ms: duration,
            cell_id: cell.id,
          });
        } else {
          onPatchCell(activity.id, cell.id, {
            status: "error",
            outputs: [{ type: "error", data: res.error || "실행 실패" }],
            durationMs: duration,
          });
          await recordTrace({
            kind: "error",
            content: res.error || "실행 실패",
            duration_ms: duration,
            cell_id: cell.id,
          });
        }
      } else if (cell.type === "prompt" || cell.type === "sql") {
        await recordTrace({
          kind: "prompt",
          content: cell.content,
          cell_id: cell.id,
          metadata: { provider: aiProvider },
        });
        try {
          /* LLM 게이트웨이 호출. prompt 는 바로 ask, SQL 은 sql 요약 질문으로 래핑. */
          const msg =
            cell.type === "sql"
              ? `다음 SQL 을 해석하고 개선점이 있다면 제안해 주세요.\n\n${cell.content}`
              : cell.content;
          const resp = await apiJson("/api/chat/test", {
            method: "POST",
            body: { provider: aiProvider, message: msg },
          });
          const text =
            typeof resp?.response === "string"
              ? resp.response
              : JSON.stringify(resp, null, 2);
          const duration = Date.now() - startedAt;
          onPatchCell(activity.id, cell.id, {
            status: "done",
            outputs: [
              {
                type: "stream",
                data: text,
                meta: { provider: aiProvider, elapsed_ms: duration },
              },
            ],
            durationMs: duration,
          });
          await recordTrace({
            kind: "result",
            content: text.slice(0, 4000),
            duration_ms: duration,
            cell_id: cell.id,
            metadata: { provider: aiProvider },
          });
        } catch (e) {
          const duration = Date.now() - startedAt;
          const raw = e?.message || String(e);
          /* 서버가 OPENAI_API_KEY/GEMINI_API_KEY 를 못 찾아 400 으로
             돌려보내는 경우가 가장 흔한 실패 경로 — UI 에서 "무엇을
             해야 하는지" 바로 보이도록 힌트를 붙여 준다. */
          const looksLikeMissingKey = /OPENAI_API_KEY|GEMINI_API_KEY/i.test(raw);
          const hint = looksLikeMissingKey
            ? `\n\n[관리자 안내] Render 백엔드 환경변수에 ${
                aiProvider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"
              } 가 설정되어 있어야 합니다. 저장 후 재배포하면 즉시 동작합니다.`
            : "";
          onPatchCell(activity.id, cell.id, {
            status: "error",
            outputs: [{ type: "error", data: raw + hint }],
            durationMs: duration,
          });
          await recordTrace({
            kind: "error",
            content: raw,
            duration_ms: duration,
            cell_id: cell.id,
            metadata: { provider: aiProvider },
          });
          if (looksLikeMissingKey && typeof onRefreshAiHealth === "function") {
            onRefreshAiHealth();
          }
        }
      }

      setRunningCellId(null);
    },
    [activity, kernel, onPatchCell, recordTrace, aiProvider, onRefreshAiHealth]
  );

  const kernelChip = (() => {
    const s = kernel?.status;
    if (!s) return null;
    if (s.lastError) {
      return (
        <span className="expv3-chip expv3-chip--err" title={s.lastError}>
          <span className="expv3-dot" /> 커널 오류
        </span>
      );
    }
    if (s.busy) {
      return (
        <span className="expv3-chip expv3-chip--warn">
          <span className="expv3-dot" /> 실행 중
        </span>
      );
    }
    if (s.ready) {
      return (
        <span className="expv3-chip expv3-chip--ok" title={s.startupMsg || ""}>
          <span className="expv3-dot" /> 커널 준비됨
        </span>
      );
    }
    return (
      <span className="expv3-chip">
        <span className="expv3-dot" /> 커널 연결 안 됨
      </span>
    );
  })();

  if (!activity) {
    return (
      <main className="expv3-work">
        <div className="expv3-empty">좌측에서 활동을 선택해 주세요.</div>
      </main>
    );
  }

  const showUploader = stage === "data";

  return (
    <main className="expv3-work" aria-label="활동 작업 공간">
      <header className="expv3-work__head">
        <div className="expv3-work__head-title">{activity.title}</div>
        <div className="expv3-work__head-sub">{activity.overview}</div>
        <span className="expv3-work__head-spacer" />
        <span
          className={
            "expv3-chip " +
            (aiConfigured ? "expv3-chip--ok" : "expv3-chip--warn")
          }
          title={
            aiConfigured
              ? `현재 프롬프트는 ${aiProvider} 로 실행됩니다.`
              : `${aiProvider} API 키가 서버에 등록되어 있지 않습니다.`
          }
        >
          <span className="expv3-dot" /> AI: {aiProvider}
        </span>
        {kernelChip}
        <button
          type="button"
          className="expv3-btn expv3-btn--ghost expv3-btn--sm"
          onClick={() => kernel.start()}
          disabled={kernel?.status?.ready}
          title="Python 커널 시작"
        >
          커널 시작
        </button>
        <button
          type="button"
          className="expv3-btn expv3-btn--ghost expv3-btn--sm"
          onClick={() => kernel.interrupt()}
          disabled={!kernel?.status?.ready}
          title="실행 인터럽트"
        >
          인터럽트
        </button>
        <button
          type="button"
          className="expv3-btn expv3-btn--ghost expv3-btn--sm"
          onClick={() => setHistoryOpen((v) => !v)}
          title="이력 드로어"
        >
          이력 {activityTraces.length > 0 ? `· ${activityTraces.length}` : ""}
        </button>
      </header>

      <div className="expv3-work__body">
        <GuidePanel
          activity={activity}
          onUsePromptTemplate={handleUsePromptTemplate}
          onUseCodeTemplate={handleUseCodeTemplate}
        />

        {showUploader ? (
          <FileUploader
            kernel={kernel}
            onLoaded={(name) =>
              onAddCell(activity.id, "markdown", null, {
                title: "데이터 로드 기록",
                content: `업로드된 파일 **${name}** 이 커널에 \`df\` 로 로드되었습니다.\n다음 셀에서 \`df.head()\` 로 확인해 보세요.`,
              })
            }
            onTrace={recordTrace}
          />
        ) : null}

        <div className="expv3-cells">
          {cells.length === 0 ? (
            <div className="expv3-empty">
              셀이 없습니다. 아래에서 첫 셀을 추가하세요.
            </div>
          ) : (
            cells.map((cell) => (
              <WorkCell
                key={cell.id}
                cell={cell}
                isActive={cell.id === activeCellId}
                isRunning={runningCellId === cell.id}
                canRun={cell.type !== "markdown"}
                onFocus={() => onSetActiveCell(cell.id)}
                onPatch={(changes) => onPatchCell(activity.id, cell.id, changes)}
                onRun={runCell}
                onDelete={() => onRemoveCell(activity.id, cell.id)}
                onMove={(dir) => onMoveCell(activity.id, cell.id, dir)}
                onAddAfter={(type) => onAddCell(activity.id, type, cell.id)}
              />
            ))
          )}

          <div className="expv3-addcell" role="group" aria-label="셀 추가">
            <button
              className="expv3-addcell__btn"
              onClick={() => onAddCell(activity.id, "prompt")}
            >
              + Prompt
            </button>
            <button
              className="expv3-addcell__btn"
              onClick={() => onAddCell(activity.id, "code")}
            >
              + Code
            </button>
            <button
              className="expv3-addcell__btn"
              onClick={() => onAddCell(activity.id, "sql")}
            >
              + SQL
            </button>
            <button
              className="expv3-addcell__btn"
              onClick={() => onAddCell(activity.id, "markdown")}
            >
              + Markdown
            </button>
          </div>
        </div>
      </div>

      <RunHistory
        open={historyOpen}
        traces={activityTraces}
        onClose={() => setHistoryOpen(false)}
      />
    </main>
  );
}

function summarizeOutputs(outs) {
  if (!outs || outs.length === 0) return "";
  const parts = [];
  for (const o of outs) {
    if (o.type === "image_png") parts.push("[image]");
    else if (o.type === "html") parts.push("[html]");
    else parts.push(String(o.data ?? "").slice(0, 800));
  }
  return parts.join("\n").slice(0, 4000);
}
