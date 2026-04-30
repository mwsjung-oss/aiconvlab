# 클라우드 APS 표준 배포 구조

## 개요

APS 운영 표준은 아래 한 줄로 고정합니다:

**Cloudflare Pages(Frontend) → Render(FastAPI Backend) → 원격 PostgreSQL → Cloudflare R2 또는 S3 호환 객체 저장소**

- 웹에서는 **항상 Cloud Frontend HTTPS URL**(및 해당 번들의 `VITE_API_BASE_URL`로 지정된 공개 API) 만 사용합니다. 노트북·학교 PC·iPad 에서 같은 URL 로 접근합니다.

## Render Web Service(FastAPI)

- **헬스**: `GET https://<백엔드>/api/health`, `GET https://<백엔드>/api/health/db`(원격 Postgres `SELECT 1`).
- **Docker 시작 명령**(저장소 `backend/Dockerfile` 기준, Render 에서 `PORT` 주입됨):

  ```bash
  python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
  ```

  앱 진입점은 루트 `backend/main.py` 의 FastAPI 인스턴스입니다(`main:app`).

## 필수 환경 변수(예시 이름)

값은 각 서비스의 대시보드에서 비밀로 설정합니다.

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL External URL(Render DB 등). 로컬 루프백 불가(unless dev + `ALLOW_LOCAL_DATABASE`). |
| `AILAB_ENV` | 운영: `production` |
| `CORS_ORIGINS` | 실제 SPA 오리진(스킴만 허용, 콤마 구분). **비워 두면 기동 불가**( 운영). |
| `JWT_SECRET` | 충분한 길이 무작위 문자열 |
| `MASTER_EMAIL` / `MASTER_PASSWORD` | 최초 시드(사용 후 교체 검토) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` 등 | 기능 켠 경우에만 |
| `OPENAI_ENABLED` `GEMINI_ENABLED` `AWS_ENABLED` | `true/false` |
| **스토리지** | `STORAGE_BACKEND`(운영: `s3` 또는 `r2`), `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_REGION`, **`STORAGE_ENDPOINT_URL`** — R2 또는 S3 호환 API의 **엔드포인트 URL은 운영 필수**. |

### 스토리지(표준 구성 — Render 운영)

- **`STORAGE_BACKEND=r2`(또는 `s3` 라벨)** + 버킷 + 액세스 키 + **R2는 `STORAGE_ENDPOINT_URL` 필수**, AWS 순정 S3 는 엔드포인트 없이 리전 설정으로도 가능.
- 앱 업로드·모델·리포트·작업 레지스트리는 버킷 키에 동기화됩니다(Render 컨테이너 디스크에만 두지 않음).
- `STORAGE_ALLOW_EPHEMERAL_DISK` 같은 전환 타협 변수는 더 이상 권장하지 않으며, 운영 배포에서는 **설정 자체가 실패**(백엔드 기동 차단 조건 참고).

## Frontend(Cloudflare Pages 등)

- 빌드 시 **`VITE_API_BASE_URL`** 에 Render Backend 의 **공개 HTTPS** 원본만 넣습니다(운영 SPA는 비어 두면 시작 시 오류 패널).
- 개발 서버에서는 상대경로 또는 `http://127.0.0.1:8000`(Vite 프록시 등) 허용.

## 배포 후 스모크

```bash
APS_API_ORIGIN=https://your-backend.onrender.com python scripts/smoke_deploy_check.py
```

## 관련 내용

- 로컬 PC 자동 기동 해제: [remove-local-autostart.md](./remove-local-autostart.md)
- 로컬만의 개발 명령: [development-modes.md](./development-modes.md)
