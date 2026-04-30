export default function PreviewPage({
  datasets,
  selectedFile,
  onSelectFile,
  preview,
  loading,
  error,
  onRefresh,
}) {
  return (
    <section className="panel">
      <h2>데이터 미리보기</h2>
      <div className="field">
        <label htmlFor="ds">업로드된 데이터셋</label>
        <select
          id="ds"
          value={selectedFile}
          onChange={(e) => onSelectFile(e.target.value)}
        >
          <option value="">— 선택 —</option>
          {datasets.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="flex">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onRefresh()}
          disabled={!selectedFile || loading}
        >
          미리보기 새로고침
        </button>
      </div>
      {loading && <div className="msg">데이터를 불러오는 중입니다…</div>}
      {error && <div className="msg error">{error}</div>}
      {preview?.data?.length > 0 && (
        <>
          <p className="hint">
            총 {preview.total_rows}행 · 아래는 상위 {preview.preview_rows}행입니다.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {preview.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.map((row, i) => (
                  <tr key={i}>
                    {preview.columns.map((c) => (
                      <td key={c}>
                        {row[c] !== null && row[c] !== undefined
                          ? String(row[c])
                          : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!loading && !error && !preview?.data?.length && (
        <p className="hint">데이터셋을 업로드하고 선택하면 표가 표시됩니다.</p>
      )}
    </section>
  );
}

