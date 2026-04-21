import { useMemo } from "react";
import StepBlock from "../StepBlock.jsx";
import ContextualAIAssist from "../ContextualAIAssist.jsx";
import InlineAgentOutput from "../InlineAgentOutput.jsx";
import { Field, NButton } from "../primitives.jsx";

const AUDIENCES = ["student", "professor", "executive", "client"];
const REPORT_TYPES = ["summary", "full", "slides", "stakeholder"];
const EXPORT_TYPES = ["markdown", "pdf", "html"];

export default function ReportExportBlock({
  state,
  patch,
  ui,
  onToggle,
  active,
  onFocus,
}) {
  const report = state.report;
  const run = state.run;
  const problem = state.problem;
  const model = state.model;
  const runs = Array.isArray(state.runs) ? state.runs : [];
  const bestRun = runs.find((r) => r.isBest) || runs[0];

  const buildContext = () =>
    [
      problem.objective && `목표: ${problem.objective}`,
      problem.kpi && `KPI: ${problem.kpi}`,
      model.baselineModel && `Baseline: ${model.baselineModel}`,
      bestRun?.metrics && `Best run metrics: ${JSON.stringify(bestRun.metrics)}`,
      run.metrics && `Latest metrics: ${JSON.stringify(run.metrics)}`,
      `대상 독자: ${report.audience}`,
      `보고서 종류: ${report.reportType}`,
    ]
      .filter(Boolean)
      .join("\n");

  const actions = [
    {
      id: "draft",
      label: "보고서 초안",
      icon: "📄",
      build: () => ({
        agent: "report",
        task: `프로젝트를 ${report.audience} 독자에게 ${report.reportType} 형식으로 설명하는 보고서의 executive_summary / key_findings / recommendations / risks / next_experiments 를 작성해 주세요.\n${buildContext()}`,
      }),
    },
    {
      id: "slides",
      label: "프레젠테이션 요약",
      icon: "📽️",
      build: () => ({
        agent: "report",
        task: `8장 슬라이드용 요약(executive_summary 1단락 + key_findings 5개 + recommendations 3개)을 작성해 주세요.\n${buildContext()}`,
      }),
    },
    {
      id: "exec",
      label: "임원용 리라이트",
      icon: "🎩",
      build: () => ({
        agent: "report",
        task: `현업 임원이 90초 안에 읽을 수 있도록 executive_summary 를 3문장, key_findings 3개, recommendations 3개로 축약해 주세요.\n${buildContext()}`,
      }),
    },
  ];

  const previewMarkdown = useMemo(() => {
    return renderPreview({ report, problem, model, bestRun, run });
  }, [report, problem, model, bestRun, run]);

  const download = () => {
    const blob = new Blob([previewMarkdown], {
      type: report.exportType === "html" ? "text/html" : "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ext = report.exportType === "html" ? "html" : "md";
    a.href = url;
    a.download = `aps-report-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <StepBlock
      id="block-report"
      index="6"
      title="Report & Deploy · 리포트·배포"
      subtitle="대상 독자에 맞춰 보고서를 초안 작성하고 아티팩트로 내보냅니다."
      status={report.agentOutput ? "done" : "idle"}
      expanded={report.expanded}
      active={active}
      onToggle={onToggle}
      onFocusBlock={onFocus}
    >
      <div className="notebook-block__row">
        <Field label="보고서 종류" htmlFor="rp-type">
          <select
            id="rp-type"
            value={report.reportType}
            onChange={(e) => patch({ reportType: e.target.value })}
          >
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="대상 독자" htmlFor="rp-aud">
          <select
            id="rp-aud"
            value={report.audience}
            onChange={(e) => patch({ audience: e.target.value })}
          >
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <Field label="내보내기 형식" htmlFor="rp-exp">
          <select
            id="rp-exp"
            value={report.exportType}
            onChange={(e) => patch({ exportType: e.target.value })}
          >
            {EXPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="notebook-report__preview" aria-label="보고서 미리보기">
        {previewMarkdown || <span className="notebook-empty">미리보기가 여기에 표시됩니다.</span>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <NButton variant="primary" icon="⬇" onClick={download}>
          미리보기 내려받기
        </NButton>
        <NButton
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(previewMarkdown);
          }}
        >
          복사
        </NButton>
      </div>

      <ContextualAIAssist
        blockKey="report"
        actions={actions}
        provider={ui.provider}
        useRag={ui.useRag}
        onResult={(output, meta) => {
          patch({
            agentOutput: output,
            agentMeta: meta,
            preview: output?.executive_summary || report.preview,
          });
        }}
      />

      {report.agentOutput ? (
        <InlineAgentOutput output={report.agentOutput} meta={report.agentMeta} />
      ) : null}
    </StepBlock>
  );
}

function renderPreview({ report, problem, model, bestRun, run }) {
  const lines = [];
  lines.push(`# ${problem.title || "AI 실험 보고서"}`);
  lines.push("");
  lines.push(`- 작성일: ${new Date().toISOString()}`);
  lines.push(`- 대상 독자: ${report.audience}`);
  lines.push(`- 보고서 종류: ${report.reportType}`);
  lines.push("");

  if (report.agentOutput?.executive_summary) {
    lines.push(`## Executive Summary`);
    lines.push(report.agentOutput.executive_summary);
    lines.push("");
  } else if (problem.objective) {
    lines.push(`## Objective`);
    lines.push(problem.objective);
    lines.push("");
  }

  if (problem.kpi) {
    lines.push(`## KPI`);
    lines.push(problem.kpi);
    lines.push("");
  }

  if (model.baselineModel || model.candidateModels) {
    lines.push(`## Modeling`);
    if (model.baselineModel) lines.push(`- Baseline: ${model.baselineModel}`);
    if (model.candidateModels)
      lines.push(`- Candidates: ${model.candidateModels}`);
    lines.push("");
  }

  if (bestRun?.metrics) {
    lines.push(`## Best Run · ${bestRun.name}`);
    for (const [k, v] of Object.entries(bestRun.metrics)) {
      lines.push(`- ${k}: ${typeof v === "number" ? v.toFixed(3) : v}`);
    }
    lines.push("");
  } else if (run?.metrics) {
    lines.push(`## Latest Run metrics`);
    for (const [k, v] of Object.entries(run.metrics)) {
      lines.push(`- ${k}: ${typeof v === "number" ? v.toFixed(3) : v}`);
    }
    lines.push("");
  }

  if (Array.isArray(report.agentOutput?.key_findings)) {
    lines.push(`## Key findings`);
    report.agentOutput.key_findings.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  if (Array.isArray(report.agentOutput?.recommendations)) {
    lines.push(`## Recommendations`);
    report.agentOutput.recommendations.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  if (Array.isArray(report.agentOutput?.risks) && report.agentOutput.risks.length) {
    lines.push(`## Risks`);
    report.agentOutput.risks.forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  return lines.join("\n");
}
