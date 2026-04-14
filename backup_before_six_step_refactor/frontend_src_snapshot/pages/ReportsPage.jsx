import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiDownload, apiJson } from "../api";

function excelDownloadName(filename) {
  const i = filename.lastIndexOf(".");
  const stem = i >= 0 ? filename.slice(0, i) : filename;
  return `${stem}.xlsx`;
}

export default function ReportsPage({
  history,
  reportTemplates = [],
  reportSummary = null,
  reportFiles = [],
}) {
  const rows = (history || []).slice().reverse();

  const [previewFilename, setPreviewFilename] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewErr, setPreviewErr] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const closePreview = useCallback(() => {
    setPreviewFilename(null);
    setPreviewData(null);
    setPreviewErr(null);
    setPreviewLoading(false);
  }, []);

  useEffect(() => {
    if (!previewFilename) return;
    const onKey = (e) => {
      if (e.key === "Escape") closePreview();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewFilename, closePreview]);

  async function openPreview(filename) {
    setPreviewFilename(filename);
    setPreviewData(null);
    setPreviewErr(null);
    setPreviewLoading(true);
    try {
      const data = await apiJson(
        `/api/reports/preview?filename=${encodeURIComponent(filename)}`
      );
      setPreviewData(data);
    } catch (e) {
      setPreviewErr(e?.message || String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  function downloadExcel(filename) {
    apiDownload(
      `/api/reports/download-excel?filename=${encodeURIComponent(filename)}`,
      excelDownloadName(filename)
    ).catch((e) => {
      window.alert(e?.message || "다운로드에 실패했습니다.");
    });
  }

  const previewModal =
    previewFilename &&
    createPortal(
      <div
        className="jobs-log-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-preview-title"
        onClick={closePreview}
      >
        <div className="jobs-log-modal" onClick={(e) => e.stopPropagation()}>
          <div className="jobs-log-modal-header">
            <h2 id="report-preview-title" className="jobs-log-modal-title">
              리포트 미리보기
            </h2>
            <button
              type="button"
              className="jobs-log-modal-close"
              onClick={closePreview}
            >
              닫기
            </button>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            파일: <strong>{previewFilename}</strong>
          </p>
          {previewLoading && <p className="hint">불러오는 중…</p>}
          {previewErr && (
            <div className="msg error" style={{ marginTop: "0.5rem" }}>
              {previewErr}
            </div>
          )}
          {!previewLoading && previewData?.kind === "markdown" && (
            <pre
              className="metrics-pre jobs-log-pre"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {previewData.content}
            </pre>
          )}
          {!previewLoading && previewData?.kind === "csv" && (
            <>
              {previewData.truncated && (
                <p className="hint">
                  미리보기는 상위 500행만 표시합니다. 전체는 Excel로 내려받으세요.
                </p>
              )}
              <div
                className="table-wrap"
                style={{
                  maxHeight: "min(55vh, 520px)",
                  overflow: "auto",
                  marginTop: "0.35rem",
                }}
              >
                <table>
                  <thead>
                    <tr>
                      {(previewData.columns || []).map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(previewData.rows || []).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <div className="grid">
      {previewModal}
      <section className="panel">
        <h2>예측 결과 파일</h2>
        <p className="hint">
          플랫폼에서 바로 예측 원본, Top20, 모델×주차 매트릭스 파일을 확인·받을 수 있습니다.
        </p>
        {reportFiles.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>파일명</th>
                  <th>설명</th>
                  <th>미리보기</th>
                  <th>Excel 다운로드</th>
                </tr>
              </thead>
              <tbody>
                {reportFiles.map((f) => (
                  <tr key={f}>
                    <td>{f}</td>
                    <td>
                      {f.includes("pilot_demand_lab_report")
                        ? "Pilot 학습·예측 누적 마크다운 리포트"
                        : f.includes("metal_24w_forecast_report")
                          ? "Metal 24주 시나리오 마크다운 리포트"
                          : f.includes("_wide_by_model")
                            ? "행=모델, 열=주차 예측 수량"
                            : f.includes("_top20_total")
                              ? "24주 누적수요 상위 20개"
                              : "24주 주간 예측 원본(long)"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          previewLoading && previewFilename === f
                        }
                        onClick={() => openPreview(f)}
                      >
                        미리보기
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => downloadExcel(f)}
                      >
                        Excel 받기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">연결된 예측 결과 파일이 없습니다.</p>
        )}
      </section>
      <section className="panel">
        <h2>해석</h2>
        <p className="hint">
          TFT 요약 또는 Pilot 수요예측 리포트(`pilot_demand_lab_report.md`)에 대한 자동 요약 문단입니다.
        </p>
        {reportSummary?.interpretation ? (
          <>
            <p style={{ lineHeight: 1.65 }}>{reportSummary.interpretation}</p>
            <p className="hint" style={{ marginTop: "0.5rem" }}>
              source: {reportSummary.filename || "-"}
            </p>
          </>
        ) : (
          <p className="hint">표시할 요약 해석이 없습니다. summary 파일 생성 후 다시 확인하세요.</p>
        )}
      </section>
      <section className="panel">
        <h2>Reports</h2>
        <p className="hint">실험 결과를 학생 프로젝트 맥락의 보고서 형식으로 요약합니다.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run/Model</th>
                <th>Dataset</th>
                <th>Task</th>
                <th>Model</th>
                <th>Metrics</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h, i) => (
                <tr key={`${h.model_id}-${i}`}>
                  <td>{h.run_id || h.model_id}</td>
                  <td>{h.dataset || h.filename}</td>
                  <td>{h.task_type}</td>
                  <td>{h.model_type}</td>
                  <td>
                    {h.metrics
                      ? Object.entries(h.metrics)
                          .slice(0, 3)
                          .map(([k, v]) =>
                            `${k}: ${typeof v === "number" ? v.toFixed(3) : v}`
                          )
                          .join(" | ")
                      : "-"}
                  </td>
                  <td>{h.status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h3>Report Templates</h3>
        <ul>
          {reportTemplates.map((tpl) => (
            <li key={tpl.template_id}>
              <strong>{tpl.name}</strong> - {(tpl.sections || []).join(", ")}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h3>원문 요약 (summary.md)</h3>
        {reportSummary?.content ? (
          <pre className="metrics-pre" style={{ maxHeight: 360, overflow: "auto" }}>
            {reportSummary.content}
          </pre>
        ) : (
          <p className="hint">연결된 summary.md가 없습니다.</p>
        )}
      </section>
    </div>
  );
}
