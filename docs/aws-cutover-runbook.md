# APS AWS 운영 전환 런북 (Primary: Amplify + EB)

Primary production target: **AWS Amplify Hosting (Frontend)** + **AWS Elastic Beanstalk (Backend)** + **RDS / S3 / SQS**.  
레거시 스택(**Cloudflare Pages + Render**)은 **DNS 전환 및 운영 검증이 끝날 때까지 롤백용으로 유지**합니다. 이 문서는 비밀값을 기록하지 않습니다.

## 1. 현재 구조와 목표 구조

| 레이어 | 현재(레거시·롤백) | 목표(Primary) |
|--------|-------------------|----------------|
| Frontend SPA | Cloudflare Pages (`.github/workflows/deploy-cloudflare-pages.yml` 등) | **AWS Amplify Hosting** (`amplify.yml`) |
| Backend API | Render (`render.yaml`, 선택적 Deploy Hook) | **Elastic Beanstalk** + Docker (`backend/Dockerfile`, `backend/Procfile`) |
| DB / 스토리지 / 큐 | Render·환경에 따라 혼재 | **RDS PostgreSQL**, **S3**, **SQS** (상세: `docs/aws-migration.md`) |

## 1.1 `frontend/.env.production` 과 Git

- `frontend/.env.production` 은 **커밋하지 않습니다**(`.gitignore`).
- 로컬 개발·검증 빌드 시 `frontend/.env.production.example` 을 복사한 뒤 **비밀값 없이** 플레이스홀더 호스트명을 실제 EB URL 로 바꿉니다.
- **Primary**(Amplify): 콘솔 환경 변수로 동일 키를 주입합니다.
- **Cloudflare 롤백** GitHub Actions 는 필요 시 example 을 복사한 뒤, **롤백 대상 백엔드 HTTPS** 로 반드시 수정합니다.

## 2. 정교수님이 직접 입력해야 하는 값 (요약 체크리스트)

실제 문자열(URL·키·ARN)은 **코드 레포와 주석에 넣지 말고** 아래 위치만 사용합니다.

### 2.1 AWS Amplify 콘솔 (Frontend 빌드)

앱 연결 브랜치에서 **Hosting → Environment variables** (또는 빌드 환경 변수)에 다음 키를 설정합니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `VITE_API_BASE_URL` | ✅ | EB 환경에 노출되는 **HTTPS API 오리진** (끝 슬래시 없음). |
| `VITE_AWS_API_URL` | ✅ | 단일 EB 시 보통 **`VITE_API_BASE_URL`과 동일 값**. 향후 엔드포인트 분리 시에만 달라질 수 있음. |
| `VITE_DEFAULT_EXECUTION_TARGET` | 권장 | `aws` (기본 APS 실행 타깃). |
| `VITE_APP_ENV` | 권장 | `production` |
| `VITE_ENABLE_LAB_GPU` | 선택 | 기능 플래그 (예: `true`). |
| `VITE_ENABLE_LLM_PROVIDER_SELECT` | 선택 | 기능 플래그. |
| `VITE_API_TIMEOUT_MS` | 선택 | 예: `20000`. |

Amplify 빌드는 저장소의 `amplify.yml`을 따르며, 빌드 전에 위 변수가 `export`되어 `vite build` 및 `frontend/scripts/assert-vite-env.mjs` 검증을 통과해야 합니다.

### 2.2 AWS Elastic Beanstalk (Backend 환경)

환경 속성(또는 Secrets Manager 후 주입)에 다음을 설정합니다.

**필수(요청 명세 + 앱 검증)**

