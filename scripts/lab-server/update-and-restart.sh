#!/usr/bin/env bash
# 연구실 Linux 서버에서 저장소를 갱신하고 ailab-backend 를 재시작합니다.
# 사용(저장소 루트 또는 이 스크립트 경로에서):
#   bash scripts/lab-server/update-and-restart.sh
# systemd 미사용 시 마지막에 수동 uvicorn 안내만 합니다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO"

echo "[AILab] REPO=$REPO"

if [[ -d .git ]]; then
  echo "[AILab] git pull..."
  git pull
else
  echo "[AILab] 경고: .git 없음. 코드를 이 경로에 수동으로 맞춘 뒤 다시 실행하세요."
fi

if [[ -f backend/.venv/bin/pip ]]; then
  echo "[AILab] pip install -r backend/requirements.txt ..."
  backend/.venv/bin/pip install -q -r backend/requirements.txt
else
  echo "[AILab] backend/.venv 없음. 먼저: bash scripts/lab-server/setup-lab-backend.sh"
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^ailab-backend\.service'; then
  echo "[AILab] sudo systemctl restart ailab-backend (비밀번호 요구 가능)"
  sudo systemctl restart ailab-backend.service
  sleep 2
  systemctl --no-pager -l status ailab-backend.service || true
else
  echo "[AILab] ailab-backend.service 가 없습니다. install-systemd.sh 로 설치하거나 수동으로 uvicorn 을 재시작하세요."
fi

echo "[AILab] 로컬 헬스: curl -s http://127.0.0.1:8000/api/health"
curl -sS "http://127.0.0.1:8000/api/health" && echo "" || echo "(실패)"
