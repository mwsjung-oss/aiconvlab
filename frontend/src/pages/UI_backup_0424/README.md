# UI Backup — 2026-04-24

이 폴더는 `frontend/src/pages/experimentV2/` 의 **읽기 전용 스냅샷**입니다.

- 스냅샷 시점: 2026-04-24
- 대응 git tag: `ui-backup-0424`
- 생성 목적: Experiment 페이지 V3 (2줄 헤더 + 20/80 레이아웃 + 5단계 Activity + 세션 보존 Python 커널 + Tracing) 전환 전의 V2 전체를 원형 그대로 보존.

## 사용 지침

- 이 폴더의 파일은 **수정 금지**.
- 어떤 컴포넌트도 프로덕션 코드에서 import 하지 않습니다 (빌드 대상에서 제외).
- V2 가 실제로 동작하는 코드는 여전히 `frontend/src/pages/experimentV2/` 에 그대로 있어, 필요 시 import 는 그쪽에서 하도록 한다.
- 참고·비교·회귀 테스트용으로만 열람.

## 복원 방법

1. 특정 파일만 복원할 때:
   ```powershell
   Copy-Item UI_backup_0424/ExperimentPageV2.jsx ../experimentV2/ExperimentPageV2.jsx
   ```
2. 전체 롤백: `git checkout ui-backup-0424 -- frontend/src/pages/experimentV2`
