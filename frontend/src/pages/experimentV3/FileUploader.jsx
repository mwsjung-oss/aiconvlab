/**
 * FileUploader — CSV 업로드 + 미리보기 + 커널 로드
 *
 * 흐름:
 *   1) 사용자가 CSV 를 고름 → /api/upload 로 전송
 *   2) 업로드 성공 시 /api/preview 로 상위 20행 받아서 테이블 표시
 *   3) "커널에 df 로드" 누르면 useKernel.loadFile(filename) 호출
 *      → 백엔드가 df 를 준비하고 head() 를 반환
 */
import { useRef, useState } from "react";
import { apiJson } from "../../api.js";

export default function FileUploader({ kernel, onLoaded, onTrace }) {
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadedToKernel, setLoadedToKernel] = useState(false);
  const fileRef = useRef(null);

  async function fetchPreview(name) {
    try {
      const p = await apiJson(
        `/api/preview?filename=${encodeURIComponent(name)}&rows=20`
      );
      setPreview(p);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function handleFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setPreview(null);
    setLoadedToKernel(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiJson("/api/upload", { method: "POST", body: fd });
      setFilename(data.filename);
      await fetchPreview(data.filename);
      onTrace?.({
        kind: "file",
        content: `upload: ${data.filename} · ${data.rows ?? "?"}행`,
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleLoadToKernel() {
    if (!filename) return;
    setLoading(true);
    setError(null);
    const res = await kernel.loadFile(filename);
    setLoading(false);
    if (res.ok) {
      setLoadedToKernel(true);
      onTrace?.({
        kind: "result",
        content: `kernel loaded: ${filename}`,
        outputs: res.data?.outputs || null,
      });
      onLoaded?.(filename, res.data);
    } else {
      setError(res.error || "커널 로드 실패");
    }
  }

  return (
    <section className="expv3-upload">
      <div className="expv3-upload__row">
        <label className="expv3-btn">
          파일 선택…
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFile}
            disabled={uploading}
          />
        </label>
        <span className="expv3-upload__file">
          {uploading
            ? "업로드 중…"
            : filename
            ? `업로드됨: ${filename}`
            : "CSV/Excel 파일을 올려 주세요 (최대 50MB)"}
        </span>
        {filename ? (
          <button
            type="button"
            className="expv3-btn expv3-btn--primary expv3-btn--sm"
            onClick={handleLoadToKernel}
            disabled={loading || !kernel?.status?.ready}
            title={
              kernel?.status?.ready
                ? "커널에 df 로 로드"
                : "커널이 준비되지 않았습니다"
            }
          >
            {loading
              ? "로드 중…"
              : loadedToKernel
              ? "✓ 커널 로드됨"
              : "커널에 df 로드"}
          </button>
        ) : null}
      </div>
      {error ? (
        <div style={{ color: "var(--error)", fontSize: 12 }}>⚠ {error}</div>
      ) : null}
      {preview?.columns?.length ? (
        <div className="expv3-upload__preview">
          <table>
            <thead>
              <tr>
                {preview.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(preview.rows || []).slice(0, 20).map((row, i) => (
                <tr key={i}>
                  {preview.columns.map((c) => (
                    <td key={c}>{formatCell(row?.[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function formatCell(v) {
  if (v == null) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? v.toString() : v.toFixed(4);
  }
  return String(v);
}
