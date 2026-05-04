# 클라우드 APS 표준 배포 구조

> **운영 기준(Primary)** 은 **AWS Amplify(Frontend) + Elastic Beanstalk(Backend)** 입니다 (`docs/aws-cutover-runbook.md`).  
> 아래 내용 중 Cloudflare Pages·Render 에 대한 서술은 **레거시·롤백 참고 자료**로 유지합니다.

## 개요 (레거시 패턴 요약)

과거 APS 는 아래 패턴으로 기술되어 있습니다:

**Cloudflare Pages(Frontend) → Render(FastAPI Backend) → 원격 PostgreSQL → Cloudflare R2 또는 S3 호환 객체 저장소**

현재 레포 표준 배포 플로는 AWS 전환을 전제로 하며, DNS 전환 전까지 기존 인프라는 롤백 목적으로 유지합니다.

---

## Render Web Service(FastAPI · 레거시)

- **헬스**: `GET https://<백엔드>/api/health`, `GET https://<백엔드>/api/health/db`(원격 Postgres `SELECT 1`).
- **Docker 시작 명령**(저장소 `backend/Dockerfile` 기준, 호스팅에서 `PORT` 주입됨):

  ```bash
  python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
  ```

  앱 진입점은 루트 `backend/main.py` 의 FastAPI 인스턴스입니다(`main:app`).

## 필수 환경 변수(예시 이름)

값은 각 서비스의 대시보드에서 비밀로 설정합니다.

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열(Render/RDS 등). 로컬 루프백 불가(unless dev + `ALLOW_LOCAL_DATABASE`). |
| `AILAB_ENV` | 운영: `production` |
| `CORS_ORIGINS` | 실제 SPA 오리진(스킴만 허용, 콤마 구분). **비워 두면 기동 불가**( 운영). |
| `JWT_SECRET` | 충분한 길이 무작위 문자열 |
| `MASTER_EMAIL` / `MASTER_PASSWORD` | 최초 시드(사용 후 교체 검토) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` 등 | 기능 켠 경우에만 |
| `OPENAI_ENABLED` `GEMINI_ENABLED` `AWS_ENABLED` | `true/false` |
| **스토리지** | `STORAGE_BACKEND`(운영: `s3` 또는 `r2`), `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION`, **`STORAGE_ENDPOINT_URL`** — R2 또는 S3 호환 API의 **엔드포인트 URL은 운영 필수**. |

### 스토리지(표준 구성)

- **`STORAGE_BACKEND=r2`(또는 `s3` 라벨)** + 버킷 + 액세스 키 + **R2는 `STORAGE_ENDPOINT_URL` 필수**, AWS 순정 S3 는 엔드포인트 없이 리전 설정으로도 가능.
- 앱 업로드·모델·리포트·작업 레지스트리는 버킷 키에 동기화됩니다(컨테이너 디스크에만 두지 않음).
- `STORAGE_ALLOW_EPHEMERAL_DISK` 같은 전환 타협 변수는 더 이상 권장하지 않으며, 운영 배포에서는 **설정 자체가 실패**(백엔드 기동 차단 조건 참고).

## Frontend(Cloudflare Pages 등 · 레거시)

- 빌드 시 **`VITE_API_BASE_URL`**, **`VITE_AWS_API_URL`** 에 해당 시점의 Backend **공개 HTTPS** 원본만 넣습니다(`docs/aws-cutover-runbook.md`).
- 개발 서버에서는 상대경로 또는 `http://127.0.0.1:8000`(Vite 프록시 등) 허용.

## 배포 후 스모크

```bash
APS_API_ORIGIN=https://YOUR-EB-HTTPS-ORIGIN.invalid python scripts/smoke_deploy_check.py
```

## 관련 내용

- AWS 전환 단일 런북: [../aws-cutover-runbook.md](../aws-cutover-runbook.md)
- 로컬 PC 자동 기동 해제: [remove-local-autostart.md](./remove-local-autostart.md)
- 로컬만의 개발 명령: [development-modes.md](./development-modes.md)