| 변수 | 필수 | 설명 |
|------|------|------|
| `AILAB_ENV` | ✅ | `production` |
| `DATABASE_URL` | ✅\* | RDS 연결 문자열. (`APS_DATABASE_URL` 동시 설정 시 해당 키가 우선되는 코드 경로가 있음 — 둘 중 하나는 반드시.) |
| `APS_DATABASE_URL` | ✅\* | 위와 동일 목적 시 권장(문서 정합 · `backend/config/aps_settings.py`). |
| `JWT_SECRET_KEY` | ✅ | AWS 배포 검증 스크립트 및 운영 정책용(`backend/scripts/check_aws_config.py`). |
| `JWT_SECRET` | ✅ | 실제 로그인 토큰 서명(`backend/auth_utils.py`). **`JWT_SECRET_KEY`와 같은 값으로 맞추는 것을 권장**(현재 코드는 서로 다른 키 이름을 참조함). |
| `AWS_REGION` | ✅ | 리전 예: `ap-northeast-2` |
| `AWS_DEFAULT_REGION` | 권장 | boto3/SDK 기본값과 일치시키기 위해 **`AWS_REGION`과 동일** 권장. |
| `S3_BUCKET_DATASETS` | ✅ | 데이터셋 버킷 이름. |
| `S3_BUCKET_ARTIFACTS` | ✅ | 산출물·모델·리포트 버킷. |
| `SQS_AWS_JOBS_URL` | ✅ | AWS 작업 큐 URL. |
| `SQS_LAB_GPU_JOBS_URL` | ✅ | 연구실 GPU Worker 큐 URL. |
| `CORS_ORIGINS` | ✅ | **프로덕션 SPA 오리진** 쉼표 목록 (`https://` 포함). Amplify 기본 도메인(`*.amplifyapp.com`)과 커스텀 도메인을 모두 포함. |

그 외 OpenAI/Gemini/Bedrock, Worker 공유 비밀 등은 `docs/aws-secrets.md` 및 `backend/scripts/check_aws_config.py`를 따릅니다.

### 2.3 GitHub (저장소)

| 위치 | 키 | 용도 |
|------|-----|------|
| Actions **Variables** | `AWS_EB_PUBLIC_API_URL` | (선택) CI Frontend 빌드 시 실 EB URL 치환. 미설정 시 CI는 `.invalid` 플레이스홀더로만 빌드합니다. |
| Actions **Variables** | `SMOKE_BACKEND_URL` | (선택) `backend-check.yml` 배포 스모크 대상 EB HTTPS URL. |
| Actions **Variables** | `SMOKE_DEPLOY_WAIT_SECONDS` | (선택) 배포 후 대기 초. 미설정이면 스킵. |
| Actions **Secrets** | `AILAB_SMOKE_EMAIL`, `AILAB_SMOKE_PASSWORD` | 원격 로그인 스모크 계정 |
| Actions **Secrets** | `RENDER_DEPLOY_HOOK_URL` | 롤백용 Render 배포 후크만 사용 시 |
| Actions **Secrets** | `CLOUDFLARE_*` | 롤백용 Cloudflare Pages 배포만 사용 시 |

## 3. Elastic Beanstalk 배포 준비 점검 요약

- **실행 명령**: `backend/Procfile` → `uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}`  
  Docker 이미지(`backend/Dockerfile`)에서는 `PORT` 및 `--proxy-headers --forwarded-allow-ips`가 LB 환경에 맞도록 설정되어 있습니다. EB ALB 앞에서는 환경에 맞춰 신뢰 프록시 IP를 검토합니다.
- **의존성**: `backend/requirements.txt`
- **Health probe (앱 레벨)**  
  - `GET` 또는 `HEAD` **`/api/health`** → 200 및 `{"status":"ok"}` 형태 바디 (`backend/main.py`)  
  - EB 환경·로드밸런서가 `/health` 또는 `/api/health` 중 무엇을 쓸지 **콘솔 설정과 일치**시키세요. 또한 `render.yaml`에 있던 `healthCheckPath: /api/health`와 동일 경로 사용 가능.

- **데이터베이스 상태**  
  - `GET /api/health/db` — RDS 연결 실패 시 503 및 안내 메시지.

## 4. Amplify Frontend 빌드 절차 (요약)

1. Amplify 에 Git 저장소 브랜치 연결.  
2. 빌드 스펙: 저장소 루트 `amplify.yml` (App root `frontend`).  
3. 콘솔 환경 변수에 §2.1 표의 키 입력.  
4. 최초 배포 후 SPA에서 네트워크 탭으로 API 호출이 **설정한 EB 도메인**으로 향하는지 확인.

