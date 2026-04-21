import StepBlock from "../StepBlock.jsx";
import ContextualAIAssist from "../ContextualAIAssist.jsx";
import InlineAgentOutput from "../InlineAgentOutput.jsx";
import { Field } from "../primitives.jsx";

export default function ProblemDefinitionBlock({ state, patch, ui, onToggle, active, onFocus }) {
  const data = state.problem;

  const buildContext = () =>
    [
      data.title && `프로젝트 제목: ${data.title}`,
      data.objective && `목표: ${data.objective}`,
      data.kpi && `KPI: ${data.kpi}`,
      data.constraints && `제약: ${data.constraints}`,
      data.notes && `비고: ${data.notes}`,
    ]
      .filter(Boolean)
      .join("\n");

  const actions = [
    {
      id: "brief",
      label: "문제 브리프 생성",
      icon: "📝",
      hint: "입력한 목표/KPI를 바탕으로 프로젝트 브리프를 구성합니다.",
      build: () => ({
        agent: "data",
        task: `아래 정보를 바탕으로 데이터 프로젝트 브리프(dataset_summary 포함)를 작성해 주세요.\n${buildContext() || "(아직 입력이 거의 없음)"}`,
      }),
    },
    {
      id: "kpi",
      label: "KPI 제안",
      icon: "🎯",
      hint: "목표에 부합하는 KPI 후보와 측정 방식을 제안합니다.",
      build: () => ({
        agent: "data",
        task: `다음 목표에 어울리는 KPI 3~5개와 측정 방법을 JSON으로 정리해 주세요.\n목표: ${data.objective || "(미정)"}\n프로젝트: ${data.title || "(미정)"}`,
      }),
    },
    {
      id: "refine",
      label: "목표 문장 정제",
      icon: "✍️",
      hint: "Objective를 더 구체적이고 실행 가능한 형태로 다듬습니다.",
      build: () => ({
        agent: "data",
        task: `다음 objective를 SMART 원칙에 맞춰 명확하고 측정 가능한 한 문장으로 다듬어 target_candidates 필드에 대안 2개를 넣어 주세요.\nobjective: ${data.objective || "(미정)"}`,
      }),
    },
  ];

  return (
    <StepBlock
      id="block-problem"
      index="1"
      title="Problem & Idea · 문제·아이디어"
      subtitle="무엇을 풀 것인지, 성공 기준, 제약 조건을 명확히 합니다."
      status={data.status}
      expanded={data.expanded}
      active={active}
      onToggle={onToggle}
      onFocusBlock={onFocus}
    >
      <div className="notebook-block__row">
        <Field label="프로젝트 제목" htmlFor="p-title" full>
          <input
            id="p-title"
            type="text"
            value={data.title}
            placeholder="예: 전력 수요 Day-ahead 예측"
            onChange={(e) => patch({ title: e.target.value, status: data.status === "idle" ? "in_progress" : data.status })}
          />
        </Field>
        <Field label="Objective · 목표" htmlFor="p-obj" full>
          <textarea
            id="p-obj"
            rows={2}
            placeholder="한 문장으로 명확히. 예: 다음날 시간별 전력수요를 MAPE 8% 이하로 예측한다."
            value={data.objective}
            onChange={(e) => patch({ objective: e.target.value })}
          />
        </Field>
        <Field label="KPI" htmlFor="p-kpi">
          <input
            id="p-kpi"
            type="text"
            placeholder="예: MAPE 8%, P90 latency 200ms"
            value={data.kpi}
            onChange={(e) => patch({ kpi: e.target.value })}
          />
        </Field>
        <Field label="제약 · Constraints" htmlFor="p-con">
          <input
            id="p-con"
            type="text"
            placeholder="예: 기존 DB 스키마 유지, GPU 미사용"
            value={data.constraints}
            onChange={(e) => patch({ constraints: e.target.value })}
          />
        </Field>
        <Field label="비고 · Notes" htmlFor="p-notes" full>
          <textarea
            id="p-notes"
            rows={2}
            placeholder="가설, 참고 문헌, 이전 실험 링크 등"
            value={data.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </Field>
      </div>

      <ContextualAIAssist
        blockKey="problem"
        actions={actions}
        provider={ui.provider}
        useRag={ui.useRag}
        onResult={(output, meta) => {
          patch({ agentOutput: output, agentMeta: meta, status: "done" });
        }}
      />

      {data.agentOutput ? (
        <InlineAgentOutput output={data.agentOutput} meta={data.agentMeta} />
      ) : null}
    </StepBlock>
  );
}
