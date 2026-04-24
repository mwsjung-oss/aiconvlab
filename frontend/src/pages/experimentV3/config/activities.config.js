/**
 * Experiment V3 · 표준 Activity 카탈로그
 * ------------------------------------------------------------
 * 5 단계(stage) × 각 단계별 표준 Activity. 구조는 CRISP-DM 과
 * MLOps 관행을 AI 실습 수업 맥락에 맞게 단순화했다.
 *
 * 각 Activity 스키마:
 *   id            고유 문자열 (stage 접두사 권장)
 *   stage         소속 단계 id (define | data | run | analyze | report)
 *   title         좌측 네비 라벨
 *   icon          한 글자 아이콘(이모지 대신 기호) — UI 는 선택적 사용
 *   overview      한 줄 요약 (툴팁/헤더용)
 *   steps         "해야 할 일" 체크리스트(문자열 배열)
 *   deliverables  산출물/완료 정의
 *   promptTemplates  LLM 에 바로 전송 가능한 템플릿 목록
 *                    {label, body} — body 에 {{placeholder}} 가능
 *   codeSnippets  (선택) Python 코드 스타터 — 세션 커널에 즉시 실행 가능
 *                    {label, code}
 *
 * 이 파일은 UI 레이어에서 import 해서 읽기 전용으로만 사용한다.
 * 나중에 사용자 편집을 지원하고 싶다면 백엔드 DB 로 옮기면 된다.
 */

export const STAGES = [
  { id: "define", label: "프로젝트 정의", short: "Define" },
  { id: "data", label: "데이터 준비", short: "Data" },
  { id: "run", label: "실험 설계 및 실행", short: "Design & Run" },
  { id: "analyze", label: "결과 분석", short: "Analyze" },
  { id: "report", label: "보고서 생성", short: "Report" },
];

