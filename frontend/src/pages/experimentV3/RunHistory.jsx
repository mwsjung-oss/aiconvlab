/**
 * RunHistory — Activity 별 프롬프트/실행/결과 트레이스 드로어
 */
import { formatRelative } from "./hooks/useExperimentV3State.js";

function KindBadge({ kind }) {
  const cls = `expv3-history__kind expv3-history__kind--${kind}`;
  return <span className={cls}>{kind}</span>;
}

export default function RunHistory({ open, traces, onClose, onExport, onClear }) {
  if (!open) return null;
  const list = traces.slice().reverse(); // 최신이 위로
  return (
    <aside className="expv3-history" aria-label="실행 이력">
      <div className="expv3-history__head">
        <span className="expv3-history__title">실행 이력</span>
        <span className="expv3-history__spacer" />
        {onExport ? (
          <button
            type="button"
            className="expv3-btn expv3-btn--ghost expv3-btn--sm"
            onClick={onExport}
            title="CSV 내보내기"
          >
            내보내기
          </button>
        ) : null}
        {onClear ? (
          <button
            type="button"
            className="expv3-btn expv3-btn--ghost expv3-btn--sm"
            onClick={() => {
              if (window.confirm("이 활동의 로컬 이력을 삭제할까요?")) onClear();
            }}
            title="이력 비우기"
          >
            비우기
          </button>
        ) : null}
        <button
          type="button"
          className="expv3-btn expv3-btn--ghost expv3-btn--sm"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <div className="expv3-history__list">
        {list.length === 0 ? (
          <div className="expv3-empty">이력이 없습니다.</div>
        ) : (
          list.map((t) => (
            <div key={t.id} className="expv3-history__item">
              <div className="expv3-history__item-head">
                <KindBadge kind={t.kind} />
                <span>{formatRelative(Date.parse(t.created_at))}</span>
                {t.duration_ms ? <span>· {t.duration_ms}ms</span> : null}
                {t.execution_count ? <span>· [{t.execution_count}]</span> : null}
              </div>
              <div className="expv3-history__content">{t.content}</div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
