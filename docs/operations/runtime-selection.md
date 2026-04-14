# Runtime Selection Operations

## 런타임 종류

- `local`: 기본 실행 경로 (현재 실동작)
- `lab`: 안전 Placeholder 응답
- `cloud`: 안전 Placeholder 응답

## 선택 규칙

1. API 요청 본문의 `runtime`
2. 없으면 `AILAB_DEFAULT_RUNTIME`
3. 허용 목록(`AILAB_ALLOWED_RUNTIMES`)으로 필터링
4. 미허용 시 default로 fallback

## 운영 설정

- `AILAB_DEFAULT_RUNTIME=local`
- `AILAB_ALLOWED_RUNTIMES=local,lab,cloud`

## 모니터링

- `GET /api/runtimes`: 런타임 가용성 확인
- `POST /api/jobs/dispatch`: 런타임 디스패치 확인
- `GET /api/jobs/{job_id}/status`: 상태 추적

## 프론트 동작

- System 탭에서 Local/Lab/Cloud 선택
- 선택값은 localStorage에 저장
- 백엔드 미가용 시 경고 배너 표시, UI는 유지

