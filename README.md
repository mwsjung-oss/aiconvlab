# AILab Platform

AI 실험 플랫폼 저장소입니다.  
프론트엔드와 백엔드를 분리 운영하며, runtime/provider 추상화 기반으로 local/lab/cloud 확장을 준비합니다.

## 기술 스택

| 영역 | 구성 |
|---|---|
| Frontend | React + Vite |
| Backend | FastAPI |
| Runtime | local / lab / cloud (lab/cloud는 현재 placeholder) |
| Provider | OpenAI / Gemini / AWS + Mock (기본 비활성) |

## 빠른 시작 (로컬)

### 1) 백엔드

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

PostgreSQL 사용 시 `.env`에 `DATABASE_URL`을 설정하세요.

```env
DATABASE_URL=postgresql+psycopg://user:password@host:5432/ailab
```

기존 SQLite(`data/app.db`)를 PostgreSQL로 완전 이관:

```powershell
cd backend
python migrate_sqlite_to_postgres.py --pg-url "postgresql+psycopg://user:password@host:5432/ailab" --truncate-target
```

Windows 원클릭 자동화(설치+기동+이관+컷오버):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\migrate_postgres_and_cutover.ps1
```

로그인 시 PostgreSQL 자동 기동 등록:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install_postgres_autostart.ps1
```

### 2) 프론트엔드

```powershell
cd frontend
npm install
npm run dev
```

기본 주소: `http://localhost:5174`  
헬스체크: `http://127.0.0.1:8000/api/health`

## 배포/운영 문서

- 아키텍처 개요: `docs/architecture/overview.md`
- Phase 1 리팩터: `docs/architecture/refactor-phase1.md`
- Phase 2 runtime/provider: `docs/architecture/runtime-provider-phase2.md`
- Cloudflare Pages 배포: `docs/deployment/cloudflare-pages.md`
- 백엔드 배포: `docs/deployment/backend-deploy.md`
- 런타임 운영: `docs/operations/runtime-selection.md`
- 프로바이더 활성화 체크리스트: `docs/operations/provider-activation-checklist.md`

## 인프라 템플릿

- `backend/Dockerfile`
- `infra/cloudflare/`
- `infra/render/render.yaml`
- `infra/aws/ecs-taskdef.template.json`

> 템플릿은 준비용이며 자동 배포/프로비저닝은 수행하지 않습니다.

## GitHub CI

- Frontend build check: `.github/workflows/frontend-build-check.yml`
- Backend check: `.github/workflows/backend-check.yml`

## 환경변수 원칙

- 프론트 `VITE_*`: 공개값만 허용
- 백엔드 `.env`: 비밀키/토글 관리
- provider 기본값: `OPENAI_ENABLED=false`, `GEMINI_ENABLED=false`, `AWS_ENABLED=false`

## 라이선스

교육/연구 목적 사용을 기본으로 합니다.
