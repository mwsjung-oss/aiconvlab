# Cloudflare Pages (ROLLBACK / legacy Frontend only)

**Primary 운영 프론트는 AWS Amplify Hosting**입니다. 자세한 절차는 `docs/aws-cutover-runbook.md` 를 따릅니다.

이 디렉터리 자료와 `.github/workflows/deploy-cloudflare-pages.yml` 은 **DNS·긴급 롤백 시** Cloudflare SPA 를 다시 빌드·배포할 때 참고합니다.

## Build settings

- Framework preset: `Vite`
- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`

## Environment variables (롤백 빌드 시)

롤백 대상인 **실제 레거시 백엔드 HTTPS URL** 을 콘솔에 넣습니다(레포에는 비밀·URL 문자열 커밋 금지).

| Variable | 예시 역할 |
|----------|------------|
| `VITE_APP_ENV` | `production` |
| `VITE_API_BASE_URL` | 롤백 시 사용 중인 Backend HTTPS 오리진 |
| `VITE_AWS_API_URL` | 정책상 필수 — 단일 호스트 롤백 시 **보통 동일 값** |
| 기능 플래그 | 필요 시 Amplify 설정과 동일 키 |

`frontend/.env.production` 과 Pages 대시보드 값 우선 순위 충돌이 나지 않도록, 롤백 브랜치에서 명시적으로 정리하세요.

`VITE_*` 에 시크릿을 넣지 마세요.
