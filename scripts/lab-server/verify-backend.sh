#!/usr/bin/env bash
# 백엔드가 이 저장소의 전체 API인지 확인합니다.
# 사용: bash scripts/lab-server/verify-backend.sh [http://127.0.0.1:8000]
set -euo pipefail

BASE="${1:-http://127.0.0.1:8000}"
BASE="${BASE%/}"

echo "[AILab] GET $BASE/api/health"
curl -sfS "$BASE/api/health" | head -c 400 || {
  echo "실패: 서버가 안 떠 있거나 방화벽/Tailscale 경로를 확인하세요."
  exit 1
}
echo ""
echo "[AILab] OpenAPI 에 /api/auth/login 존재 여부"
JSON=$(curl -sfS "$BASE/openapi.json")
if echo "$JSON" | grep -q '"/api/auth/login"'; then
  echo "OK: /api/auth/login 이 있습니다."
else
  echo "경고: /api/auth/login 이 없습니다. 다른(스텁) 서버가 8000에서 떠 있을 수 있습니다. 기존 프로세스를 중지하고 이 프로젝트의 uvicorn 을 켜세요."
  exit 1
fi
