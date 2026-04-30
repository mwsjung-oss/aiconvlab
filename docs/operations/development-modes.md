# Development Modes · 로컬은 개발/디버깅 전용

**운영 접속**(학생용, iPad, 외부 PC) 경로와 혼동되지 않도록 이 문서는 **개발자의 로컬 환경**만 다룹니다.

## APS 표준(운영)

- Cloud Frontend(Pages 등) HTTPS URL 하나.
- Cloud Backend(Render 등) HTTPS API URL 하나.
- PostgreSQL 호스트 이름은 원격 제공자(예: Render DB External URL).
- **노트북 부팅, Windows CMD, WSL 에서 수동 `uvicorn` 을 학생 과제의 전제 조건으로 두지 않습니다.**

## 로컬 개발 명령(개발자 PC)

### Backend(선택적 — API 코드 디버깅)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
# backend/.env 에 DATABASE_URL(원격) 필수 … 로컬 DB가 필요하면 개발 편에서만 ALLOW_LOCAL_DATABASE
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

- 브라우저는 통상 `http://localhost:5174`(또는 `VITE_DEV_PORT`).
- **`VITE_API_BASE_URL`** 을 비우면 같은 오리진의 `/api` 를 Vite 가 로컬 백엔드로 프록시합니다(표준 디버깅).

### 두 개를 동시에(개발 편의)

```powershell
cd frontend
npm run dev:stack
```

`(wait-on 후 Vite + backend uvicorn — npm script 참조)`

### 운영과 혼동하지 말 것

- `npm run dev` / `dev:stack` 결과는 로컬 URL 이며, **품질 보증·시연에는 Cloud Frontend + Cloud Backend** 를 사용합니다.
- `import.meta.env.PROD`(정적 SPA 배포 빌드)에서는 **반드시** `VITE_API_BASE_URL` 이 공개 Backend 를 가리켜야 합니다(`apiBaseValidation`).

## 과거 문서 레거시

예전 “Lab 전용 빌드/런타임 이름” 들은 이름만 남아 있거나 placeholder 일 수 있습니다. 표준 이름은 여기 적힌 Cloud 경로입니다.
