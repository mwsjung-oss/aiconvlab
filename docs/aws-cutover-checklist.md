# AWS 컷오버 체크리스트

DNS를 Amplify·EB로 전환하기 **전에** 확인합니다.

## 기능

- [ ] `GET /api/health`, `/api/health/db`, `/api/health/storage`, `/api/health/queue`, `/api/health/llm`, `/api/health/lab-worker-status` 정상.
- [ ] `python backend/scripts/check_aws_config.py`(배포 서버 env 로드 후) 통과 — `--dry-run` 은 CI용 느슨 검사.
- [ ] `GET /api/jobs/{id}` 사용자 소유 검증, Worker 전용 `POST /api/jobs/{id}/status`(공유 비밀) 동작.
- [ ] 로그인, 데이터 업로드, 학습(기본 AWS 경로), 예측, 리포트 흐름 수동 테스트.
- [ ] 연구실 GPU 서버가 **오프라인** 이어도 위 항목이 모두 가능(lab 선택 시 정책 메시지만 표시 또는 AWS 폴백).

## 설정

- [ ] Amplify 환경변수: `VITE_API_BASE_URL` = 실제 EB HTTPS URL(사용자 입력 UI 없음).
- [ ] EB 환경: RDS·SQS·S3·Secrets 연결 문자열 검증 완료.
- [ ] CORS: 프런트 프로덕션 도메인만 허용.

## 롤백 기준

- 헬스 다수 실패, 로그인 실패율 초과, 데이터 손상 징후 시 **DNS를 이전 값으로 되돌리고** Incident 기록.

## 삭제 금지(자동화)

- Cloudflare·Render 리소스 **자동 삭제 워크플로 없음**. 수동으로 충분히 검증한 뒤 단계 종료 (`docs/cloudflare-render-retirement.md`).
