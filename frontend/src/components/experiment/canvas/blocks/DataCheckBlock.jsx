import StepBlock from "../StepBlock.jsx";
import ContextualAIAssist from "../ContextualAIAssist.jsx";
import InlineAgentOutput from "../InlineAgentOutput.jsx";
import { Field } from "../primitives.jsx";

export default function DataCheckBlock({
  state,
  patch,
  ui,
  onToggle,
  active,
  onFocus,
  datasetOptions = [],
}) {
  const data = state.data;
  const problem = state.problem;

  const buildContext = () =>
    [
      problem.objective && `목표: ${problem.objective}`,
      data.datasetId && `데이터셋 ID: ${data.datasetId}`,
      data.targetColumn && `target 컬럼 후보: ${data.targetColumn}`,
      data.featureNotes && `feature 메모: ${data.featureNotes}`,
      data.nullSummary && `결측 요약: ${data.nullSummary}`,
      data.typeSummary && `타입 요약: ${data.typeSummary}`,
    ]
      .filter(Boolean)
      .join("\n");

  const actions = [
    {
      id: "quality",
      label: "데이터 품질 분석",
      icon: "🔍",
      hint: "결측·편향·누수·분포 관련 리스크를 짚어냅니다.",
      build: () => ({
        agent: "data",
        task: `데이터 품질 리뷰를 진행해 data_quality_concerns 위주로 5개 이상 지적하고, recommended_preprocessing을 구체적으로 제시해 주세요.\n${buildContext() || "(입력 부족)"}`,
      }),
    },
    {
      id: "target",
      label: "타겟·피처 설정 제안",
      icon: "🎯",
      hint: "Objective에 맞춘 target/feature 매핑을 제안합니다.",
      build: () => ({
        agent: "data",
        task: `다음 상황에 맞는 target_candidates 와 feature_groups 를 제안해 주세요.\n${buildContext() || "(입력 부족)"}`,
      }),
    },
    {
      id: "pre",
      label: "전처리 추천",
      icon: "🧰",
      hint: "구체적인 전처리 단계 체크리스트를 생성합니다.",
      build: () => ({
        agent: "data",
        task: `아래 데이터를 모델 학습 가능한 형태로 만들기 위한 recommended_preprocessing 10개 이내 순차 체크리스트를 작성해 주세요.\n${buildContext() || "(입력 부족)"}`,
      }),
    },
  ];

  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  return (
    <StepBlock
      id="block-data"
      index="2"
      title="Data · 데이터 점검"
      subtitle="데이터 스키마·샘플·품질을 확인하고 타겟/피처 계획을 확정합니다."
      status={data.status}
      expanded={data.expanded}
      active={active}
      onToggle={onToggle}
      onFocusBlock={onFocus}
    >
      <div className="notebook-block__row">
        <Field label="데이터셋" htmlFor="d-ds">
          <select
            id="d-ds"
            value={data.datasetId}
            onChange={(e) => patch({ datasetId: e.target.value })}
          >
            <option value="">— 선택하세요 —</option>
            {datasetOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target 컬럼" htmlFor="d-t">
          <input
            id="d-t"
            type="text"
            placeholder="예: churn, sales_qty"
            value={data.targetColumn}
            onChange={(e) => patch({ targetColumn: e.target.value })}
          />
        </Field>
        <Field label="Null 요약 · 붙여넣기 가능" htmlFor="d-null" full>
          <textarea
            id="d-null"
            rows={2}
            placeholder="예: age 12% null, purchase_date 3% null ..."
            value={data.nullSummary}
            onChange={(e) => patch({ nullSummary: e.target.value })}
          />
        </Field>
        <Field label="Type 요약" htmlFor="d-type" full>
          <textarea
            id="d-type"
            rows={2}
            placeholder="예: id int, region str(7 unique), price float ..."
            value={data.typeSummary}
            onChange={(e) => patch({ typeSummary: e.target.value })}
          />
        </Field>
        <Field label="Feature 메모" htmlFor="d-notes" full>
          <textarea
            id="d-notes"
            rows={2}
            placeholder="가능한 파생 변수, 유지/제거 기준 등"
            value={data.featureNotes}
            onChange={(e) => patch({ featureNotes: e.target.value })}
          />
        </Field>
      </div>

      {warnings.length > 0 ? (
        <div className="notebook-output">
          <div className="notebook-output__title">⚠ Warnings</div>
          <ul className="notebook-output__list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ContextualAIAssist
        blockKey="data"
        actions={actions}
        provider={ui.provider}
        useRag={ui.useRag}
        onResult={(output, meta) => {
          patch({
            agentOutput: output,
            agentMeta: meta,
            status: "done",
            warnings: Array.isArray(output?.data_quality_concerns)
              ? output.data_quality_concerns
              : warnings,
          });
        }}
      />

      {data.agentOutput ? (
        <InlineAgentOutput output={data.agentOutput} meta={data.agentMeta} />
      ) : null}
    </StepBlock>
  );
}
