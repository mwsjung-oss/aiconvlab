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

PostgreSQL 사용 시 `.env`에 `DATABASE_URL`을 설정하세요. Render에서는 대시보드의 **External** Database URL을 그대로 쓰면 됩니다(`postgresql://…`도 자동 정규화).

```env
DATABASE_URL=postgresql://user:password@dpg-xxxxx.region.postgres.render.com:5432/dbname
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

## 경량 LLM Gateway (OpenAI + Gemini 통합)

로컬 AI 실험·프롬프트 스모크 테스트용 경량 FastAPI 서비스입니다. 무거운 ML
의존성을 가진 `backend/main.py`와는 독립적으로 기동되며, 동일 `.venv`를 공유합니다.

### 구성 파일

| 파일 | 역할 |
|---|---|
| `backend/src/main.py` | 경량 FastAPI 앱 (`src.main:app`) |
| `backend/src/api/chat.py` | `/api/chat/health`, `/api/chat/test` 라우터 |
| `backend/src/services/llm_gateway.py` | `ask_openai`, `ask_gemini`, `ask_llm` 통합 인터페이스 + 키 마스킹 |
| `scripts/test_openai.py` / `scripts/test_gemini.py` | Provider 스모크 테스트 |
| `.env.example` | 루트 `.env` 템플릿 (실제 키는 커밋 금지) |

### 최초 설정

```powershell
# 1) 루트 .env 준비 (OPENAI_API_KEY, GEMINI_API_KEY)
Copy-Item .env.example .env
# .env 수정 후 저장

# 2) 가상환경 + 최소 5개 패키지 설치
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
pip install python-dotenv "openai>=1.51,<2" "google-generativeai>=0.8,<0.9" `
            "fastapi>=0.115,<1" "uvicorn[standard]>=0.32,<1"
```

### 실행

```powershell
# Provider 스모크 테스트
python scripts\test_openai.py
python scripts\test_gemini.py

# 서버 실행
python -m uvicorn src.main:app --reload --host 127.0.0.1 --port 8010 --app-dir backend
```

Swagger UI: <http://127.0.0.1:8010/docs>

### 엔드포인트

```http
GET  /api/chat/health
POST /api/chat/test      { "provider": "openai" | "gemini", "message": "..." }
```

`health` 응답 예:

```json
{ "status": "ok", "openai_configured": true, "gemini_configured": true }
```

### 보안

- 키 값은 환경변수(`.env`)로만 주입하며 로그에는 `<configured>` 토큰으로만 표시됩니다.
- 루트 `.env`, `.env.save`, `.env.local`는 `.gitignore`에 포함됩니다.

## AI Agents + RAG 서브시스템

경량 gateway에 **구조화 출력 Agent**와 **Chroma 기반 RAG**가 내장되어 있습니다. Agent는
LLM gateway의 JSON 모드를 사용하며, RAG는 OpenAI `text-embedding-3-small`과
`chromadb` PersistentClient로 `backend/data/vector_db/`에 영속화합니다.

### 구성 파일

| 파일 | 역할 |
|---|---|
| `backend/src/services/rag/embeddings.py` | OpenAI 임베딩(배치) |
| `backend/src/services/rag/vector_store.py` | Chroma PersistentClient 래퍼 |
| `backend/src/services/rag/ingestion.py` | 문단·문장 기준 청크 분할 + upsert |
| `backend/src/services/rag/retriever.py` | `semantic_search`, `rag_answer` |
| `backend/src/services/agents/base.py` | `Agent` 추상 + `AgentResult` Pydantic |
| `backend/src/services/agents/data_agent.py` | `DataAgent` (데이터 계획) |
| `backend/src/services/agents/model_agent.py` | `ModelAgent` (모델·하이퍼파라미터) |
| `backend/src/services/agents/report_agent.py` | `ReportAgent` (실험 보고서) |
| `backend/src/services/agents/experiment_agent.py` | `ExperimentAgent` (Data→Model→Report 오케스트레이션) |
| `backend/src/services/agents/smart_agent.py` | `SmartAgent` (RAG + 하위 Agent 결합) |
| `backend/src/api/rag.py` | `/api/rag/ingest`, `/api/rag/query`, `/api/rag/stats` |
| `backend/src/api/agent.py` | `/api/agent/run`, `/api/agent/list` |
| `backend/tests/test_rag.py`, `test_agents.py`, `test_routers_rag_agent.py` | 회귀 테스트 (29개, 외부 호출 전부 mock) |
| `samples/rag_e2e_sample.json` | E2E 검증용 샘플 문서 |

