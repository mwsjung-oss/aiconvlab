# APS 데이터베이스 초기화 (RDS PostgreSQL)

## 1단계 — 스키마

이 저장소에는 Alembic를 사용하지 않습니다. 새 RDS 인스턴스에 최초 반영 시:

1. **`backend/models.py`** / **`backend/models_aps.py`** 에 정의된 테이블을 기준으로 한다.
2. 운영용 DDL 예시는 **`backend/db/schema.sql`** 을 참고한다 (`users`, `experiments` 등 기존 테이블이 이미 있다는 전제 하에 `jobs` 관련 DDL만 포함).

## 적용 순서 제안

1. 애플리케이션 사용자·프로젝트 테이블이 없다면 `main.py` 기동 또는 관리 마이그레이션으로 기본 사용자 스키마를 생성한다.
2. APS Job 테이블이 없을 때 **`backend/db/schema.sql`** 의 `jobs` / `job_events` / `llm_usage_logs` / `lab_worker_heartbeats` 구문만 선택 적용한다.
3. `sqlalchemy`(또는 `psql`)로 실행 후 `\dt` 로 확인한다.

## 주의

- 운영 DB에 직접 DDL 적용 전 **백업** 필수.
- SQLite 로컬 개발은 `APS_SQLITE_FALLBACK_DEV` 사용 시 파일 DB에 ORM 이 `CREATE` 할 수 있다(모델 import 시).
