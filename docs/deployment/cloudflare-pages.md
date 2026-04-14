# Cloudflare Pages Deployment Guide

## 목적

프론트엔드를 Cloudflare Pages 정적 호스팅으로 배포하고, 백엔드는 별도 퍼블릭 서비스로 운영합니다.

## 전제

- 프론트: `frontend/` (Vite static build)
- 백엔드: 별도 도메인/URL 제공 (`https://api.example.com` 형태)

## Pages 설정

1. GitHub 저장소 연결
2. Build configuration
   - Framework preset: `Vite`
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
3. Environment variables (Pages UI)
   - `VITE_APP_ENV=production`
   - `VITE_API_BASE_URL=https://<public-backend-domain>`
4. SPA fallback
   - `frontend/public/_redirects` 포함 (`/* /index.html 200`)

## 주의사항

- `VITE_*`는 브라우저 번들에 포함됩니다. 비밀키 절대 금지.
- 백엔드 미가용 시 프론트는 배너로 상태를 표시하며 자동 재시도합니다.
- 런타임/프로바이더 활성화는 백엔드 환경변수로만 제어합니다.

## 배포 확인

- `GET <frontend-domain>/` 응답 확인
- 브라우저 개발자 도구에서 `/api/*` 호출이 `VITE_API_BASE_URL`로 향하는지 확인
- 로그인/대시보드/System 페이지 진입 확인

