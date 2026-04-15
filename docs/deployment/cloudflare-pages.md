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
   - `VITE_LAB_API_URL=https://aiconvlab.com/api` (연구실 모드 기본 API; localStorage override가 없을 때 사용)
4. SPA fallback
   - `frontend/public/_redirects` 포함 (`/* /index.html 200`)

## 주의사항

- `VITE_*`는 브라우저 번들에 포함됩니다. 비밀키 절대 금지.
- 백엔드 미가용 시 프론트는 배너로 상태를 표시하며 자동 재시도합니다.
- 런타임/프로바이더 활성화는 백엔드 환경변수로만 제어합니다.

## GitHub Actions로 자동 배포 (선택)

저장소에 워크플로 `.github/workflows/deploy-cloudflare-pages.yml` 가 포함되어 있습니다. `main` 에 `frontend/**` 변경이 푸시되면 빌드 후 Cloudflare Pages 프로덕션에 업로드합니다.

**필수 GitHub Secrets** (Settings → Secrets and variables → Actions):

| 이름 | 설명 |
|------|------|
| `CLOUDFLARE_API_TOKEN` | Account → API Tokens — **Cloudflare Pages:Edit** 권한 포함 |
| `CLOUDFLARE_ACCOUNT_ID` | 대시보드 오른쪽 사이드바 또는 계정 개요 |
| `CLOUDFLARE_PAGES_PROJECT_NAME` | Pages 프로젝트 이름(문자열) |
| `VITE_API_BASE_URL` | 공개 백엔드 오리진, 예: `https://your-api.onrender.com` (끝 슬래시 없음) |

Secrets 가 하나라도 비어 있으면 해당 워크플로는 **배포를 건너뛰고** 성공으로 종료합니다(기존 Cloudflare Git 연동만 쓰는 경우와 공존 가능).

Cloudflare에서 **이미 GitHub 저장소를 Pages에 직접 연결**해 두었다면, 동일 브랜치에 대해 빌드가 이중으로 돌 수 있으니 Actions 워크플로는 비활성화하거나 Secrets 를 비워 두세요.

## 배포 확인

- `GET <frontend-domain>/` 응답 확인
- 브라우저 개발자 도구에서 `/api/*` 호출이 `VITE_API_BASE_URL`로 향하는지 확인
- 로그인/대시보드/System 페이지 진입 확인

## Cloudflare Pages 메모

- Cloudflare Pages → Settings → Environment Variables 에 `VITE_LAB_API_URL` 을 설정하세요.
- 값 변경 후 반드시 Re-deploy 하세요.

