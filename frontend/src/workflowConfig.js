/**
 * 6단계 AI 라이프사이클 워크플로 (UI 내비·하이라이트용).
 * 기존 currentPage 문자열을 유지하고, 단계만 매핑합니다.
 *
 * TODO: 선택적으로 react-router와 URL 동기화 (/problem-idea 등) — 현재는 App state만 사용.
 */

/** @typedef {{ id: string, label: string, labelEn: string, hint: string, defaultPage: string }} WorkflowStepDef */

/** @type {WorkflowStepDef[]} */
export const WORKFLOW_STEPS = [
  {
    id: "step1",
    label: "문제·아이디어",
    labelEn: "Problem & Idea",
    hint: "문제 정의, KPI, AI Agent",
    defaultPage: "aichat",
  },
  {
    id: "step2",
    label: "데이터",
    labelEn: "Data",
    hint: "업로드, 스키마, EDA, 노트북",
    defaultPage: "upload",
  },
  {
    id: "step3",
    label: "실험 설계",
    labelEn: "Experiment Design",
    hint: "모델·특성·지표·학습 설정",
    defaultPage: "train",
  },
  {
    id: "step4",
    label: "실행·평가",
    labelEn: "Run & Evaluate",
    hint: "예측, 결과, 작업, 실험 실행",
    defaultPage: "predict",
  },
  {
    id: "step5",
    label: "반복·개선",
    labelEn: "Iterate & Optimize",
    hint: "이력, 튜닝, 비교",
    defaultPage: "history",
  },
  {
    id: "step6",
    label: "리포트·배포",
    labelEn: "Report & Deploy",
    hint: "리포트, 요약, 배포 준비",
    defaultPage: "reports",
  },
];

/** 기존 페이지 ID → 워크플로 단계 ID (보조 화면은 null) */
export const PAGE_TO_WORKFLOW_STEP = {
  aichat: "step1",
  projects: "step1",
  upload: "step2",
  datasets_catalog: "step2",
  preview: "step2",
  notebook: "step2",
  train: "step3",
  predict: "step4",
  results: "step4",
  jobs: "step4",
  experiments: "step4",
  history: "step5",
  reports: "step6",
};

/** 단계별 서브 메뉴 (기존 페이지로 연결) */
export const WORKFLOW_SUB_PAGES = {
  step1: [
    { id: "projects", label: "프로젝트" },
    { id: "aichat", label: "AI Agent" },
  ],
  step2: [
    { id: "upload", label: "데이터 업로드" },
    { id: "datasets_catalog", label: "Datasets" },
    { id: "preview", label: "미리보기" },
    { id: "notebook", label: "노트북" },
  ],
  step3: [{ id: "train", label: "모델 학습" }],
  step4: [
    { id: "predict", label: "예측" },
    { id: "results", label: "결과" },
    { id: "jobs", label: "Jobs" },
    { id: "experiments", label: "실험 플랫폼" },
  ],
  step5: [{ id: "history", label: "History" }],
  step6: [{ id: "reports", label: "Reports" }],
};

/** AI Agent 프리셋 (1단계에서만 표시) — App.jsx 상태와 동일한 preset 값 */
export const AI_CHAT_PRESETS = [
  { preset: "overview", label: "AI Agent · 전체" },
  { preset: "project", label: "AI Agent · 프로젝트 정의" },
  { preset: "data", label: "AI Agent · 데이터 검증" },
  { preset: "model", label: "AI Agent · 모델·실험" },
  { preset: "insights", label: "AI Agent · 결과 해설" },
];

/**
 * @param {string | undefined} pageId
 * @returns {string | null}
 */
export function getWorkflowStepForPage(pageId) {
  if (!pageId) return null;
  return PAGE_TO_WORKFLOW_STEP[pageId] ?? null;
}
/**
 * Experiment workflow sidebar (AI Agent) stage hints (markdown).
 * @param {string | null | undefined} stepId
 */
export function getWorkflowStepSidebarMessage(stepId) {
  const id = stepId && WORKFLOW_STEPS.some((s) => s.id === stepId) ? stepId : "step1";
  const step = WORKFLOW_STEPS.find((s) => s.id === id);
  const n = WORKFLOW_STEPS.findIndex((s) => s.id === id) + 1;
  const head = `**${n}. ${step.label}** · *${step.labelEn}*`;
  const tail = "\n\n**아래 입력란**에 작성한 내용을 **➤**로 보내면 이 단계에 맞는 AI 응답이 이어집니다.";
  const para = {
    step1: "이 단계에서는 **무엇이 문제인지**, **성공 기준(KPI)**, **가능한 데이터·제약**을 구체화합니다. 브리프 또는 아이디어 초안이나 bullet로 적어 보세요.",
    step2: "**데이터 업로드·카탈로그·미리보기**와 함께 스키마·결측·분포·타깃 후보를 점검합니다. 파일명·열 이름·과제 유형(분류/회귀 등)을 알려주면 다음 작업을 제안합니다.",
    step3: "**모델·특성·지표·학습 설정**을 정합니다. 입력 특성, 검증 방법, 베이스라인을 전제로 대화로 정리한 후 **dry_run** 또는 소규모 학습으로 설계를 검증해 보세요.",
    step4: "**학습 실행, 예측, 결과 화면, Jobs·실험 플랫폼**에서 나온 산출을 해석합니다. run id·model id·지표를 주시면 비교·설명이 정리되기 쉽습니다.",
    step5: "**이력·run 비교**로 개선 방향을 잡습니다. 어떤 설정이 더 나았는지, 무엇을 바꾸야 할지(하이퍼파라미터·특성)를 함께 정하면 좋습니다.",
    step6: "**리포트 초안·요약·재현 및 배포 전 체크리스트**를 다루고, 이해관계(교수·팀·운영)와 제출 형식을 알려주면 구조를 잡기 쉽습니다.",
  };
  return `${head}\n\n${para[id]}${tail}`;
}

/** True if this page belongs to the 6-step experiment workflow shell. */
export function isExperimentWorkflowPage(pageId) {
  if (!pageId) return false;
  return PAGE_TO_WORKFLOW_STEP[pageId] != null;
}
