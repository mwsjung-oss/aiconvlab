# Architecture Overview

## 운영 모델

- Frontend: Cloudflare Pages (정적)
- Backend: 별도 퍼블릭 서비스(FastAPI)
- Runtime: local / lab / cloud 선택형
- Provider: OpenAI / Gemini / AWS 준비, 기본 비활성
- GitHub: 소스/CI 단일 진실원

## 계층

### Frontend

- `src/services/config`: 공개 환경변수 접근
- `src/services/runtime`: 런타임/백엔드 모드 상태
- `src/services/api`: API 클라이언트
- `System` 페이지: health/runtime/provider 상태 시각화

### Backend

- `src/core`: 공통 설정/CORS
- `src/runtimes`: 실행 런타임 추상화
- `src/providers`: 외부 프로바이더 추상화
- `src/api/v1/platform.py`: 플랫폼 운영 API
- 기존 레거시 라우터와 병행 운영

## 요청 흐름

1. 브라우저가 백엔드 API 호출
2. 백엔드에서 런타임 선택 및 잡 디스패치
3. 프로바이더 상태/가용성 확인
4. 결과를 구조화 응답으로 반환

## 배포 시퀀스

1. GitHub PR -> Actions 통과
2. 백엔드 배포 및 헬스 확인
3. 프론트 Pages 배포 (`VITE_API_BASE_URL` 설정)
4. 운영 점검 (`/api/health`, `/api/config`, `/api/providers/status`)

