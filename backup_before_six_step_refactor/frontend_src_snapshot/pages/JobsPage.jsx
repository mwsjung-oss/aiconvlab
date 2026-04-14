import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiDownload, apiJson } from "../api";

function phaseLabel(phase, status) {
  const map = {
    queued: "대기",
    loading_user: "사용자/환경 준비",
    training: "학습 실행",
    predicting: "예측 실행",
    done: "완료",
    failed: "실패",
  };
  if (phase && map[phase]) return map[phase];
  if (status === "queued") return "대기";
  if (status === "running") return "실행 중";
  if (status === "completed") return "완료";
  if (status === "failed") return "실패";
  if (status === "cancelled") return "취소됨";
  if (status === "cancelling") return "취소 중";
  if (status === "recovered") return "복구됨";
  return "-";
}

function clampProgress(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** API job 행에 job_id가 없을 때(구버전/캐시) 대비 */
function resolveJobId(job) {
  if (!job) return "";
  if (job.job_id != null && job.job_id !== "") return String(job.job_id);
  if (job.id != null && job.id !== "") return String(job.id);
  return "";
}

export default function JobsPage({ jobs, onRefresh, focusJobId }) {
  const [logModalJobId, setLogModalJobId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [err, setErr] = useState(null);

  const modalJob = useMemo(
    () =>
      logModalJobId
        ? jobs?.find((j) => resolveJobId(j) === logModalJobId) ?? null
        : null,
    [jobs, logModalJobId]
  );

  const fetchLogs = useCallback(async (jobId) => {
    setErr(null);
    setLoadingLogs(true);
    try {
      const d = await apiJson(`/api/jobs/${encodeURIComponent(jobId)}/logs`);
      setLogs(d.logs || []);
    } catch (e) {
      setErr(e.message);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (!focusJobId) return;
    const exists = jobs?.some((j) => resolveJobId(j) === String(focusJobId));
    if (!exists) return;
    const id = String(focusJobId);
    setLogModalJobId(id);
    void fetchLogs(id);
  }, [focusJobId, jobs, fetchLogs]);

  useEffect(() => {
    if (!logModalJobId) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setLogModalJobId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [logModalJobId]);

  async function cancelJob(jobId) {
    setErr(null);
    try {
      await apiJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: "POST",
      });
      await onRefresh?.();
      if (logModalJobId === jobId) await fetchLogs(jobId);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function retryJob(jobId) {
    setErr(null);
    try {
      const d = await apiJson(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: "POST",
      });
      await onRefresh?.();
      if (d?.job_id != null && d.job_id !== "") {
        const nid = String(d.job_id);
        setLogModalJobId(nid);
        await fetchLogs(nid);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  function fileNameFromPath(pathValue) {
    if (!pathValue) return "";
    return String(pathValue).split("\\").pop().split("/").pop();
  }

  function downloadOutputFromPath(pathValue) {
    const filename = fileNameFromPath(pathValue);
    if (!filename) return;
    return apiDownload(
      `/api/artifacts/download/output/${encodeURIComponent(filename)}`,
      filename
    );
  }

  function openLogModal(jobId) {
    if (jobId == null || jobId === "") return;
    const id = String(jobId);
    setLogModalJobId(id);
    void fetchLogs(id);
  }

  function closeLogModal() {
    setLogModalJobId(null);
    setErr(null);
    setLogs([]);
  }

  const logModal = logModalJobId
    ? createPortal(
      <div
        className="jobs-log-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jobs-log-modal-title"
        onClick={closeLogModal}
      >
        <div className="jobs-log-modal" onClick={(e) => e.stopPropagation()}>
          <div className="jobs-log-modal-header">
            <h2 id="jobs-log-modal-title" className="jobs-log-modal-title">
              작업 로그
            </h2>
            <button type="button" className="jobs-log-modal-close" onClick={closeLogModal}>
              닫기
            </button>
          </div>
          {modalJob ? (
            <>
              <p className="hint" style={{ marginTop: 0 }}>
                작업: <strong>{resolveJobId(modalJob)}</strong> ({modalJob.kind} /{" "}
                {modalJob.status})
              </p>
              <p className="hint" style={{ marginTop: "-0.35rem" }}>
                단계: <strong>{phaseLabel(modalJob.phase, modalJob.status)}</strong> / 진행률{" "}
                <strong>{clampProgress(modalJob.progress)}%</strong>
              </p>
            </>
          ) : (
            <p className="hint" style={{ marginTop: 0 }}>
              작업 ID: <strong>{logModalJobId}</strong> (목록에서 사라진 작업일 수 있습니다.)
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginBottom: "0.65rem" }}
            onClick={() => fetchLogs(logModalJobId)}
          >
            로그 새로고침
          </button>
          {err && <div className="auth-error">{err}</div>}
          <pre className="metrics-pre jobs-log-pre">
            {loadingLogs
              ? "로그를 불러오는 중…"
              : logs?.length
                ? logs.join("\n")
                : "로그가 없습니다."}
          </pre>
        </div>
      </div>,
        document.body
      )
    : null;

  return (
    <div className="grid">
      <section className="panel">
        <h2>실험 작업(Job) 상태</h2>
        <p className="hint">학습/예측 비동기 작업의 상태를 확인합니다.</p>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: "0.75rem" }}
          onClick={onRefresh}
        >
          작업 목록 새로고침
        </button>
        {jobs?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>유형</th>
                  <th>상태</th>
                  <th>진행 단계</th>
                  <th>제출 시각</th>
                  <th>결과</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j, rowIdx) => (
                  <tr key={resolveJobId(j) || `job-row-${rowIdx}`}>
                    <td>{resolveJobId(j).slice(0, 8)}…</td>
                    <td>{j.kind}</td>
                    <td>{j.status}</td>
                    <td className="table-cell-progress">
                      <div style={{ fontSize: 12, marginBottom: 4 }}>
                        {phaseLabel(j.phase, j.status)} ({clampProgress(j.progress)}%)
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: 8,
                          borderRadius: 999,
                          background: "rgba(148, 163, 184, 0.35)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${clampProgress(j.progress)}%`,
                            height: "100%",
                            background:
                              j.status === "failed"
                                ? "linear-gradient(90deg, #f87171, #ef4444)"
                                : j.status === "completed"
                                  ? "linear-gradient(90deg, #34d399, #10b981)"
                                  : "linear-gradient(90deg, #60a5fa, #3b82f6)",
                            transition: "width 0.35s ease",
                          }}
                        />
                      </div>
                    </td>
                    <td>{j.submitted_at || "-"}</td>
                    <td>
                      {j.result?.output_chart_path && (
                        <button
                          type="button"
                          style={{ marginRight: 6, marginBottom: 4 }}
                          onClick={() => downloadOutputFromPath(j.result.output_chart_path)}
                        >
                          차트
                        </button>
                      )}
                      {j.result?.output_path && (
                        <button
                          type="button"
                          style={{ marginBottom: 4 }}
                          onClick={() => downloadOutputFromPath(j.result.output_path)}
                        >
                          출력
                        </button>
                      )}
                      {!j.result?.output_chart_path && !j.result?.output_path && "-"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openLogModal(resolveJobId(j))}
                      >
                        로그 보기
                      </button>
                      {(j.status === "queued" || j.status === "running") && (
                        <button
                          type="button"
                          style={{ marginLeft: 6 }}
                          onClick={() => cancelJob(resolveJobId(j))}
                        >
                          취소
                        </button>
                      )}
                      {(j.status === "failed" ||
                        j.status === "cancelled" ||
                        j.status === "recovered") && (
                        <button
                          type="button"
                          style={{ marginLeft: 6 }}
                          onClick={() => retryJob(resolveJobId(j))}
                        >
                          재시도
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">현재 등록된 작업이 없습니다.</p>
        )}
      </section>
      {logModal}
    </div>
  );
}

