import { apiDownload } from "../api";

export default function ResultsPage({
  trainResult,
  plotUrl,
  predictPreview,
  predictOutputFilename,
  history,
}) {
  function downloadPredictionCsv() {
    if (!predictOutputFilename) return;
    apiDownload(
      `/api/outputs/${encodeURIComponent(predictOutputFilename)}`,
      predictOutputFilename
    ).catch((e) => window.alert(e?.message || "다운로드에 실패했습니다."));
  }
  return (
    <div className="grid">
      <section className="panel">
        <h2>학습 결과</h2>
        {trainResult ? (
          <>
            <p className="hint">
              아래는 마지막으로 학습한 모델의 평가 지표와 전처리 요약입니다.
            </p>
            {trainResult.metrics_interpretation_ko && (
              <div className="metrics-interpretation" style={{ marginBottom: "1rem" }}>
                <h3 className="metrics-interpretation-title" style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
                  지표 해석 (자동 · Colab 스타일)
                </h3>
                <div className="metrics-interpretation-body">
                  {trainResult.metrics_interpretation_ko}
                </div>
              </div>
            )}
            <pre className="metrics-pre">
              {JSON.stringify(
                {
                  metrics: trainResult.metrics,
                  preprocessing: trainResult.preprocessing,
                },
                null,
                2
              )}
            </pre>
            {plotUrl && (
              <img
                className="plot-img"
                src={plotUrl}
                alt="학습 결과 차트"
              />
            )}
          </>
        ) : (
          <p className="hint">아직 학습 결과가 없습니다. \"모델 학습\" 탭에서 먼저 학습을 실행하세요.</p>
        )}
      </section>

      <section className="panel">
        <h2>예측 결과 미리보기</h2>
        {predictOutputFilename && (
          <p className="hint" style={{ marginBottom: "0.65rem" }}>
            전체 결과는 서버 <code>outputs</code> 폴더의{" "}
            <strong>{predictOutputFilename}</strong> 로 저장됩니다. 아래는 앞부분(최대 50행)만
            보여 줍니다.
          </p>
        )}
        {predictOutputFilename && (
          <button
            type="button"
            className="btn"
            style={{ marginBottom: "0.75rem" }}
            onClick={downloadPredictionCsv}
          >
            예측 결과 CSV 다운로드
          </button>
        )}
        {predictPreview?.preview?.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {Object.keys(predictPreview.preview[0] || {}).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {predictPreview.preview.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((cell, j) => (
                      <td key={j}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">
            예측을 실행하면 여기에서 결과를 일부 확인할 수 있습니다.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>학습·출력 이력</h2>
        {history && history.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>데이터</th>
                  <th>과제</th>
                  <th>모델</th>
                  <th>출력 파일</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.model_id}>
                    <td>{h.model_id.slice(0, 8)}…</td>
                    <td>{h.filename}</td>
                    <td>{h.task_type}</td>
                    <td>{h.model_type}</td>
                    <td>{(h.outputs || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">학습·출력 이력이 아직 없습니다.</p>
        )}
      </section>
    </div>
  );
}

