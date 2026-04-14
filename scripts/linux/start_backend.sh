#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_DIR="$BACKEND_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$BACKEND_DIR"
if [[ -f ".venv/bin/activate" ]]; then
  source ".venv/bin/activate"
fi

exec python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
