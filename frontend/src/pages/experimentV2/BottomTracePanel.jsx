/**
 * BottomTracePanel
 *
 * Structured experiment trace (bottom drawer). Each row surfaces:
 *   icon · time · type · actor · summary · related cell · expand
 *
 * Supports:
 *   - search
 *   - filter by actor and type
 *   - expand per-row detail (detail, raw payload)
 *   - jump to the related cell via a bridge callback
 *   - open conversation / prompt history modals
 */
import { useMemo, useState } from "react";
import { formatTime } from "./useExperimentV2State.js";

const ACTOR_ICON = {
  user: "👤",
  agent: "🤖",
  system: "⚙",
};

const TYPE_TO_ICON = {
  request: "→",
  response: "←",
  error: "⚠",
  markdown: "📝",
  note: "•",
  "code-run-stub": "💾",
  "sql-run-stub": "🗄",
  "train-phase": "⚙",
  "run-complete": "✓",
};

export default function BottomTracePanel({
  state,
  collapsed,
  onToggleCollapse,
  onClear,
  onJumpToCell,
  onOpenConversation,
  onOpenPrompts,
}) {
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const types = useMemo(() => {
    const s = new Set();
    state.timelineEvents.forEach((e) => s.add(e.type));
    return Array.from(s).sort();
  }, [state.timelineEvents]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.timelineEvents
      .slice()
      .reverse()
      .filter((e) => {
        if (actorFilter !== "all" && e.actor !== actorFilter) return false;
        if (typeFilter !== "all" && e.type !== typeFilter) return false;
        if (!q) return true;
        const hay = [
          e.summary,
          e.detail,
          e.type,
          e.actor,
          e.relatedCellId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [state.timelineEvents, actorFilter, typeFilter, query]);

  return (
    <footer
      className={
        collapsed ? "expv2-trace expv2-trace--collapsed" : "expv2-trace"
      }
      aria-label="Activity Timeline"
    >
      <div className="expv2-trace__head">
        <button
          type="button"
          className="expv2-trace__handle"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
        >
          <span className="expv2-dot expv2-dot--ok" />
          Activity Timeline
          <span className="expv2-chip">{state.timelineEvents.length}</span>
          <span style={{ color: "var(--dim)", fontSize: 12, fontWeight: 400 }}>
            {collapsed ? "▴" : "▾"}
          </span>
        </button>

        {!collapsed && (
          <div className="expv2-trace__ctrls">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색…"
              className="expv2-trace__search"
              aria-label="Timeline 검색"
            />
            <select
              className="expv2-trace__select"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              aria-label="Actor 필터"
            >
              <option value="all">모든 액터</option>
              <option value="user">사용자</option>
              <option value="agent">에이전트</option>
              <option value="system">시스템</option>
            </select>
            <select
              className="expv2-trace__select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Type 필터"
            >
              <option value="all">모든 유형</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={onOpenPrompts}
              title="프롬프트 기록 열기"
            >
              Prompts
            </button>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm"
              onClick={onOpenConversation}
              title="대화 전체 보기"
            >
              Chat
            </button>
            <button
              type="button"
              className="expv2-btn expv2-btn--ghost expv2-btn--sm expv2-btn--danger"
              onClick={onClear}
              title="Timeline 비우기"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="expv2-trace__body">
        {rows.length === 0 ? (
          <div className="expv2-trace__empty">이벤트가 없습니다.</div>
        ) : (
          <ul className="expv2-trace__list" role="list">
            {rows.map((e) => {
              const expanded = expandedId === e.id;
              return (
                <li key={e.id} className="expv2-trace__row">
                  <button
                    type="button"
                    className="expv2-trace__row-main"
                    onClick={() => setExpandedId(expanded ? null : e.id)}
                  >
                    <span className="expv2-trace__icon">
                      {TYPE_TO_ICON[e.type] || ACTOR_ICON[e.actor] || "•"}
                    </span>
                    <span className="expv2-trace__time">
                      {formatTime(e.time)}
                    </span>
                    <span className="expv2-chip">{e.actor}</span>
                    <span
                      className="expv2-chip"
                      title={e.type}
                      style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}
                    >
                      {e.type}
                    </span>
                    <span className="expv2-trace__summary">{e.summary}</span>
                    <span className="expv2-trace__ref">
                      {e.relatedCellId
                        ? `cell:${e.relatedCellId.slice(-6)}`
                        : ""}
                    </span>
                    <span className="expv2-trace__expand">
                      {expanded ? "▾" : "▸"}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="expv2-trace__detail">
                      {e.detail ? (
                        <pre className="expv2-trace__detail-pre">{e.detail}</pre>
                      ) : (
                        <div className="expv2-empty">세부 내용이 없습니다.</div>
                      )}
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {e.relatedCellId ? (
                          <button
                            type="button"
                            className="expv2-btn expv2-btn--sm"
                            onClick={() => onJumpToCell(e.relatedCellId)}
                          >
                            해당 셀로 이동
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="expv2-btn expv2-btn--ghost expv2-btn--sm"
                          onClick={() =>
                            navigator.clipboard?.writeText(
                              JSON.stringify(e, null, 2)
                            )
                          }
                        >
                          복사
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </footer>
  );
}
