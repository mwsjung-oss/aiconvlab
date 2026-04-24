/**
 * ExperimentPageV3 — 루트 컴포넌트
 *
 * 구조:
 *   <div.expv3>
 *     <TopBar row1 row2 />
 *     <div.expv3-body>
 *       <ActivityNav />
 *       <ActivityWorkspace />
 *     </div>
 *   </div>
 *
 * 부모(App.jsx)에서 onGoHome, onLogout, user 를 전달 받는다.
 */
import { useEffect, useMemo, useState } from "react";
import TopBar from "./TopBar.jsx";
import ActivityNav from "./ActivityNav.jsx";
import ActivityWorkspace from "./ActivityWorkspace.jsx";
import { useExperimentV3State, hasLegacyV2Data } from "./hooks/useExperimentV3State.js";
import { useKernel } from "./hooks/useKernel.js";
import { useTracing } from "./hooks/useTracing.js";
import { getActivity, ACTIVITIES } from "./config/activities.config.js";
import "./experimentV3.css";

export default function ExperimentPageV3({ user, onLogout, onGoHome }) {
  const {
    state,
    patch,
    setStage,
    setActivity,
    getCellsFor,
    addCell,
    patchCell,
    removeCell,
    moveCell,
  } = useExperimentV3State();

  const kernel = useKernel({ autoStart: true });
  const tracing = useTracing();

  const [activeCellId, setActiveCellIdState] = useState(null);
  const [showLegacyBanner, setShowLegacyBanner] = useState(false);

  useEffect(() => {
    if (hasLegacyV2Data()) {
      const dismissed = localStorage.getItem(
        "ailab_experiment_v3_legacy_banner_dismissed"
      );
      if (!dismissed) setShowLegacyBanner(true);
    }
  }, []);

  const activity = useMemo(
    () => (state.activeActivityId ? getActivity(state.activeActivityId) : null),
    [state.activeActivityId]
  );
  const currentCells = useMemo(
    () => (activity ? getCellsFor(activity.id) : []),
    [activity, getCellsFor]
  );

  /* stage 혹은 activity 가 바뀔 때 active cell 초기화 */
  useEffect(() => {
    setActiveCellIdState(null);
  }, [state.stage, state.activeActivityId]);

  const traceCounts = useMemo(() => {
    const counts = {};
    for (const t of tracing.traces) {
      if (!t.activity_id) continue;
      counts[t.activity_id] = (counts[t.activity_id] || 0) + 1;
    }
    return counts;
  }, [tracing.traces]);

  const dismissLegacy = () => {
    try {
      localStorage.setItem(
        "ailab_experiment_v3_legacy_banner_dismissed",
        "1"
      );
    } catch {
      /* noop */
    }
    setShowLegacyBanner(false);
  };

  return (
    <div className="expv3">
      <TopBar
        projectName={state.projectName}
        onChangeProjectName={(v) => patch({ projectName: v })}
        savedAt={state.savedAt}
        dirty={state.dirty}
        user={user}
        onLogout={onLogout}
        onGoHome={onGoHome}
        stage={state.stage}
        onChangeStage={setStage}
      />

      {showLegacyBanner ? (
        <div className="expv3-legacy-banner">
          <span>
            이전 버전(V2) 실험 기록이 브라우저에 남아 있습니다. 새 V3 는 별도
            저장소를 사용하므로 기존 기록은 그대로 보존됩니다.
          </span>
          <span className="expv3-legacy-banner__spacer" />
          <button
            type="button"
            className="expv3-btn expv3-btn--sm"
            onClick={dismissLegacy}
          >
            확인
          </button>
        </div>
      ) : null}

      <div className="expv3-body">
        <ActivityNav
          stage={state.stage}
          activeActivityId={state.activeActivityId}
          onSelect={setActivity}
          traceCounts={traceCounts}
        />
        <ActivityWorkspace
          activity={activity}
          stage={state.stage}
          cells={currentCells}
          activeCellId={activeCellId}
          onSetActiveCell={setActiveCellIdState}
          onPatchCell={patchCell}
          onAddCell={addCell}
          onRemoveCell={removeCell}
          onMoveCell={moveCell}
          kernel={kernel}
          tracing={tracing}
          user={user}
        />
      </div>
    </div>
  );
}

/* Activity 목록의 기본 5개(stage별 첫번째)는 초기 1회 렌더 때 자동 채워 놓고,
   사용자가 원할 때 다른 활동으로 이동하도록 한다. */
export function allActivityIds() {
  return ACTIVITIES.map((a) => a.id);
}
