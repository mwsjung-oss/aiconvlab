# Windows 시작 프로그램·로컬 자동 Postgres 기동 해제

과거 버전에서는 PostgreSQL 로컬 인스턴스를 부팅할 때 `pg_ctl` 로 띄우기 위해 시작 프로그램에 `.cmd`(예: **`ailab-start-postgres.cmd`**) 가 등록될 수 있었습니다.

**APS 표준 운영에서는 이 방식을 사용하지 않습니다.** 모든 사용자는 클라우드에 배포된 Backend·Frontend URL 만 접속하면 됩니다.

## 제거 방법

1. `Win + R` → 실행 창에 `shell:startup` 입력 후 확인.
2. 폴더에서 **`ailab-start-postgres.cmd`** 가 있으면 삭제합니다.
3. 또는 **작업 관리자 → 시작 프로그램** 에서 해당 항목을 찾아 **사용 안 함**.
4. PowerShell 시작 스크립트에 직접 넣어둔 `uvicorn` 자동 실행이 있다면 해당 줄을 제거합니다.

## 확인

작업 표시줄 시작 메뉴에 “서버 시작” 배치파일 숏컷 등이 없어야 하며, 강좌에서는 **항상 HTTPS Pages URL** 만 안내하면 됩니다.
