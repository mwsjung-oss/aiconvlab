# APS — AWS Secrets / 환경변수

운영에서는 **AWS Secrets Manager** 또는 **Systems Manager Parameter Store** 를 우선하고, 로컬 개발만 `.env` 폴백을 사용합니다. 비밀값은 **절대 Git에 커밋하지 않습니다.**

## 필수 키(이름 정합)

| 이름 | 용도 | 비고 |
|------|------|------|
| `APS_DATABASE_URL` | RDS PostgreSQL | `postgresql+psycopg2://...` 형태 권장 |
| `OPENAI_API_KEY` | OpenAI API | LLM 게이트웨이 |
| `GEMINI_API_KEY` | Google Gemini | LLM 게이트웨이 |
| `BEDROCK_REGION` | Amazon Bedrock 리전 | 예: `ap-northeast-2` |
| `S3_BUCKET_DATASETS` | 데이터셋 버킷 | |
| `S3_BUCKET_ARTIFACTS` | 산출물/리포트/모델 | 경로 규칙은 아키텍처 문서 참고 |
| `SQS_AWS_JOBS_URL` | EB 측 AWS 작업 큐 | |
| `SQS_LAB_GPU_JOBS_URL` | 연구실 GPU Worker 전용 큐 | `lab_gpu` 라우팅 시에만 발행 |
| `JWT_SECRET_KEY` | 사용자 JWT | 충분한 엔트로피 |
| `AWS_REGION` | boto3 클라이언트 기본 | |
| `CORS_ORIGINS` | 허용 오리진(쉼표) | Amplify·커스텀 도메인·로컬 |
| `ENVIRONMENT` | `production` \| `development` 등 | |
| `LAB_WORKER_SHARED_SECRET` | Worker → Backend heartbeat 검증 | 내부 전용 |

## AWS 콘솔 등록 위치

- **Secrets Manager**: 시크릿 이름 예 `aps/production/api` 에 JSON 또는 개별 키.
- **Parameter Store**: 경로 예 `/aps/prod/` 하위 문자열 파라미터.

애플리케이션은 부팅 시 위 값을 로드하고, 누락 시 **시작 로그에 명확히** 표시해야 합니다(구현: `backend/config/`, `backend/main.py`).

## 레이어별 매핑 요약

| 대상 | 어디에 두는가 | 예시 |
|------|----------------|------|
| Elastic Beanstalk (API) | Secrets Manager `aps/prod/backend` 또는 EB 환경 속성 | DB URL, JWT, SQS 두 URL, S3 버킷명, `LAB_WORKER_SHARED_SECRET`, LLM 키 |
| Lab GPU Worker | 서버 OS 환경변수 또는 Parameter Store → 배포 스크립트 주입 | `APS_BACKEND_URL`, 같은 `LAB_WORKER_SHARED_SECRET`, `SQS_LAB_GPU_JOBS_URL`, AWS 자격 증명(역할 권장) |
| Amplify Hosting | 앱 빌드 환경변수 (비밀 아님) | `VITE_API_BASE_URL`, `VITE_AWS_API_URL`, `VITE_DEFAULT_EXECUTION_TARGET`, feature flags (`docs/aws-cutover-runbook.md`) |
| GitHub Actions | 퍼블릭 CI 전용, 시크릿 최소 | 검증 워크플로만; 실제 AWS 키는 OIDC·수동 배포 권장 |

## GitHub Actions

- 레포 Secrets에 **빌드용 비밀금지**: CI는 검증만 (`aws-validation.yml`). 실 배포 자격증명은 사람이 또는 별도 OIDC 설정 시에만 저장.

## 로컬 개발 `.env`

- `backend/.env.example`, `frontend/.env.example` 참고.
- 로컬에서만 `APS_SQLITE_FALLBACK_DEV=1` 등 허용.
