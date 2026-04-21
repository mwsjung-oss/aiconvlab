/**
 * Contextual AI helper embedded inside every step block.
 *
 * Each caller defines a list of inline actions keyed to:
 *   - a target agent name (data | model | report | experiment | smart)
 *   - a prompt/context builder closure so the block can inject the current
 *     block-local state at call time
 *
 * When executed, the helper calls `runAgent` (see `src/api/notebookApi.js`)
 * and forwards the `output` payload to `onResult`, which typically pushes it
 * onto the block's local state via the notebook store.
 */
import { useCallback, useState } from "react";
import { runAgent } from "../../../api/notebookApi";

export default function ContextualAIAssist({
  blockKey,
  actions = [],
  provider = "openai",
  useRag = true,
  onResult,
  footerMeta = null,
}) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);

  const execute = useCallback(
    async (action) => {
      if (!action) return;
      setBusyId(action.id);
      setError("");
      try {
        const { task, context, agent, options } = action.build?.() || {};
        if (!task || !task.trim()) {
          setError("실행에 필요한 task 텍스트가 비어 있습니다.");
          return;
        }
        const body = {
          agent: useRag ? "smart" : agent || "data",
          task,
          context,
          provider,
        };
        if (useRag) {
          body.options = {
            inner: agent || "data",
            top_k: options?.topK ?? 4,
            min_score: options?.minScore ?? 0,
          };
        }
        const data = await runAgent(body);
        setMeta({
          provider: data?.provider,
          model: data?.model,
          elapsedMs: data?.elapsed_ms,
          usedRag: !!data?.used_rag,
          agent: data?.agent,
        });
        // For smart agent, unwrap inner_output so the block-level cards can
        // render the structured fields the same way as a direct agent call.
        let output = data?.output;
        if (output && output.inner_output) {
          output = {
            ...output.inner_output,
            _retrieved_sources: output.retrieved_sources || [],
          };
        }
        onResult?.(output, {
          provider: data?.provider,
          model: data?.model,
          elapsedMs: data?.elapsed_ms,
          usedRag: !!data?.used_rag,
          agent: data?.agent,
          sources: output?._retrieved_sources || [],
        });
      } catch (err) {
        setError(String(err?.message || err) || "AI 호출 실패");
      } finally {
        setBusyId(null);
      }
    },
    [onResult, provider, useRag]
  );

  if (!actions.length) return null;

  return (
    <div
      className="notebook-aiassist"
      role="group"
      aria-label={`${blockKey} AI 어시스트`}
    >
      <div className="notebook-aiassist__title">
        <span className="notebook-aiassist__sparkle" aria-hidden="true">✨</span>
        AI 어시스트
        <span style={{ fontSize: 11, color: "var(--nc-muted)", fontWeight: 400 }}>
          {useRag ? "RAG 컨텍스트 사용" : "RAG 미사용"}
        </span>
      </div>
      <div className="notebook-aiassist__actions">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="notebook-aiassist__action"
            disabled={busyId !== null}
            onClick={() => execute(a)}
            title={a.hint || a.label}
          >
            {busyId === a.id ? "⟳ " : a.icon ? `${a.icon} ` : ""}
            {a.label}
          </button>
        ))}
      </div>
      {error ? <div className="notebook-aiassist__error">{error}</div> : null}
      {(meta || footerMeta) && !error ? (
        <div className="notebook-aiassist__meta">
          {meta?.provider ? <span>provider: {meta.provider}</span> : null}
          {meta?.model ? <span>model: {meta.model}</span> : null}
          {typeof meta?.elapsedMs === "number" ? (
            <span>elapsed: {meta.elapsedMs} ms</span>
          ) : null}
          {meta?.usedRag ? <span>RAG: on</span> : null}
          {footerMeta}
        </div>
      ) : null}
    </div>
  );
}
