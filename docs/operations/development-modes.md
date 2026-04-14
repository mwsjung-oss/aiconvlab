# Development Modes (Local / Lab)

## Local 개발

1. `backend`에서 uvicorn 실행
2. `frontend`에서 `npm run dev`
3. 로그인 화면 또는 System 탭에서 runtime `local` 선택

권장:

- `backend/.env`에서 `AILAB_DEFAULT_RUNTIME=local`
- `frontend/.env`에서 `VITE_API_BASE_URL` 비움

## Lab 개발

1. 연구실 백엔드 주소 확인
2. `frontend/.env.lab`에 `VITE_LAB_API_URL` 설정
3. `npm run dev:lab` 실행
4. runtime `lab` 선택 (현재 placeholder 경로)

## Cloud 개발 준비

- `VITE_AWS_API_URL` 설정 (선택)
- runtime `cloud` 선택 시 현재는 placeholder 응답

## 장애 대응

- 프론트 상단 배너가 뜨면 백엔드 미가용 상태
- 서비스는 UI를 유지하며 자동 재시도
- `GET /api/health`로 즉시 점검

