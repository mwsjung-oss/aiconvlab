/**
 * Knowledge drawer — the user-facing surface for the RAG subsystem.
 *
 * Features:
 *   - Free-text query → /api/rag/query (answer + retrieved sources)
 *   - Mode switch: `answer` (LLM-grounded) vs `search` (retrieval only)
 *   - Collapsible source cards with score/source badges + "전체 보기" toggle
 *   - Collection stats via /api/rag/stats
 */
import { useCallback, useEffect, useState } from "react";
import { NButton, Chip } from "./primitives.jsx";
import {
  queryKnowledge,
  knowledgeStats,
  safeCall,
} from "../../../api/notebookApi.js";

export default function KnowledgeDrawer({ open, onClose, provider = "openai" }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("answer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);

  const refreshStats = useCallback(async () => {
    const r = await safeCall(() => knowledgeStats());
    if (r.ok) setStats(r.data);
  }, []);

  useEffect(() => {
    if (open) {
      void refreshStats();
    }
  }, [open, refreshStats]);

  const run = useCallback(async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await queryKnowledge({
        query: query.trim(),
        mode,
        provider,
        topK: 4,
      });
      setResult(res);
    } catch (err) {
      setError(String(err?.message || err) || "요청 실패");
    } finally {
      setBusy(false);
    }
  }, [query, mode, provider]);

  if (!open) return null;

  return (
    <aside
      className="notebook-knowledge"
      role="dialog"
      aria-label="Knowledge Base"
    >
      <div className="notebook-knowledge__head">
        <strong style={{ fontSize: 14 }}>🗂 Knowledge</strong>
        {stats?.collection ? (
          <Chip kind="info" title="컬렉션 · 문서 수">
            {stats.collection} · {stats.count}
          </Chip>
        ) : null}
        <span className="notebook-canvas__toolbar-spacer" />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{
            background: "var(--nc-elevated)",
            border: "1px solid var(--nc-border)",
            color: "var(--nc-text)",
            borderRadius: 6,
            padding: "3px 6px",
            fontSize: 12,
          }}
          aria-label="질의 모드"
        >
          <option value="answer">Answer (LLM)</option>
          <option value="search">Search only</option>
        </select>
        <NButton variant="ghost" onClick={onClose} aria-label="닫기">
          ✕
        </NButton>
      </div>

      <div className="notebook-knowledge__body">
        {error ? (
          <div className="notebook-aiassist__error">{error}</div>
        ) : null}

        {result && mode === "answer" && result.answer ? (
          <div className="notebook-knowledge__answer">
            <strong style={{ fontSize: 12, color: "#93c5fd" }}>답변</strong>
            <div style={{ marginTop: 4 }}>{result.answer}</div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "var(--nc-muted)",
              }}
            >
              provider: {result.provider} · model: {result.model} · elapsed:{" "}
              {result.elapsed_ms} ms
            </div>
          </div>
        ) : null}

        {Array.isArray(result?.sources) && result.sources.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--nc-text-secondary)",
                fontWeight: 600,
              }}
            >
              관련 컨텍스트 · {result.sources.length}건
            </div>
            {result.sources.map((s, i) => (
              <SourceCard key={s.id || i} index={i + 1} source={s} />
            ))}
          </div>
        ) : result && !busy ? (
          <div className="notebook-empty">
            관련 문서를 찾지 못했습니다. 다른 질의를 시도해 보세요.
          </div>
        ) : null}

        {!result && !busy ? (
          <div className="notebook-empty">
            검색어를 입력하면 지식베이스에서 관련 문서와 근거 기반 답변을
            불러옵니다.
          </div>
        ) : null}
      </div>

      <form
        className="notebook-knowledge__form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          type="text"
          placeholder="무엇이 궁금한가요? (예: RAG 시스템 구조는?)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="질의 입력"
        />
        <NButton
          type="submit"
          variant="primary"
          disabled={busy || !query.trim()}
          icon={busy ? "⟳" : "➜"}
        >
          {busy ? "검색 중" : "검색"}
        </NButton>
      </form>
    </aside>
  );
}

function SourceCard({ index, source }) {
  const [open, setOpen] = useState(false);
  const src =
    source.metadata?.source ||
    source.metadata?.filename ||
    source.metadata?.topic ||
    "unknown";
  const score =
    typeof source.score === "number" ? source.score.toFixed(2) : "—";
  const text = source.text || source.snippet || "";
  return (
    <div className="notebook-knowledge__card">
      <div className="notebook-knowledge__card-head">
        <span>[{index}]</span>
        <span className="notebook-knowledge__card-badge">score {score}</span>
        <span style={{ color: "var(--nc-muted)" }}>src: {src}</span>
      </div>
      <div
        className={`notebook-knowledge__card-text ${
          open ? "notebook-knowledge__card-text--open" : ""
        }`}
      >
        {text}
      </div>
      {text.length > 140 ? (
        <button
          type="button"
          className="notebook-knowledge__card-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "접기" : "전체 보기"}
        </button>
      ) : null}
    </div>
  );
}
