import { apiDownload } from "../api";

export default function ArtifactsPage({ artifacts, onRefresh }) {
  const models = artifacts?.models || [];
  const metadata = artifacts?.metadata || [];
  const outputs = artifacts?.outputs || [];
  const runArtifacts = artifacts?.run_artifacts || [];

  async function download(kind, filename) {
    await apiDownload(
      `/api/artifacts/download/${encodeURIComponent(kind)}/${encodeURIComponent(filename)}`,
      filename
    );
  }

  function baseName(pathValue) {
    if (!pathValue) return "";
    return String(pathValue).split("\\").pop().split("/").pop();
  }

  function downloadFromPath(pathValue, kind) {
    const name = baseName(pathValue);
    if (!name) return;
    download(kind, name);
  }

  function renderTable(title, kind, items) {
    return (
      <section className="panel">
        <h2>{title}</h2>
        {items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((name) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>
                      <button type="button" onClick={() => download(kind, name)}>
                        다운로드
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">파일이 없습니다.</p>
        )}
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>아티팩트 관리</h2>
        <p className="hint">
          모델, 메타데이터, 출력 파일과 실행별 결과(run artifacts)를 확인하고 다운로드할 수 있습니다.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
          아티팩트 새로고침
        </button>
      </section>
      <section className="panel">
        <h2>실행별 결과 (Run Artifacts)</h2>
        {runArtifacts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>생성시각</th>
                  <th>Run / Job</th>
                  <th>데이터셋</th>
                  <th>모델/과제</th>
                  <th>상태</th>
                  <th>결과 파일</th>
                </tr>
              </thead>
              <tbody>
                {runArtifacts.map((r) => (
                  <tr key={r.run_id}>
                    <td>{r.created_at || "-"}</td>
                    <td>
                      <div>{r.run_id ? `${r.run_id.slice(0, 8)}…` : "-"}</div>
                      <div className="hint">{r.job_id ? `${r.job_id.slice(0, 8)}…` : "-"}</div>
                    </td>
                    <td>{r.dataset || "-"}</td>
                    <td>
                      {r.model_type || "-"} / {r.task_type || "-"}
                    </td>
                    <td>{r.status || "-"}</td>
                    <td>
                      {r.model_path && (
                        <button
                          type="button"
                          style={{ marginRight: 6, marginBottom: 4 }}
                          onClick={() => downloadFromPath(r.model_path, "model")}
                        >
                          모델
                        </button>
                      )}
                      {r.output_path && (
                        <button
                          type="button"
                          style={{ marginRight: 6, marginBottom: 4 }}
                          onClick={() => downloadFromPath(r.output_path, "output")}
                        >
                          출력
                        </button>
                      )}
                      {r.output_chart_path && (
                        <button
                          type="button"
                          style={{ marginRight: 6, marginBottom: 4 }}
                          onClick={() => downloadFromPath(r.output_chart_path, "output")}
                        >
                          차트
                        </button>
                      )}
                      {r.log_path && (
                        <button
                          type="button"
                          style={{ marginBottom: 4 }}
                          onClick={() => downloadFromPath(r.log_path, "log")}
                        >
                          로그
                        </button>
                      )}
                      {!r.model_path && !r.output_path && !r.output_chart_path && !r.log_path && "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">표시할 실행 결과가 없습니다.</p>
        )}
      </section>
      {renderTable("모델(.joblib)", "model", models)}
      {renderTable("메타데이터(.json)", "meta", metadata)}
      {renderTable("출력 파일", "output", outputs)}
    </div>
  );
}

