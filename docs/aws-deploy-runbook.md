# APS — AWS 배포 런북 (운영 기준)

이 문서는 APS가 **AWS(Elastic Beanstalk + RDS + S3 + SQS + Amplify + Worker)** 위에서 처음부터 올릴 때의 **권장 순서**를 정리합니다. 비밀값은 Git에 넣지 말고 **Secrets Manager / EB 환경 속성**에만 둡니다.

---

## 1. S3 버킷 생성

1. **리전**을 API·EB와 동일하게 맞춥니다(예: `ap-northeast-2`).
2. 버킷 두 개를 만듭니다.
   - **데이터셋 버킷** — 사용자·학습 입력 CSV 등 (읽기/쓰기).
   - **아티팩트 버킷** — 모델·리포트·실행 산출물.
3. EB 애플리케이션이 사용하는 **IAM 역할**에 최소 권한을 붙입니다.
   - `s3:ListBucket`, `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`(헬스 프로브가 `_health/` 경로에 임시 객체를 씁니다.)
4. 배포 후 환경 변수에 이름을 등록합니다(아래 Secrets 절 참고).
   - `S3_BUCKET_DATASETS`
   - `S3_BUCKET_ARTIFACTS`

**헬스:** `GET /api/health/storage` — 버킷이 없거나 이름이 틀리면 `503`과 `message_ko`로 원인 요약을 반환합니다.

---

## 2. SQS 큐 생성

1. 같은 리전에서 **표준 또는 FIFO 큐**를 둘 만듭니다.
   - AWS EB 워커가 소비할 **작업 큐** → `SQS_AWS_JOBS_URL`
   - 연구실 GPU 장비가 소비할 **Lab GPU 큐** → `SQS_LAB_GPU_JOBS_URL`
2. 각 큐의 **전체 HTTPS Queue URL**(콘솔에서 복사)을 저장합니다.
3. EB 인스턴스 역할에 `sqs:GetQueueAttributes`, `sqs:SendMessage`, `sqs:ReceiveMessage`, `sqs:DeleteMessage` 등이 필요하면 정책에 추가합니다.

**헬스:** `GET /api/health/queue` — URL이 비었거나 IAM 오류 시 프로덕션에서는 `503` 및 `message_ko`를 확인합니다.

---

## 3. RDS 생성

1. **PostgreSQL** 엔드포인트를 만듭니다(멀티 AZ·백업 정책은 운영 정책에 맞게).
2. 보안 그룹에서 **EB 보안 그룹 → RDS 5432** 인바운드를 허용합니다(또는 프라이빗 서브넷/VPC 엔드포인트 구성).
3. 연결 문자열은 앱에서 다음 형태를 사용합니다(실제 패키지는 `requirements.txt` 기준).

   `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`

4. 변수 이름: **`APS_DATABASE_URL`**(또는 `DATABASE_URL`).

RDS 연결 실패 시 앱 시작 로그와 `GET /api/health/db` 응답에서 **OperationalError/pgcode** 힌트를 확인합니다.

---

## 4. 스키마 적용

1. 운영 DB에 **직접 DDL 적용 전 백업**을 수행합니다.
2. `backend/db/schema.sql` 및 `docs/db-migration.md` 순서를 참고해 **APS Job·이벤트·LLM·Lab heartbeat** 테이블을 반영합니다.
3. 기존 `users` 등이 이미 있다면 APS 전용 블록만 선택 적용합니다.

---

## 5. Secrets / 환경 변수 등록

필수 목록은 `docs/aws-secrets.md`와 동일합니다. 최소한 다음을 **EB 환경** 또는 **Secrets Manager**에 넣습니다.

| 변수 | 설명 |
|------|------|
| `APS_DATABASE_URL` | RDS URL |
| `JWT_SECRET_KEY` | 사용자 JWT |
| `AWS_REGION` | 리전 |
| `S3_BUCKET_DATASETS` / `S3_BUCKET_ARTIFACTS` | 위에서 만든 버킷 |
| `SQS_AWS_JOBS_URL` / `SQS_LAB_GPU_JOBS_URL` | 전체 Queue URL |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | Amplify·프론트 도메인(쉼표) |
| `LAB_WORKER_SHARED_SECRET` | Worker→API 공유 비밀(없으면 Worker API는 **403**) |

LLM 키(`OPENAI_API_KEY` 등)는 선택이며, 없으면 LLM 기능만 제한됩니다.

배포 전 로컬/CI에서 `python backend/scripts/check_aws_config.py`로 누락을 확인합니다(`--dry-run`은 경고만).

---

## 6. Elastic Beanstalk 배포

1. 백엔드 애플리케이션·환경을 생성하고, 위 환경 변수를 주입합니다.
2. **프로덕션**에서는 `APS_SQLITE_FALLBACK_DEV`를 켜지 않습니다.
3. 헬스 체크 URL은 일반적으로 `GET /api/health`(또는 `/health`)를 사용합니다.
4. 인스턴스 프로파일에 S3·SQS·(필요 시 Bedrock 등) 권한이 붙어 있는지 확인합니다.

---

## 7. Amplify 연결

1. Amplify 앱에서 **빌드 환경 변수**로 API 베이스 URL을 넣습니다(예: `VITE_API_BASE_URL`).
2. `CORS_ORIGINS`에 Amplify 도메인이 포함되는지 EB 쪽과 맞춥니다.
3. 프로덕션 빌드는 `frontend`에서 `npm run build`로 검증합니다.

---

## 8. Worker 실행

1. 연구실 GPU 서버(또는 전용 호스트)에 `lab-worker` 디렉터리 절차(`docs/lab-gpu-worker-setup.md`)대로 에이전트를 설치합니다.
2. 환경 변수에 최소 포함:
   - `APS_BACKEND_URL` — EB API HTTPS URL
   - `LAB_WORKER_SHARED_SECRET` — API와 **동일 문자열**
   - `SQS_LAB_GPU_JOBS_URL` — Lab GPU 큐 URL
   - AWS 자격 증명(역할 또는 키) — 큐 폴링·S3 접근용

`LAB_WORKER_SHARED_SECRET`이 비어 있으면 API에서 `/api/lab-workers/*`, Worker용 `POST /api/jobs/{id}/status` 등이 **403**으로 차단됩니다.

---

## 9. 테스트 시나리오

1. **`GET /api/health`** — `200`, `{"status":"ok"}`.
2. **`GET /api/health/db`** — RDS 정상 시 `postgresql` 표시.
3. **`GET /api/health/storage`** — APS 모드에서는 두 버킷 head + datasets 버킷 쓰기/삭제 성공.
4. **`GET /api/health/queue`** — 프로덕션에서 두 SQS URL이 모두 설정되고 `ok: true`.
5. **`GET /api/health/llm`** — 키가 없어도 엔드포인트는 응답하되 구성 상태는 본문에 표시(LLM 라우터 가동 여부는 별도).
6. **`GET /api/health/lab-worker-status`** — Worker가 heartbeat 보낸 뒤 `availability` 확인.
7. **인증 사용자로** 학습 트레이거 후 SQS·실행 로그·S3 객체 생성 여부를 콘솔에서 교차 검증합니다.

백엔드: `pytest` / 프론트: `npm run build` / 설정: `python backend/scripts/check_aws_config.py` 가 CI 기준으로 통과하는지 확인합니다.
