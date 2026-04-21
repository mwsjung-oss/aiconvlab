import StepBlock from "../StepBlock.jsx";
import ContextualAIAssist from "../ContextualAIAssist.jsx";
import InlineAgentOutput from "../InlineAgentOutput.jsx";
import { Field } from "../primitives.jsx";

const PROBLEM_TYPES = [
  "classification",
  "regression",
  "forecasting",
  "clustering",
  "ranking",
  "anomaly_detection",
];

export default function ModelDesignBlock({
  state,
  patch,
  ui,
  onToggle,
  active,
  onFocus,
}) {
  const model = state.model;
  const problem = state.problem;
  const data = state.data;

  const buildContext = () =>
    [
      problem.objective && `목표: ${problem.objective}`,
      problem.kpi && `KPI: ${problem.kpi}`,
      data.targetColumn && `target 컬럼: ${data.targetColumn}`,
      data.typeSummary && `데이터 타입: ${data.typeSummary}`,
      model.candidateModels && `현재 후보 모델: ${model.candidateModels}`,
      model.parameters && `초기 파라미터 메모: ${model.parameters}`,
      model.notes && `설계 노트: ${model.notes}`,
    ]
      .filter(Boolean)
      .join("\n");

  const actions = [
    {
      id: "recommend",
      label: "모델 추천",
      icon: "🧠",
      hint: "문제 유형·KPI에 맞춘 모델 2~4개를 추천합니다.",
      build: () => ({
        agent: "model",
        task: `problem_type=${model.problemType || "auto"} 기준으로 recommended_models 3~4개와 각각의 rationale/hyperparameters, validation_strategy 를 제안해 주세요.\n${buildContext() || "(입력 부족)"}`,
      }),
    },
    {
      id: "baseline",
      label: "베이스라인 하이퍼파라미터",
      icon: "⚙️",
      hint: "baseline 모델과 시작 하이퍼파라미터를 구체적으로 제시합니다.",
      build: () => ({
        agent: "model",
        task: `가장 간단한 baseline 모델과 그에 대응하는 초기 hyperparameters 그리드를 추천해 주세요. 사용자 정의 baseline: ${model.baselineModel || "(미정)"}\n${buildContext() || "(입력 부족)"}`,
      }),
    },
    {
      id: "tradeoffs",
      label: "모델 트레이드오프 설명",
      icon: "⚖️",
      hint: "각 후보 모델의 장단점과 언제 쓸지를 요약합니다.",
      build: () => ({
        agent: "model",
        task: `recommended_models 에 포함할 2~3개 후보를 제시하고, 각 모델의 rationale 에 해석 가능성/학습 시간/데이터량 요구 트레이드오프를 반드시 포함해 주세요.\n${buildContext() || "(입력 부족)"}`,
      }),
    },
  ];

  return (
    <StepBlock
      id="block-model"
      index="3"
      title="Experiment Design · 모델 설계"
      subtitle="문제 유형과 후보 모델을 정의하고 실험 계획을 수립합니다."
      status={model.status}
      expanded={model.expanded}
      active={active}
      onToggle={onToggle}
      onFocusBlock={onFocus}
    >
      <div className="notebook-block__row">
        <Field label="문제 유형" htmlFor="m-ptype">
          <select
            id="m-ptype"
            value={model.problemType}
            onChange={(e) => patch({ problemType: e.target.value })}
          >
            {PROBLEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Baseline 모델" htmlFor="m-base">
          <input
            id="m-base"
            type="text"
            placeholder="예: LogisticRegression, XGBoost default"
            value={model.baselineModel}
            onChange={(e) => patch({ baselineModel: e.target.value })}
          />
        </Field>
        <Field label="후보 모델" htmlFor="m-cand" full>
          <textarea
            id="m-cand"
            rows={2}
            placeholder="쉼표 또는 줄바꿈 구분. 예: XGBoost, LightGBM, RandomForest"
            value={model.candidateModels}
            onChange={(e) => patch({ candidateModels: e.target.value })}
          />
        </Field>
        <Field label="파라미터 · 그리드" htmlFor="m-params" full>
          <textarea
            id="m-params"
            rows={3}
            placeholder="예: xgb.max_depth in [4,6,8], n_estimators in [200,400]"
            value={model.parameters}
            onChange={(e) => patch({ parameters: e.target.value })}
          />
        </Field>
        <Field label="실험 노트" htmlFor="m-notes" full>
          <textarea
            id="m-notes"
            rows={2}
            placeholder="탐색할 가설, 실험 범위 제한 등"
            value={model.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </Field>
      </div>

      <ContextualAIAssist
        blockKey="model"
        actions={actions}
        provider={ui.provider}
        useRag={ui.useRag}
        onResult={(output, meta) => {
          patch({ agentOutput: output, agentMeta: meta, status: "done" });
        }}
      />

      {model.agentOutput ? (
        <InlineAgentOutput output={model.agentOutput} meta={model.agentMeta} />
      ) : null}
    </StepBlock>
  );
}
