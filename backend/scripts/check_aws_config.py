#!/usr/bin/env python3
"""AWS 배포 전 환경 변수 점검."""

from __future__ import annotations

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="누락 있어도 exit 0")
    args = parser.parse_args()

    required = [
        "AWS_REGION",
        "S3_BUCKET_DATASETS",
        "S3_BUCKET_ARTIFACTS",
        "SQS_AWS_JOBS_URL",
        "SQS_LAB_GPU_JOBS_URL",
        "JWT_SECRET_KEY",
    ]

    db_ok = bool((os.getenv("APS_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip())
    missing = [k for k in required if not (os.getenv(k) or "").strip()]
    if not db_ok:
        missing.append("APS_DATABASE_URL or DATABASE_URL")

    hints = [
        ("OPENAI_API_KEY", False),
        ("GEMINI_API_KEY", False),
        ("BEDROCK_REGION", False),
        ("LAB_WORKER_SHARED_SECRET", False),
    ]
    soft = [name for name, _ in hints if not (os.getenv(name) or "").strip()]

    print("--- check_aws_config ---")
    print("required missing:", missing or "(none)")
    print("optional empty (LLM / Worker):", soft or "(none)")

    if missing and not args.dry_run:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
