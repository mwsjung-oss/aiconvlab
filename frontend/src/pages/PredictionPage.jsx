import { apiDownload } from "../api";

export default function PredictionPage({
  datasets,
  models,
  predictModelId,
  setPredictModelId,
  predictFile,
  setPredictFile,
  onPredict,
  loading,
  message,
  error,
  preview,
  predictOutputFilename,
}) {
  function downloadPredictionCsv() {
    if (!predictOutputFilename) return;
    apiDownload(
      `/api/outputs/${encodeURIComponent(predictOutputFilename)}`,
      predictOutputFilename
    ).catch((e) => window.alert(e?.message || "다운로드에 실패했습니다."));
  }
  return (
    <section className="panel">
      <h2>예측 실행</h2>
      <div className="field">
        <label htmlFor="mid">모델 ID</label>
        <select
          id="mid"
          value={predictModelId}
          onChange={(e) => setPredictModelId(e.target.value)}
        >
          <option value="">— 선택 —</option>
          {models.map((m) => (
            <option key={m.model_id} value={m.model_id}>
              {m.model_id.slice(0, 8)}… ({m.model_type})
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pf">예측에 사용할 CSV</label>
        <select
          id="pf"
          value={predictFile}
          onChange={(e) => setPredictFile(e.target.value)}
        >
          <option value="">— 선택 —</option>
          {datasets.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">
        예측에 사용하는 CSV는 학습 때 사용한 입력 특성과 같은 열 이름을 가져야 합니다.
      </p>
      <button
        type="button"
        className="btn"
        onClick={onPredict}
        disabled={loading}
      >
        {loading ? "예측 중…" : "예측 실행"}
      </button>
      {message && <div className="msg ok">{message}</div>}
      {error && <div className="msg error">{error}</div>}

      {preview?.preview?.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
            예측 결과 미리보기
          </h3>
          {predictOutputFilename && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginBottom: "0.65rem" }}
              onClick={downloadPredictionCsv}
            >
              예측 결과 CSV 다운로드
            </button>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {Object.keys(preview.preview[0] || {}).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((cell, j) => (
                      <td key={j}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

