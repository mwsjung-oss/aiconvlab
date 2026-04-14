#!/usr/bin/env bash
# 연구실 서버에서 AILab 백엔드 실행 환경을 만듭니다 (venv, 디렉터리, .env).
# 사용: bash scripts/lab-server/setup-lab-backend.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AILAB_HOME="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$AILAB_HOME/backend"
VENV="$BACKEND_DIR/.venv"

echo "[AILab] AILAB_HOME=$AILAB_HOME"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 가 필요합니다. Ubuntu 예: sudo apt install -y python3 python3-venv python3-pip"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  if [[ -f "$BACKEND_DIR/.env.lab.example" ]]; then
    cp "$BACKEND_DIR/.env.lab.example" "$BACKEND_DIR/.env"
    echo "[AILab] backend/.env 를 .env.lab.example 로 생성했습니다. JWT_SECRET·MASTER_*·BACKEND_PUBLIC_URL 등을 수정하세요."
  else
    echo "[AILab] backend/.env 가 없습니다. backend/.env.lab.example 을 복사해 편집하세요."
    exit 1
  fi
fi

echo "[AILab] AILAB_STORAGE_ROOT 는 backend/.env 에서 설정합니다. 최초 기동 시 디렉터리가 생성됩니다."

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$BACKEND_DIR/requirements.txt"

echo "[AILab] 설치 완료. 다음:"
echo "  1) backend/.env 에 JWT_SECRET, MASTER_EMAIL, MASTER_PASSWORD, BACKEND_PUBLIC_URL(Tailscale URL) 확인"
echo "  2) 수동 실행: cd backend && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000"
echo "  3) systemd: sudo bash scripts/lab-server/install-systemd.sh"
