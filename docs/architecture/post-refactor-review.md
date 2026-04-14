# Post-refactor Review

리팩터 이후 저장소를 다음 기준으로 점검했습니다:

1. broken imports  
2. duplicated config logic  
3. remaining hardcoded URLs  
4. unused refactor files  
5. env variable inconsistencies  
6. frontend/backend contract mismatches  
7. provider activation TODO clarity

## Safe fixes applied

- **Frontend health contract compatibility fixed**
  - File: `frontend/src/pages/SystemStatusPage.jsx`
  - Change: `apiHealth.ok` 뿐 아니라 `apiHealth.status === "ok"`도 정상으로 처리.
  - Reason: backend `/api/health`는 현재 `{ "status": "ok" }` 형태를 반환.

- **Lab dev script header comment aligned**
  - File: `frontend/scripts/dev-web-lab.mjs`
  - Change: 설명 주석을 `VITE_LAB_API_URL` 우선 + `VITE_DEV_PROXY_TARGET` 호환으로 정정.

## Review findings

### 1) Broken imports

- `npm run build` 통과, `py_compile` 통과 기준에서 **즉시 깨진 import는 발견되지 않음**.
- `frontend/src/api/*`는 호환용 re-export 레이어로 정상 동작 중.

### 2) Duplicated config logic

- **Low-risk duplication**
  - `frontend/src/api.js`에서 `Content-Type` 헤더를 미리 세팅하지만, `requestJson`도 body 타입에 따라 헤더를 처리.
  - 현재 동작 문제는 없으나 장기적으로 책임 경계를 단순화할 여지.

### 3) Remaining hardcoded URLs

- **의도된 dev-only 기본값 존재**
  - `frontend/src/services/config/publicEnv.ts`: `VITE_LOCAL_API_URL` 기본 `http://127.0.0.1:8000`
  - Vite dev plugin들에도 localhost/127.0.0.1 관련 로직 존재.
  - 배포 경로는 `VITE_API_BASE_URL`로 분리되어 있어 운영 위험은 낮음.

### 4) Unused files created during refactor

- 명백한 즉시 미사용/오동작 유발 파일은 확인되지 않음.
- 다만 `frontend/src/services/config/index.ts`는 직접 참조가 거의 없어, 추후 정리 후보.

### 5) Environment variable inconsistencies

- **Risky / needs follow-up**
  - `backend/src/core/settings.py`의 provider toggle(`OPENAI_ENABLED`, `GEMINI_ENABLED`, `AWS_ENABLED`)은
    platform status API에는 반영되지만,
  - 일부 기존 AI chat 경로(`backend/routers/ai_chat.py`, `backend/ai_chat_service.py`, `backend/ai_chat_gemini.py`)는
    여전히 직접 `OPENAI_API_KEY`/`GEMINI_API_KEY`/`GOOGLE_API_KEY`를 읽음.
  - 즉, “토글 off = 실제 호출 차단” 정책이 전체 코드 경로에 완전히 강제되지는 않음.

### 6) Frontend/backend contract mismatches

- **Fixed**
  - `/api/health` 응답 스키마 차이(`ok` vs `status`)는 프론트에서 호환 처리.

- **Risky / semantic mismatch**
  - 프론트의 runtime 선택(`selectedRuntime`)은 현재 `System` 페이지의 dispatch probe에만 반영되고,
    기존 학습/예측 경로(`/api/train`, `/api/predict`, `/api/jobs/*`)에는 직접 연결되지 않음.
  - 기능적으로는 문제 없지만, 사용자 기대(전역 runtime 선택)와 차이가 있을 수 있음.

### 7) TODO clarity for provider activation

- 문서 체크리스트는 존재(`docs/operations/provider-activation-checklist.md`).
- 그러나 코드 레벨 TODO(“기존 ai_chat 경로를 provider registry 경유로 통합”)는 명시가 약함.
- 운영 리스크를 줄이려면 추후 단일 provider 게이트웨이 경로를 명문화하는 것이 안전.

## Risky items (not auto-fixed)

1. **Provider toggle 정책의 부분 적용**
   - 기존 AI chat 코드 경로 전체에 강제되지 않아 billing 승인 전 차단 정책이 우회될 가능성.
2. **Runtime 선택의 부분 적용**
   - UI에서 선택한 runtime이 모든 실행 API에 일관 반영되지 않음.
3. **설정 책임 경계 중복**
   - `frontend/src/api.js` vs `services/api/client.ts` 헤더 처리 책임 중복.

위 항목들은 기능 변경 영향이 있어 본 리뷰에서는 자동 수정하지 않았습니다.

