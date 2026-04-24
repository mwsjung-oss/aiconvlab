# Experiment V3 — 사용 안내

## 1. 개요

APS 의 **Experiment** 메뉴는 2026-04-24 부로 V3 로 전환되었다. V2 는
`frontend/src/pages/experimentV2/` 에 원본이 그대로 남아 있고, 같은 시점의
스냅샷은 `frontend/src/pages/UI_backup_0424/` 와 git tag `ui-backup-0424`
에 보존된다.

V3 의 특징:

- **2줄 상단 바** — Row 1 (프로젝트명 · 홈 · 사용자 · 로그아웃), Row 2 (5단계 탭).
- **20/80 본문** — 좌측 20% Activity 네비, 우측 80% 작업 공간.
- **5 단계 × Activity 카탈로그** — CRISP-DM + MLOps 기반 표준 절차(총 ~22 Activity).
- **Colab-like 셀** — Prompt/Code/Markdown/SQL 4 종.
- **세션 보존 Python 커널** — ipykernel 위에서 사용자별 1 커널, 변수 상태 유지.
- **파일 업로드 + 미리보기** — `/api/upload` → `/api/preview` → `/api/kernel/load_file`.
- **전 과정 Tracing** — 프롬프트 / 코드 / 결과 / 오류를 SQLite + localStorage 양쪽에 기록.

## 2. 화면 구조

```
┌─────────────────────────────────────────────────────────────┐
│ APS · Experiment  [프로젝트명]  [저장됨]        [홈] [👤] [↩]│  Row 1
├─────────────────────────────────────────────────────────────┤
│ 1 프로젝트 정의  2 데이터 준비  3 실험 설계  4 분석  5 리포트│  Row 2
├──────────────────┬──────────────────────────────────────────┤
│ [단계]           │ [활동 제목] · 개요    [커널] [인터럽트]   │
│ 1. 비즈니스 목표 │ ┌─ Guide ────────────────────────────┐  │
│ 2. KPI 설정      │ │ 해야 할 일 · 산출물 · 템플릿       │  │
│ 3. 제약·리스크   │ └────────────────────────────────────┘  │
│ 4. 범위·일정     │ [파일 업로드 · data 단계에서만]          │
│   …              │ ┌── Cells ─────────────────────────────┐│
│                  │ │ [prompt] / [code] / [markdown] / [sql]││
│                  │ └──────────────────────────────────────┘│
└──────────────────┴──────────────────────────────────────────┘
```

## 3. 데이터 흐름

```
[사용자]
   │  ① Prompt 셀 실행         ② Code 셀 실행             ③ CSV 업로드
   ▼                            ▼                            ▼
 /api/chat/test            /api/kernel/execute         /api/upload
   │                            │                            │
   ▼                            ▼                            ▼
 LLM (OpenAI)           ipykernel session           ws.data/<file>
   │                            │                            │
   └───────── /api/tracing/record ──── SQLite ──────────────┘
                                  │
                                  ▼
                         RunHistory 드로어
```

## 4. 세션 커널 정책

| 항목 | 값 |
|---|---|
| 구현 | `backend/src/services/kernel_manager.py` — `KernelRegistry` 싱글턴 |
| 사용자당 커널 | 1개 |
| 초기 import | `pandas`, `numpy`, `matplotlib.pyplot` (Agg 백엔드) |
| 실행 타임아웃 | 기본 60s (최대 120s 요청 가능) |
| 유휴 정리 | 30분 이상 미사용 시 자동 shutdown |
| 동시 한도 | 프로세스당 최대 8명 (초과 시 429 KernelQuotaError) |
| 출력 형식 | `stream` / `text` / `image_png` (base64) / `html` / `error` |

## 5. Tracing 저장소

