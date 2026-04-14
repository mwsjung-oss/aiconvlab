# Deployment Sequence

## 1) 코드 준비

- GitHub PR 생성
- CI 통과
  - frontend build check
  - backend check

## 2) 백엔드 배포

1. `backend/Dockerfile` 기준 이미지 빌드
2. 대상 플랫폼(Render/AWS 등)에 배포
3. 환경변수 설정 (`backend/.env.example` 참고)
4. 헬스체크 확인 (`/api/health`, `/api/config`)

## 3) 프론트 배포 (Cloudflare Pages)

1. Pages 환경변수 설정 (`VITE_API_BASE_URL`)
2. `frontend` 빌드/배포
3. 브라우저에서 API 통신 및 로그인 흐름 확인

## 4) 운영 점검

- `/api/runtimes`
- `/api/providers/status`
- System 페이지 배지 상태 확인
- provider는 승인 전 `disabled` 유지