### 엔드포인트

```http
POST /api/rag/ingest
  {
    "documents": [
      { "text": "...", "metadata": { "source": "..." }, "id": "optional-stable-id" }
    ],
    "collection": "default",
    "chunk_size": 600,
    "chunk_overlap": 80
  }

POST /api/rag/query
  {
    "query": "...",
    "mode": "search" | "answer",
    "top_k": 4,
    "provider": "openai" | "gemini",
    "min_score": 0.0
  }

GET  /api/rag/stats?collection=default

POST /api/agent/run
  {
    "agent": "data" | "model" | "report" | "experiment" | "smart",
    "task": "...",
    "context": "optional extra info",
    "provider": "openai" | "gemini",
    "model": "optional model override",
    "options": { "inner": "experiment", "top_k": 4, "min_score": 0.0 }
  }

GET  /api/agent/list
```

### 빠른 실행 (Windows PowerShell)

```powershell
# 1) chromadb 포함 의존성 설치 (기존 .venv 재사용)
.\backend\.venv\Scripts\python.exe -m pip install "chromadb>=0.5,<0.6"

# 2) 회귀 테스트 (외부 API 호출 전부 모킹)
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -v

# 3) 서버 기동
.\backend\.venv\Scripts\python.exe -m uvicorn src.main:app `
    --host 127.0.0.1 --port 8010 --app-dir backend

# 4) 샘플 문서 ingest → RAG answer → Agent run (별도 PowerShell)
$body = Get-Content samples\rag_e2e_sample.json -Raw
Invoke-RestMethod -Uri http://127.0.0.1:8010/api/rag/ingest `
    -Method POST -ContentType "application/json; charset=utf-8" -Body $body

Invoke-RestMethod -Uri http://127.0.0.1:8010/api/rag/query -Method POST `
    -ContentType "application/json; charset=utf-8" `
    -Body '{"query":"Which vector database does APS use?","mode":"answer","top_k":3}'

Invoke-RestMethod -Uri http://127.0.0.1:8010/api/agent/run -Method POST `
    -ContentType "application/json; charset=utf-8" `
    -Body '{"agent":"experiment","task":"Build a churn prediction model","provider":"openai"}'
```

### 설계 포인트

- **키 노출 방지**: gateway가 모든 키를 `os.getenv`로 읽고 로그엔 `<configured>` 토큰만 남깁니다. `chromadb` telemetry는 설정으로 비활성화됩니다.
- **명시적 임베딩**: Chroma 내장 임베더 대신 LLM gateway(`embed_texts`)가 벡터를 생성해 넘깁니다. 로컬 ONNX 모델 다운로드가 필요 없습니다.
- **구조화 출력**: 각 Agent는 Pydantic 스키마 + `response_format={"type":"json_object"}`(OpenAI) / `response_mime_type="application/json"`(Gemini)로 JSON을 강제하고, 실패 시 raw dict를 보존해 downstream이 복구할 수 있습니다.
- **RAG-Agent 결합**: `SmartAgent`는 먼저 `semantic_search`로 상위 K 청크를 가져와 사용자 `context` 앞에 삽입한 뒤 내부 Agent를 호출합니다. 결과에 검색된 소스와 점수가 함께 반환됩니다.

### 저장소

```
backend/data/vector_db/             # Chroma 기본 경로 (VECTOR_DB_PATH 로 변경 가능)
  └── <collection>/                 # VECTOR_DB_COLLECTION 기본값 "default"
```

## 라이선스

교육/연구 목적 사용을 기본으로 합니다.
