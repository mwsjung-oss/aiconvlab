import { apiDownload } from "../api";

export default function HistoryPage({ history, onRefresh, onOpenJobs, onOpenArtifacts }) {
  function baseName(pathValue) {
    if (!pathValue) return "";
    return String(pathValue).split("\\").pop().split("/").pop();
  }

  function downloadByPath(kind, pathValue) {
    const filename = baseName(pathValue);
    if (!filename) return;
    apiDownload(`/api/artifacts/download/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}`, filename);
  }

  return (
    <section className="panel">
      <h2>실험 이력</h2>
      <p className="hint">
        각 학습 실행에 대해 데이터셋, 시간, 타깃/입력 열, 모델/과제 유형, 평가 지표와
        생성된 파일 경로를 한눈에 볼 수 있습니다.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ marginBottom: "0.75rem" }}
        onClick={onRefresh}
      >
        이력 새로고침
      </button>
      {history && history.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>시간</th>
                <th>데이터셋</th>
                <th>타깃</th>
                <th>입력 특성</th>
                <th>과제</th>
                <th>모델</th>
                <th>주요 지표</th>
                <th>Job</th>
                <th>모델 파일</th>
                <th>출력/차트</th>
                <th>통합 액션</th>
              </tr>
            </thead>
            <tbody>
              {history
                .slice()
                .reverse()
                .map((h, idx) => (
                  <tr key={`${h.model_id}-${idx}`}>
                    <td>{h.created_at || "-"}</td>
                    <td>{h.dataset || h.filename}</td>
                    <td>{h.target_column}</td>
                    <td>
                      {Array.isArray(h.feature_columns)
                        ? h.feature_columns.join(", ")
                        : ""}
                    </td>
                    <td>{h.task_type}</td>
                    <td>{h.model_type}</td>
                    <td>
                      {h.metrics
                        ? Object.entries(h.metrics)
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(3) : v}`)
                            .join(" | ")
                        : ""}
                    </td>
                    <td>{h.job_id ? `${h.job_id.slice(0, 8)}…` : "-"}</td>
                    <td title={h.model_path}>{baseName(h.model_path) || "-"}</td>
                    <td title={h.output_path || h.output_chart_path}>
                      {baseName(h.output_path) || baseName(h.output_chart_path) || "-"}
                    </td>
                    <td>
                      {h.job_id && (
                        <button
                          type="button"
                          onClick={() => onOpenJobs?.(h.job_id)}
                          style={{ marginRight: 6 }}
                        >
                          Job
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenArtifacts?.()}
                        style={{ marginRight: 6, marginBottom: 4 }}
                      >
                        Artifacts
                      </button>
                      {h.model_path && (
                        <button
                          type="button"
                          style={{ marginRight: 6, marginBottom: 4 }}
                          onClick={() => downloadByPath("model", h.model_path)}
                        >
                          모델
                        </button>
                      )}
                      {h.output_path && (
                        <button
                          type="button"
                          style={{ marginRight: 6, marginBottom: 4 }}
                          onClick={() => downloadByPath("output", h.output_path)}
                        >
                          출력
                        </button>
                      )}
                      {h.output_chart_path && (
                        <button
                          type="button"
                          style={{ marginBottom: 4 }}
                          onClick={() => downloadByPath("output", h.output_chart_path)}
                        >
                          차트
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="hint">아직 기록된 실험 이력이 없습니다. 모델을 한 번 이상 학습해 보세요.</p>
      )}
    </section>
  );
}

