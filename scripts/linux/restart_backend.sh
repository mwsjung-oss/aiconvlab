#!/usr/bin/env bash
set -euo pipefail

PID="$(lsof -t -i:8000 || true)"
if [[ -n "${PID}" ]]; then
  kill -9 "${PID}" || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/start_backend.sh"
