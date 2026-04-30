# Cloudflare Pages Template

This folder contains minimal templates for hosting only the frontend on Cloudflare Pages.

## Build settings

- Framework preset: `Vite`
- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`

## Required environment variables (Pages UI → Settings → Environment Variables)

**Production 과 Preview 빌드 모두** 다음이 설정되어야 합니다. 누락 시 `npm run build` 단계에서 `VITE_AWS_API_URL` 검증 때문에 **빌드가 실패** 합니다.

| Variable | Example | Notes |
|----------|---------|--------|
| `VITE_APP_ENV` | `production` | 선택(기본 프로덕션 느낌 명시용). |
| `VITE_API_BASE_URL` | `https://ailab-backend.onrender.com` | Cloud(Render) APS Backend HTTPS 오리진(끝 슬래시 없음). |
| `VITE_AWS_API_URL` | `https://your-aws-deployed-backend.example.com` | **필수.** AWS에 올린 동일 레포 APS Backend 의 공개 HTTPS URL. 사용자 입력 아님. |

`frontend/.env.production` 에 같은 키가 있으면 **Pages 대시보드 값이 우선** 하는 경우가 있어, 오래된 변수가 남아 있으면 한쪽을 정리해야 합니다.

Do not put secrets in `VITE_*` variables.