## 5. Smoke test

### 원격(API)

저장된 스크립트·테스트：

- **Pytest 원격 마커**: `pytest -m remote_smoke` — `backend/tests/test_deployed_api_smoke.py`  
  - `$env:SMOKE_BACKEND_URL` (PowerShell) / `SMOKE_BACKEND_URL` 에 EB HTTPS 오리진.  
  - `AILAB_SMOKE_EMAIL`, `AILAB_SMOKE_PASSWORD` 설정 시 로그인 스모크까지 수행.

- **CLI**: `backend` 디렉터리에서  
  `python smoke_remote_checks.py https://YOUR-EB-HTTPS-ORIGIN`  
  또는 `SMOKE_BACKEND_URL` 환경 변수.

### 설정 점검 (백엔드 컨테이너 또는 EB SSH)

```text
python backend/scripts/check_aws_config.py [--dry-run]
```

## 6. DNS 전환 전 체크리스트 (실제 전환은 하지 않음)

참고: `docs/aws-cutover-checklist.md` 와 교차 검토.

- Amplify 배포 SPA에서 모든 핵심 사용자 플로우(로그인·업로드·학습·예측) 성공  
- EB `GET /api/health`, `/api/health/db` 정상  
- `CORS_ORIGINS`에 Amplify 호스트 및 최종 사용자용 커스텀 도메인 반영  
- `check_aws_config.py` 및 S3/SQS 스모프 절차 통과 (`docs/aws-deploy-runbook.md`)  
- **DNS TTL·롤백 계획 숙지** 후에만 레코드 수정

## 7. 롤백 절차 (Cloudflare / Render 유지 전제)

1. **DNS 또는 사용자 안내만** 레거시 Cloudflare SPA + Render Backend 를 가리키도록 되돌립니다 (구체 레코드는 인프라 팀 명세 준수).  
2. **프론트**: 필요 시 레거시 호스트용 빌드를 위한 브랜치에서 `frontend/.env.production` 을 과거 호스트(URL)로 교체하거나 Cloudflare/GitHub 롤백 플로를 사용합니다 (`.github/workflows/deploy-cloudflare-pages.yml` 참고 · **Rollback 전용**).  
3. **백엔드**: Render Auto-Deploy 또는 `deploy-render-backend.yml`(Hook) 로 복귀 가능. 이 워크플로는 Primary 가 아님.  
4. 데이터 정합(DB 이중 기록)·세션 무효화 등 운영 이슈는 별도 런북 준수.

## 8. 레거시 유지 기간 및 정리 원칙

- Cloudflare·Render 관련 인프라·워크플로·`render.yaml` 은 **검증이 끝날 때까지 삭제하지 않음**.  
- Primary 운영 경로 설명과 자동화 신규 작성 시 **Amplify + EB를 기본값**으로 문서화.  
- 사람이 채워야 하는 실제 URL/키는 **각 콘솔·Secrets Manager·GitHub Variables**에만 둠.

## 9. 사람이 확인해야 하는 미정 항목

| 항목 | 비고 |
|------|------|
| EB 최종 공개 HTTPS 엔드포인트(ALB/CNAME) | Amplify 및 프론트 `.env` 주입값 |
| RDS 엔드포인트 및 DB URL 형식 (`APS_DATABASE_URL` vs `postgresql+…`) | `backend/database.py` 연결 규격과 맞는지 검증 |
| Amplify 빌드용 커스텀 도메인 vs AWS 기본 `*.amplifyapp.com` | `CORS_ORIGINS` 에 모두 나열해야 함 |
| LLM Provider 키·Worker 공유 시크릿 | `docs/aws-secrets.md` |

---

관련: `docs/aws-migration.md`, `docs/aws-deploy-runbook.md`, `docs/aws-cutover-checklist.md`, `docs/cloudflare-render-retirement.md`.
