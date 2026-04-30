# Cloudflare / Render 운영 종료 참고

APS의 **단일 운영 목표 환경은 AWS**(Amplify + Elastic Beanstalk)입니다. Cloudflare Pages와 Render는 최종 레이아웃에서 제거합니다. 코드에서는 레거시 주석·문서 참조만 남깁니다.

## 코드베이스에서의 과거 위치

- **`infra/cloudflare/`**: Pages 빌드·환경변수 예시 README.
- **`docs/deployment/cloudflare-pages.md`**: 과거 Pages 배포 절차.
- 과거 변수명 `VITE_AWS_API_URL` 등은 더 이상 **프로덕션 빌드 필수 키로 사용하지 않습니다.** 단일 백엔드 베이스는 **`VITE_API_BASE_URL`** (EB URL) 입니다.

## 인프라에서의 이전 레퍼런스 (요약)

| 구분 | 과거 |
|------|------|
| Frontend 호스팅 | Cloudflare Pages |
| Backend 호스팅 | Render 자동 빌드 |
| 사용자 백엔드 URL 입력 | 금지(현재도 동일) — 빌드/호스트 환경변수만 |

## 종료 순서 제안

1. AWS 측에서 트래픽·헬스·로그 확인.
2. DNS TTL 축소 후 Amplify 도메인으로 전환 (`docs/aws-cutover-checklist.md`).
3. Cloudflare Pages·Render 서비스 **수동 중지**(자동 삭제 스크립트 없음).

## 롤백 보존

변경 후 **최소 2~4주** 기존 URL/설정 로그 보관 권장(롤백·감사).