- 파일: `backend/data/app.db`, 테이블: `experiment_traces_v3`
- 스키마:
  ```sql
  CREATE TABLE experiment_traces_v3 (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    cell_id TEXT,
    kind TEXT NOT NULL,        -- prompt|code|result|error|file
    content TEXT NOT NULL,
    outputs_json TEXT,
    execution_count INTEGER,
    duration_ms INTEGER,
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  ```
- 엔드포인트:
  - `POST /api/tracing/record` — 신규 기록 (프론트에서 LLM 결과 등)
  - `GET  /api/tracing/list?stage=&activity_id=&limit=`
  - `GET  /api/tracing/export?format=md|json`
  - `DELETE /api/tracing/{id}` (soft delete)

## 6. 엔드포인트 요약

### 커널 (`/api/kernel/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/start` | 사용자 커널 확보 |
| GET | `/status` | ready/busy 상태 조회 |
| POST | `/execute` | `{code, activity_id?, cell_id?, timeout?}` |
| POST | `/interrupt` | 실행 중 코드 인터럽트 |
| POST | `/shutdown` | 커널 종료 |
| POST | `/load_file` | `{filename, variable?}` → `df = pd.read_csv(...)` |

### 트레이싱 (`/api/tracing/*`) — 5 장 참고

모든 엔드포인트는 요청 헤더 `X-User-Id` 로 사용자를 식별한다. 미설정 시
요청 IP 기반 `anon:<ip>` 로 폴백한다.

## 7. 운영 고려사항

- **Render 무료 플랜**: 512MB 메모리, 커널 1~2명 동시 사용 가능.
  OOM 위험 증가 시 Starter($7/월) 로 승격 권장. 커널 로드 실패 시 UI
  상단에 "커널 오류" 칩이 뜨고 `kernel.status.lastError` 에 메시지가
  담긴다.
- **코드 실행 보안**: 현재는 경로 화이트리스트 (업로드 디렉터리)와 실행
  타임아웃으로만 보호된다. 공개 서비스로 확장할 경우 RLIMIT/seccomp
  기반 샌드박스 또는 원격 커널 분리를 검토해야 한다.
- **LocalStorage 키**:
  - V3 상태: `ailab_experiment_v3_state_v1`
  - V3 트레이스: `ailab_experiment_v3_traces_v1`
  - V2 상태: `ailab_experiment_v2_state_v1` (읽기 전용 보존)
  - V2 배너 해제: `ailab_experiment_v3_legacy_banner_dismissed`

## 8. 로컬 실행

### 백엔드

```powershell
cd backend
pip install -r requirements.txt
# OPENAI_API_KEY / GEMINI_API_KEY 는 backend/.env 에서 로드
uvicorn main:app --reload --port 8000
```

### 프론트엔드

```powershell
cd frontend
npm install
npm run dev
```

## 9. 스모크 체크리스트

- [ ] 1단계 Activity 선택 → 가이드 영역 렌더
- [ ] 프롬프트 셀에서 템플릿 버튼 → 본문 자동 채움 → 실행 → 결과 표시
- [ ] 2단계(Data) → CSV 업로드 → 미리보기 표 → "커널에 df 로드" → 코드 셀에서 `df.head()` 확인
- [ ] 3단계에서 교차검증 코드 실행 → 그래프(PNG) 출력
- [ ] 이력 드로어에서 prompt/code/result 카드 확인
- [ ] 로그아웃 → 재로그인 → 마지막 상태 복구 (localStorage)

## 10. 플랜 B 승격 권고

Render 무료 플랜에서 커널 1개가 pandas+numpy 로드만으로 약 200MB 를
사용한다. 두 명 이상의 사용자가 동시에 커널을 띄우면 OOM 위험이
있으므로 **동시 1명 초과 예상 시 Starter($7/월, 512MB → 1GB) 로
승격**을 권한다. 더 큰 트래픽은 프로세스별 `MAX_CONCURRENT_KERNELS` 를
조정하고 워커 수를 늘리는 방식으로 확장한다.
