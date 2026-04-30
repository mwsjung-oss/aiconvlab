export default function MonitorPage({ systemStatus, gpuStatus, jobs, onRefresh }) {
  return (
    <div className="grid">
      <section className="panel">
        <h2>운영 모니터링</h2>
        <p className="hint">서버 자원과 작업 상태를 운영자 관점에서 확인합니다.</p>
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
          모니터링 새로고침
        </button>
      </section>

      <section className="panel">
        <h3>시스템</h3>
        {systemStatus ? (
          <pre className="metrics-pre">
            {JSON.stringify(systemStatus, null, 2)}
          </pre>
        ) : (
          <p className="hint">시스템 정보를 가져오지 못했습니다.</p>
        )}
      </section>

      <section className="panel">
        <h3>GPU</h3>
        {gpuStatus ? (
          <pre className="metrics-pre">
            {JSON.stringify(gpuStatus, null, 2)}
          </pre>
        ) : (
          <p className="hint">GPU 정보를 가져오지 못했습니다.</p>
        )}
      </section>

      <section className="panel">
        <h3>최근 작업</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>유형</th>
                <th>상태</th>
                <th>진행률</th>
                <th>제출 시각</th>
              </tr>
            </thead>
            <tbody>
              {(jobs || []).slice(0, 20).map((j) => (
                <tr key={j.job_id}>
                  <td>{j.job_id?.slice(0, 8)}…</td>
                  <td>{j.kind}</td>
                  <td>{j.status}</td>
                  <td>{j.progress ?? 0}%</td>
                  <td>{j.submitted_at || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

