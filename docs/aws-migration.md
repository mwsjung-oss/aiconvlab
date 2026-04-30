# APS AWS 단일 운영 전환 개요

## 목적

APS(AI Practice Studio)를 **Cloudflare Pages + Render** 중심에서 **AWS 단일 운영(Amplify Hosting + Elastic Beanstalk + RDS + S3 + SQS)** 으로 이전하여 운영 단순화와 보안·비밀관리 일원화를 달성합니다.

## 이전 구조(레거시)

- Frontend: Cloudflare Pages
- Backend: Render
- 과거 환경변수·플러그인 레퍼런스: `docs/cloudflare-render-retirement.md`, `infra/cloudflare/README.md`

## 목표 구조

- **Frontend**: AWS Amplify Hosting (`amplify.yml`)
- **Backend**: AWS Elastic Beanstalk + FastAPI (`backend/Procfile`)
- **DB**: Amazon RDS PostgreSQL (`APS_DATABASE_URL`)
- **Storage**: Amazon S3 (`backend/aps_ops/storage/s3_storage.py`)
- **Queue**: Amazon SQS — `SQS_AWS_JOBS_URL`, `SQS_LAB_GPU_JOBS_URL`
- **LLM**: OpenAI · Gemini 유지 + **AWS Bedrock** 통합(LLM 게이트웨이 참고: 코드베이스 `backend/` 내 provider 모듈)
- **연구실 GPU Worker**: Lab 전용 서버가 **SQS(lab_gpu)만 폴링**, 운영 DB/파일 저장소 역할 금지

## 단계별 전환 절차

1. **AWS 계정·IAM 준비** — `docs/aws-iam-setup.md`
2. **Secrets Manager / Parameter Store**에 운영 키·URL 등록 — `docs/aws-secrets.md`
3. **RDS PostgreSQL**, **S3 버킷**(datasets / artifacts 분리)·**SQS**(AWS jobs + Lab GPU)·**VPC/보안그룹** 프로비저닝(콘솔에서 수동, 자동 삭제 스크립트 없음).
4. **Elastic Beanstalk** 에 backend 배포(헬스: `/api/health` 및 세부 헬스 `docs/operations/` 참고).
5. **Amplify** 에 frontend 빌드·연결 환경변수(`VITE_API_BASE_URL` 등).
6. **DNS** 전환 전 체크 — `docs/aws-cutover-checklist.md`
7. **Lab GPU Worker** 설치(선택) — `docs/lab-gpu-worker-setup.md`

## 스키마 / 마이그레이션

- ORM 모델: `backend/models_aps.py` (jobs, job_events, llm_usage_logs, lab_worker_heartbeats)
- Alembic 미사용 시 RDS 초기화는 운영 절차로 `SELECT`/DDL을 수동 적용하거나 추후 Alembic 도입 TODO.

## 검증

- 로컬: `backend` 에서 `pytest`, `frontend` 에서 `npm run build`
- CI: `.github/workflows/aws-validation.yml`

## 1차 vs 2차 구분

**1차(본 저장소 반영):** APS 운영을 위한 S3/SQS/Job/Lab Worker/문서/`check_aws_config`/`db/schema.sql`/프런트 Job 폴링 기반.

**2차(운영·확장):** 비동기 AWS 학습 소비자(EB 또는 Batch), LLM 게이트웨이와 AI 챗 단일 라우팅 완료, 규모 증대 시 idempotency 강화.

## End-to-end 흐름 (요약)

1. 학습 요청 `POST /api/train` 이 `resolved_target == lab_gpu` 이면 CSV를 datasets S3 업로드, artifacts 출력 prefix 설정 후 Lab SQS 에만 적재합니다. AWS 동기 학습 또는 auto 폴백 시에는 큐 미사용 및 EB 에서 학습 실행.
2. `lab-worker/worker.py` 가 Lab 큐를 수신 후 `POST /api/jobs/{id}/status` 로 상태를 갱신하고, 결과 `manifest.json` 을 S3 업로드합니다.
3. 프런트는 큐 등록 시 `job_id`를 받아 `GET /api/jobs/{id}` 를 주기 폴링하고 `services/jobUiPhrases.js` 로 표시 문자열을 구성합니다.