export const ACTIVITIES = [
  // -------- 1. 프로젝트 정의 --------
  {
    id: "define.goal",
    stage: "define",
    title: "비즈니스 목표 정의",
    icon: "1",
    overview:
      "풀고자 하는 문제를 한 문장으로 정의하고, 왜 중요한지 이해관계자 관점에서 명확히 합니다.",
    steps: [
      "문제 상황을 한 문단(3~5 문장)으로 요약",
      "AI 가 해결하려는 질문(task) 을 구체적으로 기술",
      "성공 시 기대 효과(정량/정성) 서술",
    ],
    deliverables: [
      "문제 정의서(Problem Statement)",
      "이해관계자 목록과 요구사항",
    ],
    promptTemplates: [
      {
        label: "문제 정의 초안",
        body: "다음 도메인의 문제 상황에서 AI 로 풀기 적합한 과업을 3개 제안하고, 각 과업의 입력/출력/성공 지표를 표로 정리해 주세요.\n\n도메인: {{도메인}}\n현재 상황: {{상황 요약}}",
      },
      {
        label: "이해관계자 분석",
        body: "이 프로젝트의 주요 이해관계자(의사결정자, 사용자, 데이터 공급자 등)를 식별하고, 각자의 관심사와 제약사항을 정리해 주세요.",
      },
    ],
  },
  {
    id: "define.kpi",
    stage: "define",
    title: "성공 지표(KPI) 설정",
    icon: "2",
    overview:
      "모델 성능 지표와 비즈니스 지표를 구분해 측정 가능한 목표를 정합니다.",
    steps: [
      "1차 모델 지표(예: F1, AUC, RMSE) 선택과 근거",
      "2차 비즈니스 지표(예: 오탐 비용, 처리 시간) 정의",
      "목표치(Target)와 베이스라인 기준 수립",
    ],
    deliverables: ["지표 정의서", "목표 수준(SLA)"],
    promptTemplates: [
      {
        label: "KPI 선택 도움",
        body: "과업 유형 {{이진분류|다중분류|회귀|...}} 에 대해, 사용 가능한 평가 지표들을 나열하고 각각이 적절한 상황을 비교해 주세요. 불균형 데이터 여부: {{예/아니오}}",
      },
    ],
  },
  {
    id: "define.constraints",
    stage: "define",
    title: "제약 · 리스크 식별",
    icon: "3",
    overview:
      "데이터/시간/비용/규제·윤리 제약과 프로젝트 리스크를 미리 정리합니다.",
    steps: [
      "데이터 프라이버시·규제(개인정보/의료/금융) 확인",
      "인프라 제약(메모리, GPU, 실시간성) 정리",
      "운영 리스크(데이터 편향, 모델 해석성, 재현성) 식별",
    ],
    deliverables: ["리스크 레지스터"],
    promptTemplates: [
      {
        label: "윤리/편향 체크리스트",
        body: "이 과업에서 예상되는 데이터 편향과 윤리 리스크를 체크리스트 형태로 정리하고 완화 방안을 제시해 주세요. 과업: {{과업 설명}}",
      },
    ],
  },
  {
    id: "define.scope",
    stage: "define",
    title: "범위 · 일정 · 산출물",
    icon: "4",
    overview:
      "MVP 범위와 일정, 최종 산출물(모델, 리포트, API 등)을 확정합니다.",
    steps: [
      "MVP 범위 정의(포함/제외)",
      "주요 마일스톤 일정",
      "최종 산출물 목록과 수락 기준",
    ],
    deliverables: ["프로젝트 계획서(한 페이지)"],
    promptTemplates: [
      {
        label: "한 장짜리 프로젝트 계획",
        body: "앞서 정의한 문제/KPI/제약을 바탕으로 '1-page project charter' 를 작성해 주세요. 섹션: 배경, 목표, 범위, 이해관계자, KPI, 리스크, 일정, 산출물.",
      },
    ],
  },

  // -------- 2. 데이터 준비 --------
  {
    id: "data.ingest",
    stage: "data",
    title: "데이터 수집 · 업로드",
    icon: "1",
    overview:
      "CSV/Excel 등 데이터 파일을 업로드하거나 원격 소스에서 불러옵니다.",
    steps: [
      "데이터 소스 확인(파일, DB, API)",
      "파일 업로드(최대 50MB, CSV 권장)",
      "데이터 사전(컬럼 설명) 확보",
    ],
    deliverables: ["원본 데이터셋 파일", "데이터 사전(data dictionary)"],
    promptTemplates: [
      {
        label: "데이터 사전 초안",
        body: "다음 컬럼 목록을 보고 각 컬럼의 의미·타입·단위·결측 가능성 을 추정한 데이터 사전 표를 만들어 주세요.\n\n컬럼: {{컬럼 이름 나열}}",
      },
    ],
    codeSnippets: [
      {
        label: "업로드한 CSV 로드",
        code: "import pandas as pd\ndf = pd.read_csv(FILE_PATH)\nprint('shape:', df.shape)\ndf.head()",
      },
    ],
  },
  {
    id: "data.profile",
    stage: "data",
    title: "데이터 프로파일링",
    icon: "2",
    overview:
      "describe/결측/중복/분포를 점검해 데이터 품질을 수치로 이해합니다.",
    steps: [
      "기술통계(describe)",
      "결측치 비율·패턴",
      "중복 행 탐지",
      "수치형 분포 · 범주형 빈도 시각화",
    ],
    deliverables: ["데이터 품질 리포트"],
    promptTemplates: [
      {
        label: "프로파일 해석",
        body: "아래 df.describe() 와 df.isna().sum() 결과를 해석하고 눈에 띄는 이상치·결측 문제를 3가지로 정리해 주세요.\n\n{{결과 붙여넣기}}",
      },
    ],
    codeSnippets: [
      {
        label: "기본 프로파일",
        code: "print(df.info())\nprint()\nprint('== describe ==')\nprint(df.describe(include='all').T)\nprint()\nprint('== missing ==')\nprint(df.isna().mean().sort_values(ascending=False).head(20))",
      },
      {
        label: "결측·중복 한눈에",
        code: "import matplotlib.pyplot as plt\nmissing = df.isna().mean().sort_values()\nmissing[missing>0].plot(kind='barh', figsize=(6,4), title='Missing ratio')\nplt.tight_layout(); plt.show()\nprint('duplicates:', df.duplicated().sum())",
      },
    ],
  },
  {
    id: "data.clean",
    stage: "data",
    title: "정제 · 결측 처리",
    icon: "3",
    overview:
      "결측/이상치/중복을 정리하고, 타입을 정돈합니다.",
    steps: [
      "중복 제거 및 원인 추적",
      "결측 전략 결정(drop/대치)",
      "이상치 식별과 처리 방침",
      "타입 변환(날짜, 범주)",
    ],
    deliverables: ["정제된 데이터프레임(df_clean)"],
    promptTemplates: [
      {
        label: "결측 처리 전략 제안",
        body: "컬럼별 결측률과 의미를 고려해 각 컬럼에 대해 (drop/mean/median/mode/model-based) 중 어떤 전략이 적절한지 근거와 함께 제안해 주세요.\n\n{{결측률 표}}",
      },
    ],
    codeSnippets: [
      {
        label: "정제 스케치",
        code: "df_clean = df.drop_duplicates().copy()\n# 수치형 결측은 중앙값, 범주형은 최빈값으로\nfor c in df_clean.select_dtypes(include='number').columns:\n    df_clean[c] = df_clean[c].fillna(df_clean[c].median())\nfor c in df_clean.select_dtypes(include='object').columns:\n    df_clean[c] = df_clean[c].fillna(df_clean[c].mode().iloc[0] if df_clean[c].notna().any() else 'UNKNOWN')\nprint('after clean:', df_clean.shape)",
      },
    ],
  },
  {
    id: "data.feature",
    stage: "data",
    title: "특성 공학",
    icon: "4",
    overview:
      "기존 컬럼에서 파생 변수를 만들고, 범주형 인코딩·스케일링을 수행합니다.",
    steps: [
      "파생 변수 아이디어 브레인스토밍",
      "범주형 인코딩(OneHot/Target)",
      "수치형 스케일링(Standard/MinMax)",
      "도메인 기반 규칙 특성",
    ],
    deliverables: ["학습용 X, 타깃 y"],
    promptTemplates: [
      {
        label: "파생 변수 제안",
        body: "다음 컬럼 목록을 보고 분류·예측 성능 향상에 도움이 될 만한 파생 변수 5개를 제안해 주세요. 각 파생 변수의 계산식과 기대 효과를 설명해 주세요.\n\n컬럼: {{컬럼 목록}}, 타깃: {{타깃 컬럼}}",
      },
    ],
    codeSnippets: [
      {
        label: "간단 인코딩+스케일링",
        code: "from sklearn.preprocessing import StandardScaler\nfrom sklearn.compose import ColumnTransformer\nfrom sklearn.preprocessing import OneHotEncoder\n\ntarget = 'TARGET_COLUMN'  # 바꿔 주세요\ny = df_clean[target]\nX = df_clean.drop(columns=[target])\nnum_cols = X.select_dtypes(include='number').columns.tolist()\ncat_cols = X.select_dtypes(include='object').columns.tolist()\npre = ColumnTransformer([\n    ('num', StandardScaler(), num_cols),\n    ('cat', OneHotEncoder(handle_unknown='ignore'), cat_cols),\n])\nprint('num:', len(num_cols), 'cat:', len(cat_cols))",
      },
    ],
  },
  {
    id: "data.split",
    stage: "data",
    title: "학습/검증/테스트 분할",
    icon: "5",
    overview: "데이터 유출 없이 train/valid/test 를 나눕니다.",
    steps: [
      "층화 추출 여부 결정(분류 문제)",
      "시간 순서가 중요한 경우 time-based split",
      "비율 결정(예: 70/15/15)",
    ],
    deliverables: ["X_train, X_val, X_test, y_*"],
    codeSnippets: [
      {
        label: "분할 스케치",
        code: "from sklearn.model_selection import train_test_split\nX_tv, X_test, y_tv, y_test = train_test_split(X, y, test_size=0.15, random_state=42, stratify=y if y.nunique()<20 else None)\nX_train, X_val, y_train, y_val = train_test_split(X_tv, y_tv, test_size=0.1765, random_state=42, stratify=y_tv if y_tv.nunique()<20 else None)\nprint('train', X_train.shape, 'val', X_val.shape, 'test', X_test.shape)",
      },
    ],
  },

  // -------- 3. 실험 설계 및 실행 --------
  {
    id: "run.baseline",
    stage: "run",
    title: "베이스라인 모델",
    icon: "1",
    overview: "가장 단순한 모델로 성능의 하한선을 측정합니다.",
    steps: [
      "과업 유형에 맞는 단순 모델 선택(Dummy, LogReg, LinearReg)",
      "전처리+모델 파이프라인 구성",
      "교차검증으로 일관된 기준 점수 측정",
    ],
    deliverables: ["베이스라인 점수"],
    promptTemplates: [
      {
        label: "베이스라인 선택",
        body: "{{과업 유형}} 에서 권장되는 베이스라인 모델 2개와 이유, 파이프라인 예시 코드를 제시해 주세요.",
      },
    ],
    codeSnippets: [
      {
        label: "LogReg 베이스라인",
        code: "from sklearn.pipeline import Pipeline\nfrom sklearn.linear_model import LogisticRegression\nfrom sklearn.model_selection import cross_val_score\npipe = Pipeline([('pre', pre), ('clf', LogisticRegression(max_iter=1000))])\nscores = cross_val_score(pipe, X_train, y_train, cv=5, scoring='f1_macro')\nprint('baseline f1_macro:', scores.mean().round(4), '+/-', scores.std().round(4))",
      },
    ],
  },
  {
    id: "run.candidates",
    stage: "run",
    title: "후보 모델 비교",
    icon: "2",
    overview:
      "여러 알고리즘을 동일 조건으로 비교해 다음 단계 후보를 좁힙니다.",
    steps: [
      "3~5개 후보 알고리즘 선정",
      "교차검증으로 평균/표준편차 비교",
      "학습 시간·복잡도 함께 기록",
    ],
    deliverables: ["모델 비교 표"],
    codeSnippets: [
      {
        label: "RF / GBM / LogReg 비교",
        code: "from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier\nfrom sklearn.model_selection import cross_val_score\nfrom sklearn.pipeline import Pipeline\nimport time, pandas as pd\ncandidates = {\n    'logreg': LogisticRegression(max_iter=1000),\n    'rf': RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42),\n    'gbm': GradientBoostingClassifier(random_state=42),\n}\nrows = []\nfor name, model in candidates.items():\n    p = Pipeline([('pre', pre), ('clf', model)])\n    t0 = time.time()\n    s = cross_val_score(p, X_train, y_train, cv=5, scoring='f1_macro')\n    rows.append({'model': name, 'mean': s.mean(), 'std': s.std(), 'sec': round(time.time()-t0,1)})\nresult = pd.DataFrame(rows).sort_values('mean', ascending=False)\nresult",
      },
    ],
  },
  {
    id: "run.tune",
    stage: "run",
    title: "하이퍼파라미터 튜닝",
    icon: "3",
    overview:
      "검증 세트에서 GridSearch 또는 RandomSearch 로 세부 조정합니다.",
    steps: [
      "탐색 공간 정의",
      "탐색 전략 선택(Grid/Random/Bayes)",
      "최종 파라미터와 CV 점수 기록",
    ],
    deliverables: ["best_params, best_score"],
    codeSnippets: [
      {
        label: "GridSearch 스케치",
        code: "from sklearn.model_selection import GridSearchCV\nparam = { 'clf__n_estimators': [100, 300], 'clf__max_depth': [None, 8, 16] }\ngs = GridSearchCV(Pipeline([('pre', pre), ('clf', RandomForestClassifier(random_state=42, n_jobs=-1))]), param_grid=param, scoring='f1_macro', cv=5, n_jobs=-1)\ngs.fit(X_train, y_train)\nprint(gs.best_params_, gs.best_score_)",
      },
    ],
  },
  {
    id: "run.final",
    stage: "run",
    title: "최종 학습 · 검증",
    icon: "4",
    overview:
      "선택된 모델과 파라미터로 train+val 전체에 학습하고 test 로 평가합니다.",
    steps: [
      "test 세트는 지금까지 건드리지 않았는지 재확인",
      "최종 모델 학습",
      "주요 지표·리포트 산출",
    ],
    deliverables: ["학습된 모델 객체", "테스트 세트 지표"],
    codeSnippets: [
      {
        label: "최종 fit + classification_report",
        code: "from sklearn.metrics import classification_report\nbest = gs.best_estimator_\nbest.fit(X_tv, y_tv)\ny_pred = best.predict(X_test)\nprint(classification_report(y_test, y_pred))",
      },
    ],
  },
  {
    id: "run.log",
    stage: "run",
    title: "실험 기록 · 버전 관리",
    icon: "5",
    overview:
      "실험 파라미터·결과·데이터 스냅샷을 추적 가능하도록 저장합니다.",
    steps: [
      "실험 ID·태그 부여",
      "파라미터·지표·환경(requirements) 기록",
      "모델 직렬화(joblib/pickle)",
    ],
    deliverables: ["experiment_log.csv", "model.joblib"],
    codeSnippets: [
      {
        label: "joblib 저장",
        code: "import joblib, json, time\nrun_id = time.strftime('%Y%m%d_%H%M%S')\njoblib.dump(best, f'/tmp/model_{run_id}.joblib')\nmeta = {'run_id': run_id, 'best_params': gs.best_params_, 'cv_score': gs.best_score_}\nprint(json.dumps(meta, indent=2, ensure_ascii=False))",
      },
    ],
  },

  // -------- 4. 결과 분석 --------
  {
    id: "analyze.metrics",
    stage: "analyze",
    title: "지표 상세 평가",
    icon: "1",
    overview:
      "주요 지표뿐 아니라 클래스별/구간별 성능 차이를 확인합니다.",
    steps: [
      "전체 지표(정확도/F1/AUC 등)",
      "클래스별·슬라이스별 성능",
      "확률 보정(Calibration)",
    ],
    deliverables: ["지표 리포트"],
    codeSnippets: [
      {
        label: "ROC/AUC + confusion matrix",
        code: "from sklearn.metrics import roc_auc_score, confusion_matrix, ConfusionMatrixDisplay\nimport matplotlib.pyplot as plt\nif hasattr(best, 'predict_proba'):\n    proba = best.predict_proba(X_test)[:,1]\n    print('AUC:', roc_auc_score(y_test, proba))\ncm = confusion_matrix(y_test, y_pred, labels=sorted(y.unique()))\nConfusionMatrixDisplay(cm, display_labels=sorted(y.unique())).plot()\nplt.tight_layout(); plt.show()",
      },
    ],
  },
  {
    id: "analyze.importance",
    stage: "analyze",
    title: "특성 중요도 · 해석",
    icon: "2",
    overview:
      "모델이 어떤 특성을 중요하게 썼는지 확인해 도메인 지식과 대조합니다.",
    steps: [
      "내장 feature_importances_ 또는 coef_",
      "퍼뮤테이션 중요도",
      "SHAP 로컬/전역 해석(선택)",
    ],
    deliverables: ["중요도 차트"],
    codeSnippets: [
      {
        label: "Permutation Importance",
        code: "from sklearn.inspection import permutation_importance\nimport numpy as np\nr = permutation_importance(best, X_test, y_test, n_repeats=5, random_state=42, n_jobs=-1)\nimp = pd.Series(r.importances_mean, index=best.named_steps['pre'].get_feature_names_out()).sort_values(ascending=False).head(15)\nimp.plot(kind='barh', figsize=(6,5), title='Permutation Importance (top 15)')\nplt.gca().invert_yaxis(); plt.tight_layout(); plt.show()",
      },
    ],
  },
  {
    id: "analyze.errors",
    stage: "analyze",
    title: "오류 사례 분석",
    icon: "3",
    overview:
      "모델이 틀린 샘플을 모아 패턴이 있는지 살펴봅니다.",
    steps: [
      "오류 샘플 샘플링",
      "특성 분포와의 관계 확인",
      "대표 사례 스토리 구성",
    ],
    deliverables: ["오류 케이스 보고서"],
    promptTemplates: [
      {
        label: "오류 패턴 해석",
        body: "다음 오분류 샘플들의 공통점과 추정 원인을 정리해 주세요. 각 사례에 대해 완화 방안을 하나씩 제안해 주세요.\n\n{{오류 샘플 표}}",
      },
    ],
  },
  {
    id: "analyze.compare",
    stage: "analyze",
    title: "실험 비교 · 결론",
    icon: "4",
    overview:
      "모든 실험 결과를 종합해 최종 모델과 의사결정 근거를 정리합니다.",
    steps: [
      "실험별 주요 지표 표",
      "성능-복잡도 트레이드오프",
      "최종 선택과 근거",
    ],
    deliverables: ["실험 비교표", "결론 요약"],
    promptTemplates: [
      {
        label: "실험 비교 결론",
        body: "아래 실험 결과 표를 바탕으로, 최종 모델 선택의 근거와 남은 리스크를 정리해 주세요.\n\n{{실험 표}}",
      },
    ],
  },

  // -------- 5. 보고서 생성 --------
  {
    id: "report.summary",
    stage: "report",
    title: "Executive Summary",
    icon: "1",
    overview:
      "의사결정자가 3분 안에 이해할 수 있는 1페이지 요약을 작성합니다.",
    steps: [
      "배경·문제 (3줄)",
      "접근 방법 (3줄)",
      "결과 수치와 의미 (3줄)",
      "다음 단계 권고",
    ],
    deliverables: ["1-page executive summary (Markdown)"],
    promptTemplates: [
      {
        label: "요약 생성",
        body: "다음 실험 결과를 바탕으로 비전문 의사결정자용 1페이지 Executive Summary 를 한국어로 작성해 주세요. 구조: 배경 / 방법 / 결과 / 한계 / 권고.\n\n{{핵심 내용}}",
      },
    ],
  },
  {
    id: "report.method",
    stage: "report",
    title: "방법론 · 데이터 기술",
    icon: "2",
    overview:
      "데이터 출처, 전처리, 모델, 튜닝 절차를 재현 가능하도록 문서화합니다.",
    steps: [
      "데이터 출처·기간·크기",
      "전처리·특성 공학 요점",
      "모델·튜닝 설정",
      "환경(패키지 버전, 난수 시드)",
    ],
    deliverables: ["방법론 섹션 (Markdown)"],
  },
  {
    id: "report.results",
    stage: "report",
    title: "결과 · 해석",
    icon: "3",
    overview:
      "핵심 지표, 시각 자료, 해석을 함께 배치해 주장과 근거를 연결합니다.",
    steps: [
      "핵심 지표 표/그래프",
      "주요 인사이트 3개",
      "비즈니스 의미 연결",
    ],
    deliverables: ["결과 섹션 (Markdown + 이미지)"],
  },
  {
    id: "report.limits",
    stage: "report",
    title: "한계 · 다음 단계",
    icon: "4",
    overview:
      "일반화 한계, 데이터/운영 리스크, 후속 연구 과제를 정리합니다.",
    steps: [
      "데이터·모델 한계",
      "재학습/모니터링 계획",
      "후속 실험 아이디어",
    ],
    deliverables: ["한계/로드맵 섹션"],
  },
  {
    id: "report.export",
    stage: "report",
    title: "내보내기",
    icon: "5",
    overview:
      "Markdown/HTML/Excel 로 내보내 외부 공유 가능하게 만듭니다.",
    steps: [
      "노트북 → Markdown",
      "핵심 표 → Excel/CSV",
      "이미지 자산 번들",
    ],
    deliverables: ["report.md, report.xlsx"],
    codeSnippets: [
      {
        label: "결과 DataFrame 내보내기",
        code: "result.to_csv('/tmp/experiment_result.csv', index=False)\nprint('saved: /tmp/experiment_result.csv')",
      },
    ],
  },
];

export const ACTIVITIES_BY_STAGE = STAGES.reduce((acc, s) => {
  acc[s.id] = ACTIVITIES.filter((a) => a.stage === s.id);
  return acc;
}, {});

export function getActivity(id) {
  return ACTIVITIES.find((a) => a.id === id) || null;
}

export function getFirstActivityOfStage(stageId) {
  return ACTIVITIES.find((a) => a.stage === stageId) || null;
}
