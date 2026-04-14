#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
LOG_ROOTS=("$BACKEND_DIR/logs" "$BACKEND_DIR/data/workspaces")
MAX_MB="${1:-20}"
MAX_BYTES=$((MAX_MB * 1024 * 1024))

for root in "${LOG_ROOTS[@]}"; do
  [[ -d "$root" ]] || continue
  while IFS= read -r -d '' f; do
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if (( size > MAX_BYTES )); then
      mv "$f" "${f}.$(date +%Y%m%d_%H%M%S).bak"
      : > "$f"
    fi
  done < <(find "$root" -type f -name "*.log" -print0)
done

echo "Log rotation complete (threshold=${MAX_MB}MB)"
