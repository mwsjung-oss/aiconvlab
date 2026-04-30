import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api";

const PACKAGE_HINT =
  "백엔드와 동일한 Python 환경입니다. pandas, numpy, scikit-learn, matplotlib, xgboost, torch(설치 시) 등을 사용할 수 있습니다.";

export default function NotebookPage() {
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const [gpu, setGpu] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const s = await apiJson("/api/notebook/status");
      setStatus(s);
    } catch (e) {
      setStatus(null);
    }
  }, []);

  const loadGpu = useCallback(async () => {
    try {
      const g = await apiJson("/api/monitor/gpu");
      setGpu(g);
    } catch {
      setGpu(null);
    }
  }, []);

  const connect = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const data = await apiJson("/api/notebook/session", {
        timeoutMs: 120000,
      });
      setSession(data);
      if (!data.ok) {
        setErr(data.reason || "노트북을 시작할 수 없습니다.");
      } else {
        setIframeKey((k) => k + 1);
      }
    } catch (e) {
      setErr(e.message || String(e));
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadGpu();
    connect();
  }, [connect, loadGpu, loadStatus]);

  const openExternal = () => {
    if (session?.lab_url) {
      window.open(session.lab_url, "_blank", "noopener,noreferrer");
    }
  };

  const shutdown = async () => {
    setErr(null);
    try {
      await apiJson("/api/notebook/shutdown", { method: "POST" });
      setSession(null);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const gpuLabel =
    gpu && typeof gpu === "object" && Array.isArray(gpu.gpus) && gpu.gpus[0]
      ? gpu.gpus[0].name
      : null;

  const ready =
    status?.feature_enabled &&
    status?.jupyter_installed &&
    session?.ok;

  return (
    <div className="notebook-page">
      <div className="notebook-page-header card">
        <div className="notebook-page-title">
          <h2>노트북 (Jupyter Lab)</h2>
          <p className="hint notebook-page-sub">
            Google Colab과 같이 브라우저에서 코드·셀을 실행합니다. 파일은 워크스페이스의{" "}
            <code>data/notebooks</code> 에 저장됩니다.
          </p>
        </div>
        <div className="notebook-page-toolbar">
          {gpuLabel && (
            <span className="notebook-gpu-badge" title="GPU 상태">
              GPU: {String(gpuLabel)}
            </span>
          )}
          <button
            type="button"
            className="notebook-toolbar-btn"
            disabled={!ready}
            onClick={openExternal}
          >
            새 탭에서 열기
          </button>
          <button
            type="button"
            className="notebook-toolbar-btn"
            disabled={loading}
            onClick={() => connect()}
          >
            다시 연결
          </button>
          <button
            type="button"
            className="notebook-toolbar-btn notebook-toolbar-btn--danger"
            disabled={!session?.ok}
            onClick={shutdown}
          >
            세션 종료
          </button>
        </div>
      </div>

      <p className="notebook-package-hint hint">{PACKAGE_HINT}</p>

      {!status?.feature_enabled && (
        <div className="card notebook-page-notice">
          <h3>노트북 기능이 꺼져 있습니다</h3>
          <p>
            서버 <code>backend/.env</code> 에 <code>NOTEBOOK_ENABLED=1</code> 을 추가하고{" "}
            <code>pip install jupyterlab</code> 후 백엔드를 다시 시작하세요.
          </p>
        </div>
      )}

      {status?.feature_enabled && !status?.jupyter_installed && (
        <div className="card notebook-page-notice">
          <h3>Jupyter Lab 미설치</h3>
          <p>
            백엔드 환경에서 <code>pip install jupyterlab</code> 을 실행한 뒤 다시 시도하세요.
          </p>
        </div>
      )}

      {err && (
        <div className="card notebook-page-error" role="alert">
          {err}
        </div>
      )}

      {loading && (
        <p className="hint notebook-page-loading">노트북 서버에 연결하는 중…</p>
      )}

      {ready && session.lab_url && (
        <div className="notebook-iframe-wrap">
          <iframe
            key={iframeKey}
            title="Jupyter Lab"
            className="notebook-iframe"
            src={session.lab_url}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      )}
    </div>
  );
}
