#!/usr/bin/env bash
# systemd 유닛을 설치하고 서비스를 켭니다. 루트 권한 필요.
# 사용: sudo bash scripts/lab-server/install-systemd.sh
set -euo pipefail

if [[ "${EUID:-}" -ne 0 ]]; then
  echo "sudo 로 실행하세요: sudo bash scripts/lab-server/install-systemd.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AILAB_HOME="$(cd "$SCRIPT_DIR/../.." && pwd)"
UNIT_SRC="$SCRIPT_DIR/ailab-backend.service.in"
UNIT_DST="/etc/systemd/system/ailab-backend.service"

if [[ ! -f "$AILAB_HOME/backend/.venv/bin/uvicorn" ]]; then
  echo "먼저 setup-lab-backend.sh 를 실행해 venv 를 만드세요."
  exit 1
fi

sed "s|@AILAB_HOME@|$AILAB_HOME|g" "$UNIT_SRC" >"$UNIT_DST"
chmod 644 "$UNIT_DST"
systemctl daemon-reload
systemctl enable ailab-backend.service
systemctl restart ailab-backend.service
systemctl --no-pager -l status ailab-backend.service || true
echo "[AILab] ailab-backend.service 설치 완료. 로그: journalctl -u ailab-backend -f"
