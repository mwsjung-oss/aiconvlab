import { useMemo } from "react";
import { WORKFLOW_STEPS } from "../../workflowConfig.js";

/**
 * Phase 2a · Contextual AI Assist (단계별 컨텍스트 지원 바)
 *
 * 중앙 스테이지 상단에 "현재 단계에서 할 일" 가이드와 함께 3~5개의 빠른
 * 질문 버튼을 노출한다. 버튼 클릭 시 커스텀 이벤트
 * `ailab-ai-chat-insert-text`로 좌측 AI Agent 입력창에 프롬프트가 주입된다.
 *
 * - 현재 단계(activeStepId)에 따라 버튼 세트가 바뀐다.
 * - preset 전환 요청(setPreset) 콜백이 주어지면 단계에 맞는 preset을 한 번 더
 *   맞춰준다(App.jsx에서 상태 끌어올림).
 * - 단계가 매칭되지 않으면 렌더하지 않는다.
 */

const STEP_ASSISTS = {
  step1: {
    preset: "project",
    title: "문제·아이디어를 함께 정리해드려요",
    chips: [
      {
        label: "문제 브리프 생성",
        text: "이 프로젝트의 문제 상황과 해결 목표, KPI, 가능한 데이터·제약을 500자 이내의 브리프로 정리해줘. 필요하면 bullet로.",
      },
      {
        label: "KPI 제안",
        text: "이 과제 유형에 맞는 1차 KPI 3개와 각 KPI의 측정 방법·임계값을 표로 제안해줘.",
      },
      {
        label: "가설 세우기",
        text: "도메인·데이터 제약을 고려해 검증 가능한 가설 3개를 세우고, 각 가설을 검증하기 위한 실험 설계를 짧게 제안해줘.",
      },
      {
        label: "리스크 체크",
        text: "이 프로젝트의 주요 리스크(데이터·모델·비즈니스) 5가지와 완화 방안을 표로 정리해줘.",
      },
    ],
  },
  step2: {
    preset: "data",
    title: "데이터 준비도를 점검해드려요",
    chips: [
      {
        label: "데이터 준비도 체크",
        text: "현재 업로드된 데이터셋 목록과 각 파일의 스키마·결측·이상치 여부를 점검하고, 다음 단계로 가기 전 우선 조치할 항목을 체크리스트로 만들어줘.",
      },
      {
        label: "타깃 후보 제안",
        text: "지금 선택된 과제 유형과 데이터셋 칼럼을 기준으로 타깃(레이블) 후보와 각 후보의 장단점을 추천해줘.",
      },
      {
        label: "품질 검증 계획",
        text: "데이터 품질 검증 계획(완결성·일관성·정확성·시의성·유일성)을 이 데이터셋에 맞춰 짧게 설계해줘.",
      },
      {
        label: "특성 엔지니어링",
        text: "이 데이터에 적용할 만한 특성 엔지니어링 기법 5가지를 우선순위와 함께 추천하고, 각 기법이 어떤 패턴을 잡을지 설명해줘.",
      },
    ],
  },
  step3: {
    preset: "model",
    title: "실험 설계를 제안해드려요",
    chips: [
      {
        label: "베이스라인 추천",
        text: "현재 과제·데이터 크기·특성 구성을 고려해 베이스라인 모델 3개와 각 모델의 하이퍼파라미터 초기값을 제안해줘.",
      },
      {
        label: "검증 전략",
        text: "이 과제에 가장 적합한 검증 전략(hold-out/ k-fold / time-series split 등)을 선택 근거와 함께 추천해줘.",
      },
      {
        label: "지표 설계",
        text: "이 과제의 1차/2차 평가 지표를 정하고, 각 지표가 KPI와 어떻게 연결되는지 한 문장씩 설명해줘.",
      },
      {
        label: "dry_run 계획",
        text: "작은 샘플로 먼저 돌려볼 dry_run 계획(행 수, epoch, 시간 예상)을 제안하고, 성공·실패 기준을 정의해줘.",
      },
    ],
  },
  step4: {
    preset: "model",
    title: "실행 결과를 해석해드려요",
    chips: [
      {
        label: "지표 해석",
        text: "가장 최근 학습의 지표(loss, accuracy, F1 등)를 쉬운 말로 해석하고, 과적합·과소적합 여부를 판정해줘.",
      },
      {
        label: "예측 예시 점검",
        text: "최근 예측 산출의 대표적인 정답·오답 케이스 3건씩을 뽑아 패턴을 요약하고 개선 단서를 제안해줘.",
      },
      {
        label: "Run 요약",
        text: "최근 실행된 run들의 파라미터·데이터셋·지표를 표로 정리하고, 가장 유망한 run을 이유와 함께 골라줘.",
      },
      {
        label: "오류 디버깅",
        text: "최근 실행에서 발생한 에러 로그를 분석하고, 빠르게 시도해 볼 해결 단계 3가지를 제안해줘.",
      },
    ],
  },
  step5: {
    preset: "insights",
    title: "개선 방향을 함께 찾아드려요",
    chips: [
      {
        label: "Run 비교",
        text: "최근 run 2~3건을 비교해, 어떤 파라미터·특성이 지표를 끌어올렸는지 delta 기준으로 설명해줘.",
      },
      {
        label: "다음 실험 추천",
        text: "현재 성과와 병목을 바탕으로 다음에 시도해 볼 실험 3가지(하이퍼파라미터·특성·데이터 측면)를 우선순위와 함께 추천해줘.",
      },
      {
        label: "튜닝 전략",
        text: "지금 모델에서 가장 수익이 큰 하이퍼파라미터 튜닝 축(예: depth, regularization, learning rate)을 선택하고, 실험 범위를 제안해줘.",
      },
      {
        label: "한계·개선",
        text: "이 접근의 한계 3가지와, 각 한계를 완화할 수 있는 실행 가능한 개선 아이디어를 짝지어줘.",
      },
    ],
  },
  step6: {
    preset: "insights",
    title: "리포트·배포를 도와드려요",
    chips: [
      {
        label: "요약 리포트 초안",
        text: "프로젝트 목적, 데이터, 실험 결과, 권고 사항을 1페이지 executive summary로 작성해줘.",
      },
      {
        label: "재현 체크리스트",
        text: "이 실험을 다른 팀원이 재현할 수 있도록, 환경·데이터·설정·명령을 담은 재현 체크리스트를 만들어줘.",
      },
      {
        label: "배포 전 점검",
        text: "모델·데이터·운영 관점의 배포 전 체크리스트(성능·공정성·모니터링·롤백)를 10개 내외로 정리해줘.",
      },
      {
        label: "한 장 슬라이드",
        text: "임원 보고용 한 장 슬라이드에 담을 핵심 수치 5개와 주요 메시지 3줄을 제안해줘.",
      },
    ],
  },
};

