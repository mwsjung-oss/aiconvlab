/**
 * ActivityTimeline — structured bottom drawer showing all experiment events
 * (user requests, agent suggestions, run phases, errors, exports, notes).
 *
 * Unlike a raw chat dump, every row is a typed record with actor + event type
 * + summary + optional detail + status + reference (block/run). Users can
 * filter by actor/type, free-text search, expand a row for detail, and jump
 * back to the relevant block.
 */
import { useMemo, useState } from "react";
import { NButton, Chip } from "./primitives.jsx";
import { formatRelative } from "./useNotebookState.js";

const ACTOR_LABEL = {
  user: "사용자",
  agent: "AI Agent",
  system: "시스템",
};
const ACTOR_KIND = {
  user: "info",
  agent: "ok",
  system: "info",
};

const TYPE_LABEL = {
  request: "요청",
  suggestion: "제안",
  load: "데이터 로드",
  preprocess: "전처리",
  train: "학습",
  evaluate: "평가",
  error: "오류",
  report: "리포트",
  save: "저장",
  export: "내보내기",
  open_knowledge: "지식베이스",
  note: "메모",
  cell_run: "셀 실행",
};

const TYPE_ICON = {
  request: "💬",
  suggestion: "🤖",
  load: "📂",
  preprocess: "🧹",
  train: "🧠",
  evaluate: "📊",
  error: "⚠",
  report: "📝",
  save: "💾",
  export: "⬇",
  open_knowledge: "📚",
  note: "🗒",
  cell_run: "▶",
};

const STATUS_KIND = {
  info: "info",
  ok: "ok",
  warn: "warn",
  err: "err",
};

export default function ActivityTimeline({
  open,
  timeline = [],
  onToggle,
  onClear,
  onJumpToBlock,
  onOpenFullChat,
}) {
  const [actorFilter, setActorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return timeline
      .slice()
      .reverse() // newest first
      .filter((e) => (actorFilter === "all" ? true : e.actor === actorFilter))
      .filter((e) => (typeFilter === "all" ? true : e.eventType === typeFilter))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.summary || ""} ${e.detail || ""} ${e.eventType || ""} ${e.ref?.blockKey || ""}`;
        return hay.toLowerCase().includes(q);
      });
  }, [timeline, actorFilter, typeFilter, query]);

  const availableTypes = useMemo(
    () => Array.from(new Set(timeline.map((e) => e.eventType))).sort(),
    [timeline]
  );

  return (
    <aside
      className={`notebook-timeline ${open ? "" : "notebook-timeline--collapsed"}`}
      aria-label="실험 활동 타임라인"
    >
      <header className="notebook-timeline__head">
        <button
          type="button"
          className="notebook-timeline__handle"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? "타임라인 접기" : "타임라인 펼치기"}
        >
          <span aria-hidden="true">{open ? "▾" : "▴"}</span>
          <span>Activity Timeline</span>
          <Chip kind="info">{timeline.length}</Chip>
        </button>

        {open ? (
          <div className="notebook-timeline__controls">
            <input
              type="search"
              placeholder="검색 (요약·상세·블록)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="notebook-timeline__search"
              aria-label="타임라인 검색"
            />
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              aria-label="행위자 필터"
              className="notebook-timeline__select"
            >
              <option value="all">전체 행위자</option>
              <option value="user">사용자</option>
              <option value="agent">AI Agent</option>
              <option value="system">시스템</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="이벤트 유형 필터"
              className="notebook-timeline__select"
            >
              <option value="all">전체 유형</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t] || t}
                </option>
              ))}
            </select>
            <NButton
              variant="ghost"
              icon="💬"
              onClick={onOpenFullChat}
              title="좌측 Global AI 채팅으로 이동"
            >
              Full chat
            </NButton>
            <NButton
              variant="ghost"
              icon="🗑"
              onClick={() => {
                if (window.confirm("타임라인을 비울까요?")) onClear?.();
              }}
              title="타임라인 초기화"
            >
              Clear
            </NButton>
          </div>
        ) : null}
      </header>

      {open ? (
        <div className="notebook-timeline__body">
          {filtered.length === 0 ? (
            <div className="notebook-timeline__empty">
              아직 기록된 이벤트가 없습니다. 블록을 편집하거나 AI 어시스트를
              실행하면 이 곳에 자동 기록됩니다.
            </div>
          ) : (
            <ol className="notebook-timeline__list">
              {filtered.map((e) => {
                const isExpanded = expandedId === e.id;
                const hasDetail =
                  typeof e.detail === "string"
                    ? e.detail.trim().length > 0
                    : e.detail && Object.keys(e.detail).length > 0;
                return (
                  <li key={e.id} className="notebook-timeline__row">
                    <button
                      type="button"
                      className="notebook-timeline__row-main"
                      onClick={() =>
                        setExpandedId((prev) => (prev === e.id ? null : e.id))
                      }
                      aria-expanded={isExpanded}
                    >
                      <span
                        className="notebook-timeline__icon"
                        aria-hidden="true"
                      >
                        {TYPE_ICON[e.eventType] || "•"}
                      </span>
                      <span className="notebook-timeline__time">
                        {formatRelative(e.ts)}
                      </span>
                      <Chip
                        kind={ACTOR_KIND[e.actor] || "info"}
                        title={`행위자 · ${ACTOR_LABEL[e.actor] || e.actor}`}
                      >
                        {ACTOR_LABEL[e.actor] || e.actor}
                      </Chip>
                      <Chip
                        kind={STATUS_KIND[e.status] || "info"}
                        title={`유형 · ${TYPE_LABEL[e.eventType] || e.eventType}`}
                      >
                        {TYPE_LABEL[e.eventType] || e.eventType}
                      </Chip>
                      <span className="notebook-timeline__summary">
                        {e.summary || "(제목 없음)"}
                      </span>
                      {e.ref?.blockKey ? (
                        <span className="notebook-timeline__ref">
                          @ {e.ref.blockKey}
                        </span>
                      ) : null}
                      <span className="notebook-timeline__expand">
                        {hasDetail ? (isExpanded ? "▾" : "▸") : ""}
                      </span>
                    </button>

                    {isExpanded && hasDetail ? (
                      <div className="notebook-timeline__detail">
                        {typeof e.detail === "string" ? (
                          <pre className="notebook-timeline__pre">
                            {e.detail}
                          </pre>
                        ) : (
                          <pre className="notebook-timeline__pre">
                            {JSON.stringify(e.detail, null, 2)}
                          </pre>
                        )}
                        {e.ref?.blockKey && onJumpToBlock ? (
                          <div className="notebook-timeline__actions">
                            <NButton
                              variant="ghost"
                              onClick={() => onJumpToBlock(e.ref.blockKey)}
                              icon="↗"
                            >
                              {e.ref.blockKey} 블록으로 이동
                            </NButton>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : null}
    </aside>
  );
}
