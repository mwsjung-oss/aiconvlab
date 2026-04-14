#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$BACKEND_DIR/backups/$STAMP"
mkdir -p "$OUT_DIR"

cp -f "$BACKEND_DIR/data/app.db" "$OUT_DIR/" 2>/dev/null || true
cp -f "$BACKEND_DIR/job_registry.json" "$OUT_DIR/" 2>/dev/null || true
cp -f "$BACKEND_DIR/experiment_history.json" "$OUT_DIR/" 2>/dev/null || true
tar -czf "$OUT_DIR/artifacts.tar.gz" -C "$BACKEND_DIR" data models outputs logs 2>/dev/null || true

echo "Backup created: $OUT_DIR"
