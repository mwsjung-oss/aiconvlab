/**
 * ActivityNav — 좌측 20% 하위 Activity 리스트
 * 선택된 stage 의 Activity 를 번호와 제목으로 나열. 각 Activity 에
 * 누적된 Tracing 건수를 배지로 표시.
 */
import { ACTIVITIES_BY_STAGE, STAGES } from "./config/activities.config.js";

export default function ActivityNav({
  stage,
  activeActivityId,
  onSelect,
  traceCounts = {}, // { [activityId]: number }
}) {
  const stageObj = STAGES.find((s) => s.id === stage);
  const activities = ACTIVITIES_BY_STAGE[stage] || [];

  return (
    <aside className="expv3-nav" aria-label="활동 네비게이션">
      <div className="expv3-nav__head">
        <div className="expv3-nav__stage-label">단계</div>
        <div className="expv3-nav__stage-title">{stageObj?.label || ""}</div>
      </div>
      <div className="expv3-nav__list" role="list">
        {activities.length === 0 ? (
          <div className="expv3-empty">활동이 없습니다.</div>
        ) : (
          activities.map((a, i) => {
            const count = traceCounts[a.id] || 0;
            const active = a.id === activeActivityId;
            return (
              <button
                key={a.id}
                type="button"
                className={
                  active
                    ? "expv3-nav__item expv3-nav__item--active"
                    : "expv3-nav__item"
                }
                onClick={() => onSelect(a.id)}
                role="listitem"
                aria-current={active ? "step" : undefined}
              >
                <span className="expv3-nav__item-num">{i + 1}</span>
                <span>
                  <div className="expv3-nav__item-title">{a.title}</div>
                  <div className="expv3-nav__item-sub">{a.overview}</div>
                  {count > 0 ? (
                    <span className="expv3-nav__trace-badge">
                      기록 {count}건
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