function insertToChat(text) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ailab-ai-chat-insert-text", { detail: { text } })
  );
}

/**
 * @param {{
 *   activeStepId?: string | null,
 *   onRequestPreset?: (preset: string) => void,
 * }} props
 */
export default function ContextualAIAssist({
  activeStepId,
  onRequestPreset,
}) {
  const spec = activeStepId ? STEP_ASSISTS[activeStepId] : null;
  const step = useMemo(
    () => WORKFLOW_STEPS.find((s) => s.id === activeStepId),
    [activeStepId]
  );
  if (!spec || !step) return null;

  return (
    <section
      className="contextual-assist"
      aria-label={`${step.label} 단계 AI 도움`}
    >
      <div className="contextual-assist-head">
        <span className="contextual-assist-badge" aria-hidden="true">
          AI 도움
        </span>
        <div className="contextual-assist-titles">
          <strong className="contextual-assist-title">{spec.title}</strong>
          <span className="contextual-assist-sub">
            {step.label} · {step.labelEn}
          </span>
        </div>
        {onRequestPreset && (
          <button
            type="button"
            className="contextual-assist-preset-btn"
            onClick={() => onRequestPreset(spec.preset)}
            title={`AI Agent 프리셋을 '${spec.preset}'로 전환`}
          >
            이 단계 프리셋으로
          </button>
        )}
      </div>
      <div className="contextual-assist-chips" role="group" aria-label="추천 질문">
        {spec.chips.map((c) => (
          <button
            key={c.label}
            type="button"
            className="contextual-assist-chip"
            onClick={() => {
              if (onRequestPreset) onRequestPreset(spec.preset);
              insertToChat(c.text);
            }}
            title={c.text}
          >
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
