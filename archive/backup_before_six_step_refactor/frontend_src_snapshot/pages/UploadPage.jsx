import { useRef, useState } from "react";

function pickCsvFile(fileList) {
  if (!fileList?.length) return null;
  const csv =
    Array.from(fileList).find((f) => /\.csv$/i.test(f.name)) ?? fileList[0];
  return csv;
}

export default function UploadPage({ onUpload, loading, message, error }) {
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(file);
    e.target.value = "";
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    if (loading) return;
    const file = pickCsvFile(e.dataTransfer?.files);
    if (file) onUpload(file);
  }

  return (
    <section className="panel">
      <h2>CSV 업로드</h2>
      <div
        className={`upload-dropzone ${dragOver ? "upload-dropzone--active" : ""}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="field upload-dropzone-field">
          <label htmlFor="file">CSV 파일 선택</label>
          <input
            id="file"
            type="file"
            accept=".csv,text/csv"
            onChange={handleChange}
            disabled={loading}
          />
        </div>
        <p className="hint upload-dropzone-hint">
          파일을 이 영역으로 끌어다 놓거나, 위에서 파일을 선택하세요.
        </p>
      </div>
      <p className="hint">
        엑셀에서 \"다른 이름으로 저장\" → CSV 파일로 저장한 후 업로드하면 됩니다.
      </p>
      {loading && <div className="msg">파일을 업로드하고 있습니다…</div>}
      {message && <div className="msg ok">{message}</div>}
      {error && <div className="msg error">{error}</div>}
    </section>
  );
}

