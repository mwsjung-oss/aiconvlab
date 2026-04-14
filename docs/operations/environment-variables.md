# Environment Variables Guide

## Frontend (`frontend/.env*`)

공개값만 사용:

- `VITE_API_BASE_URL`
- `VITE_APP_ENV`
- `VITE_LOCAL_API_URL`
- `VITE_LAB_API_URL`
- `VITE_AWS_API_URL`

주의:

- `VITE_*`는 브라우저에 노출됩니다.
- 비밀키/API secret 절대 금지.

## Backend (`backend/.env`)

비밀값과 운영 토글:

- 인증/보안: `JWT_SECRET`, `MASTER_EMAIL`, `MASTER_PASSWORD`
- 런타임: `AILAB_DEFAULT_RUNTIME`, `AILAB_ALLOWED_RUNTIMES`
- 프로바이더 토글: `OPENAI_ENABLED`, `GEMINI_ENABLED`, `AWS_ENABLED`
- 프로바이더 키: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AWS_*`

## 기본 정책

- provider는 기본 `false`
- billing 승인 후에만 `*_ENABLED=true`
- 변경 후 배포 + `/api/providers/status` 확인

