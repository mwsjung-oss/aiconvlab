/**
 * 차트 라이브러리 없이 SVG로 대시보드용 미니 비주얼을 제공합니다.
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** CPU / 메모리 / 디스크 % 가로 막대 */
export function ResourceBars({ systemStatus, gpu0 }) {
  const rows = [
    {
      label: "CPU",
      pct: Number(systemStatus?.cpu_percent) || 0,
      grad: "linear-gradient(90deg, #5ec9ff, #38bdf8)",
    },
    {
      label: "RAM",
      pct: Number(systemStatus?.memory?.percent) || 0,
      grad: "linear-gradient(90deg, #a78bfa, #8b5cf6)",
    },
    {
      label: "Disk",
      pct: Number(systemStatus?.disk?.percent) || 0,
      grad: "linear-gradient(90deg, #fbbf24, #f59e0b)",
    },
  ];
  const gpuPct =
    gpu0?.utilization_gpu_percent != null
      ? Number(gpu0.utilization_gpu_percent)
      : null;
  const vramPct =
    gpu0?.memory_total_mb > 0
      ? (Number(gpu0.memory_used_mb || 0) / Number(gpu0.memory_total_mb)) * 100
      : null;

  return (
    <div className="dash-chart dash-chart--resource">
      <div className="dash-chart-title">시스템 부하</div>
      <div className="dash-hbar-list">
        {rows.map((r) => (
          <div key={r.label} className="dash-hbar-row">
            <span className="dash-hbar-label">{r.label}</span>
            <div className="dash-hbar-track">
              <div
                className="dash-hbar-fill"
                style={{
                  width: `${clamp(r.pct, 0, 100)}%`,
                  background: r.grad,
                }}
              />
            </div>
            <span className="dash-hbar-val">{r.pct.toFixed(0)}%</span>
          </div>
        ))}
        {gpuPct != null && !Number.isNaN(gpuPct) && (
          <div className="dash-hbar-row">
            <span className="dash-hbar-label">GPU</span>
            <div className="dash-hbar-track">
              <div
                className="dash-hbar-fill dash-hbar-fill--gpu"
                style={{ width: `${clamp(gpuPct, 0, 100)}%` }}
              />
            </div>
            <span className="dash-hbar-val">{gpuPct.toFixed(0)}%</span>
          </div>
        )}
        {vramPct != null && !Number.isNaN(vramPct) && (
          <div className="dash-hbar-row">
            <span className="dash-hbar-label">VRAM</span>
            <div className="dash-hbar-track">
              <div
                className="dash-hbar-fill dash-hbar-fill--vram"
                style={{ width: `${clamp(vramPct, 0, 100)}%` }}
              />
            </div>
            <span className="dash-hbar-val">{vramPct.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 잡 상태별 건수 — 가로 스택 막대 */
export function JobStatusBars({ jobs }) {
  const counts = {};
  for (const j of jobs || []) {
    const s = j.status || "unknown";
    counts[s] = (counts[s] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const color = (status) => {
    if (status === "running") return "#38bdf8";
    if (status === "queued") return "#fbbf24";
    if (status === "done") return "#34d399";
    if (status === "failed") return "#f87171";
    return "#94a3b8";
  };

  return (
    <div className="dash-chart dash-chart--jobs">
      <div className="dash-chart-title">잡 상태 분포 ({total}건)</div>
      {entries.length === 0 ? (
        <p className="hint dash-chart-empty">등록된 잡이 없습니다.</p>
      ) : (
        <>
          <div className="dash-stack-bar" role="img" aria-label="잡 상태 비율">
            {entries.map(([status, n]) => (
              <div
                key={status}
                className="dash-stack-seg"
                style={{
                  flex: n,
                  background: color(status),
                  minWidth: n > 0 ? "4px" : 0,
                }}
                title={`${status}: ${n}`}
              />
            ))}
          </div>
          <ul className="dash-legend">
            {entries.map(([status, n]) => (
              <li key={status}>
                <span className="dash-legend-dot" style={{ background: color(status) }} />
                <span className="dash-legend-name">{status}</span>
                <span className="dash-legend-n">{n}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 최근 학습 이력에서 과제 유형(classification 등) 비율 */
export function TaskTypeMix({ history }) {
  const counts = {};
  for (const h of history || []) {
    const t = h.task_type || "—";
    counts[t] = (counts[t] || 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));

  return (
    <div className="dash-chart dash-chart--tasks">
      <div className="dash-chart-title">학습 과제 유형 (이력 기준)</div>
      {entries.length === 0 ? (
        <p className="hint dash-chart-empty">이력이 없습니다.</p>
      ) : (
        <div className="dash-task-bars">
          {entries.map(([name, n]) => (
            <div key={name} className="dash-task-row">
              <span className="dash-task-name" title={name}>
                {name}
              </span>
              <div className="dash-task-track">
                <div
                  className="dash-task-fill"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <span className="dash-task-n">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 최근 N건 학습을 시간 순 막대(건수 강조) */
export function RecentTrainViz({ history, limit = 12 }) {
  const slice = (history || []).slice(-limit);
  const max = Math.max(1, ...slice.map((h) => Number(h.outputs?.length) || 1));

  return (
    <div className="dash-chart dash-chart--recent">
      <div className="dash-chart-title">최근 학습 활동 (산출물 수)</div>
      {slice.length === 0 ? (
        <p className="hint dash-chart-empty">표시할 이력이 없습니다.</p>
      ) : (
        <div className="dash-spark-wrap" role="img" aria-label="최근 학습 산출물 막대">
          {slice.map((h) => {
            const v = Number(h.outputs?.length) || 0;
            const hgt = 8 + (v / max) * 52;
            return (
              <div key={h.model_id} className="dash-spark-col" title={`${h.model_id}: ${v} files`}>
                <div className="dash-spark-bar" style={{ height: `${hgt}px` }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
