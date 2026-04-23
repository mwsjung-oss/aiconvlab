/**
 * LeftAgentSidebar — intentionally minimal.
 *
 * Sections:
 *   1. Agent selector (Smart / Data / Model / Report / General)
 *   2. Compact recent chat (last 5 entries)
 *   3. Current experiment context summary
 *   4. Small Quick Action chips
 *
 * Hard rules from the brief:
 *   - No messenger-style big chat surface
 *   - No oversized controls
 *   - Must never visually compete with the center notebook
 *   - Collapsible into icons-only mode
 */
import { formatRelative } from "./useExperimentV2State.js";

const AGENT_OPTIONS = [
  { value: "smart", label: "Smart · RAG" },
  { value: "data", label: "Data Agent" },
  { value: "model", label: "Model Agent" },
  { value: "report", label: "Report Agent" },
  { value: "general", label: "General Assistant" },
];

const QUICK_ACTIONS = [
  { id: "load", label: "Load Data" },
  { id: "preprocess", label: "Suggest Preprocessing" },
  { id: "recommend", label: "Recommend Model" },
  { id: "explain", label: "Explain Result" },
  { id: "report", label: "Draft Report" },
];

export default function LeftAgentSidebar({
  state,
  collapsed,
  onToggleCollapse,
  onChangeAgent,
  onChangeProvider,
  onToggleRag,
  onOpenFullChat,
  onQuickAction,
  gatewayStatus,
}) {
  if (collapsed) {
    return (
      <aside className="expv2-left expv2-left--collapsed" aria-label="AI 사이드바 (접힘)">
        <div className="expv2-left__head">
          <button
            type="button"
            className="expv2-btn expv2-btn--icon"
            onClick={onToggleCollapse}
            title="사이드바 펼치기"
            aria-label="사이드바 펼치기"
          >
            ▸
          </button>
        </div>
      </aside>
    );
  }

  const lastChat = state.recentChat.slice(-5);

  return (
    <aside className="expv2-left" aria-label="AI 사이드바">
      <header className="expv2-left__head">
        <span className="expv2-left__head-title">AI Assist</span>
        <button
          type="button"
          className="expv2-btn expv2-btn--icon expv2-btn--ghost"
          onClick={onToggleCollapse}
          title="사이드바 접기"
          aria-label="사이드바 접기"
        >
          ◂
        </button>
      </header>

      <div className="expv2-left__body">
        {/* 1. Agent selector */}
        <section>
          <div className="expv2-left__section-title">Agent</div>
          <select
            className="expv2-left__select"
            value={state.agent}
            onChange={(e) => onChangeAgent(e.target.value)}
            aria-label="AI 에이전트 선택"
          >
            {AGENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <select
              className="expv2-left__select"
              style={{ flex: 1 }}
              value={state.provider}
              onChange={(e) => onChangeProvider(e.target.value)}
              aria-label="LLM provider"
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
            <label
              className="expv2-btn expv2-btn--sm"
              style={{
                cursor: "pointer",
                justifyContent: "center",
                gap: 4,
                background: state.useRag ? "var(--primary-soft)" : "var(--panel)",
                color: state.useRag ? "var(--primary-strong)" : "var(--subt)",
                borderColor: state.useRag ? "var(--primary)" : "var(--border)",
              }}
              title="RAG 컨텍스트 사용"
            >
              <input
                type="checkbox"
                checked={state.useRag}
                onChange={(e) => onToggleRag(e.target.checked)}
                style={{ display: "none" }}
              />
              RAG {state.useRag ? "on" : "off"}
            </label>
          </div>
          <div style={{ marginTop: 6 }}>
            {gatewayStatus ? (
              gatewayStatus.openai_configured || gatewayStatus.gemini_configured ? (
                <span className="expv2-chip expv2-chip--ok">
                  Gateway 준비됨
                </span>
              ) : (
                <span className="expv2-chip expv2-chip--warn">API 키 미구성</span>
              )
            ) : (
              <span className="expv2-chip">Gateway 확인 중</span>
            )}
          </div>
        </section>

        {/* 2. Compact chat */}
        <section>
          <div
            className="expv2-left__section-title"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
          >
            <span>Recent</span>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={onOpenFullChat}
              title="전체 대화 기록 열기"
            >
              View all →
            </button>
          </div>
          <div className="expv2-left__chat">
            {lastChat.length === 0 ? (
              <div className="expv2-left__chat-empty">
                아직 대화가 없습니다. 가운데 지시 바 또는 프롬프트 셀을 사용해
                보세요.
              </div>
            ) : (
              lastChat.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "expv2-left__chat-item expv2-left__chat-item--user"
                      : "expv2-left__chat-item"
                  }
                  title={new Date(m.time).toLocaleString()}
                >
                  <span className="expv2-left__chat-role">{m.role}</span>
                  {truncate(m.compactSummary || m.content, 140)}
                </div>
              ))
            )}
          </div>
        </section>

        {/* 3. Context summary */}
        <section>
          <div className="expv2-left__section-title">Context</div>
          <dl className="expv2-left__ctx">
            <dt>Notebook</dt>
            <dd>{state.notebookTitle || "(미명)"}</dd>
            <dt>Cells</dt>
            <dd>{state.cells.length}개</dd>
            <dt>Active</dt>
            <dd>
              {state.cells.find((c) => c.id === state.activeCellId)?.title ||
                "—"}
            </dd>
            <dt>Status</dt>
            <dd>{state.isRunning ? "실행 중" : "대기"}</dd>
            <dt>Saved</dt>
            <dd>{state.savedAt ? formatRelative(state.savedAt) : "—"}</dd>
          </dl>
        </section>

        {/* 4. Quick actions */}
        <section>
          <div className="expv2-left__section-title">Quick Actions</div>
          <div className="expv2-left__qa">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                className="expv2-left__qa-btn"
                onClick={() => onQuickAction(q.id)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function truncate(s, n) {
  const str = String(s ?? "");
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}
