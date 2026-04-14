# Pre-change Analysis (Conservative Plan)

본 문서는 **대규모 코드 재작성 없이**, 현재 저장소를 기준으로 다음 변경 단계를 안전하게 진행하기 위한 사전 분석입니다.

## 1) Current frontend structure

- **앱 엔트리/오케스트레이션**
  - `frontend/src/App.jsx`에 페이지 라우팅 성격의 상태 전환(`currentPage`)과 데이터 로딩, 폴링, 액션 핸들러가 집중되어 있음.
- **페이지 계층**
  - `frontend/src/pages/*`에 도메인별 화면(`Dashboard`, `Projects`, `Train`, `Jobs`, `SystemStatus` 등) 존재.
- **서비스 계층(phase1/2 도입)**
  - `frontend/src/services/config/*`: 공개 env 접근(`publicEnv.ts`)
  - `frontend/src/services/runtime/*`: 백엔드 모드/런타임 선택 상태(`backendMode.ts`, `selectedRuntime.ts`, `devBackendBootstrap.ts`)
  - `frontend/src/services/api/*`: API 클라이언트(`client.ts`)
- **호환 레이어**
  - `frontend/src/api/*`는 기존 import 경로 유지를 위한 re-export 성격.
- **스타일**
  - `frontend/src/App.css` 단일 대형 파일 중심(규모가 큼, 공통/페이지 스타일 혼재).

## 2) Current backend structure

- **레거시 메인 집중 구조**
  - `backend/main.py`가 매우 큰 단일 파일로 다수 엔드포인트와 비즈니스 로직을 직접 포함.
- **기존 라우터**
  - `backend/routers/*`에 auth/admin/portal/ml/notebook/ai_chat 등 기능별 라우터 존재.
- **phase2 신규 계층**
  - `backend/src/core/*`: 설정/CORS
  - `backend/src/runtimes/*`: runtime 추상화(local/lab/cloud)
  - `backend/src/providers/*`: provider 추상화(openai/gemini/aws/mock)
  - `backend/src/api/v1/platform.py`: `/api/config`, `/api/runtimes`, `/api/providers/status`, `/api/jobs/dispatch` 등
  - `backend/src/services/platform/job_store.py`: in-memory 상태 저장
- **혼재 상태**
  - `backend/main.py` + `backend/routers/*` + `backend/src/*`가 병행되는 과도기 구조.

## 3) Config/env problems

- **설정 소스 분산**
  - `backend/src/core/settings.py` 도입됐지만, 다수 모듈이 여전히 `os.getenv(...)`를 직접 사용.
- **동일 의미 키의 이중성**
  - 프론트에서 `VITE_LAB_API_URL` + 레거시 `VITE_DEV_PROXY_TARGET` 동시 지원(호환 목적이지만 장기적으로 중복).
  - 백엔드에서 `GEMINI_API_KEY`와 `GOOGLE_API_KEY` 동시 fallback.
- **운영/개발 키 혼재**
  - 예시 파일에 운영 키와 개발 힌트가 섞여 있어, “필수/선택/개발 전용” 구분이 더 명확할 필요.
- **메인 설정 정책 중앙화 부족**
  - runtime/provider 활성화 키는 central settings에 있으나, AI chat/메일/노트북 관련 키는 점진 이관 필요.

## 4) Hardcoded endpoint issues

- **프론트 dev 전제 하드코딩**
  - `127.0.0.1:8000` 기본값은 개발 편의상 유지되나, 운영 관점에서는 “dev-only default”임이 더 명확해야 함.
- **dev plugin 내부 localhost 가정**
  - Vite dev 플러그인에서 로컬 요청 검사/uvicorn 기동 관련 `127.0.0.1` 가정 존재(의도된 dev 전용 로직).
- **문서/메시지의 레거시 키 노출**
  - 일부 주석/안내에 `VITE_DEV_PROXY_TARGET`이 여전히 노출됨(현재는 호환용).
- **백엔드 기본 URL 하드코딩**
  - `BACKEND_PUBLIC_URL` 기본값 `http://127.0.0.1:8000`은 로컬 기본값으로 합리적이나, 운영 배포 시 명시 설정 강제가 필요.

## 5) Runtime/provider abstraction introduction points

- **Backend API 진입점**
  - 신규 작업 흐름은 `backend/src/api/v1/platform.py`를 기준으로 확장하는 것이 안전.
- **레거시 job 엔드포인트 접점**
  - `backend/main.py`의 기존 `/api/jobs/*` 계열과 `platform` 계열을 연결/정렬하는 어댑터 층 필요.
- **상태 저장소**
  - 현재 `InMemoryJobStore`는 단일 프로세스 전용. 배포용으로는 영속 저장(DB/큐)으로 교체 포인트가 명확함.
- **Provider 사용 경로**
  - 현재 status는 추상화됨. 실제 호출 경로(`ai_chat_service.py`, `routers/ai_chat.py`, brief 관련 모듈)에 provider registry 주입 포인트를 단계적으로 마련해야 함.
- **Frontend 통합 지점**
  - `SystemStatusPage.jsx`는 운영 상태 관찰에 적합한 진입점.
  - `App.jsx`의 대형 상태/로딩 로직 일부를 `services/*` 혹은 작은 hooks로 분리할 여지 큼.

## 6) Safe incremental change order

1. **관측 강화(무중단)**
   - 기존 API 유지, `/api/config|runtimes|providers/status`를 기준으로 운영 상태 확인 지표 정리.
2. **설정 키 정리(하위호환 유지)**
   - 문서에서 canonical 키 우선순위 명시 (`VITE_LAB_API_URL` 우선, `VITE_DEV_PROXY_TARGET` 레거시).
   - 백엔드도 key alias 정책을 문서화하고 점진 축소.
3. **Runtime 경로 연결**
   - 기존 `/api/jobs/*` 요청 중 일부를 내부적으로 runtime registry 경유하도록 adapter 추가.
   - 외부 응답 스키마는 기존과 호환 유지.
4. **Provider 호출 경계 도입**
   - AI chat/brief 모듈에서 직접 env 확인 대신 provider 상태 레이어를 우선 참조.
   - `ENABLED=false` 시 즉시 안전 응답 반환.
5. **Job store 영속화 준비**
   - `InMemoryJobStore` 인터페이스를 유지한 채 구현만 교체 가능한 형태로 분리.
6. **Frontend App 분리(저위험부터)**
   - `App.jsx`에서 순수 로딩 함수/폴링 로직을 작은 custom hook으로 점진 분리.
7. **최종 정리**
   - deprecated 키 사용률 확인 후 제거 일정만 수립(즉시 삭제 금지).

## Conservative guardrails

- 기존 엔드포인트/응답 스키마를 우선 보존.
- runtime/provider는 “기능 확장”보다 “호환 + 안전 실패”를 우선.
- 외부 API 실제 호출/프로비저닝은 billing 승인 전 금지.
- 변경은 작은 단위로 나누고 매 단계 빌드/컴파일/헬스체크로 검증.

