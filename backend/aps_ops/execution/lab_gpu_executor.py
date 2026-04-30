"""Lab GPU 실행 경로 — SQS Lab 큐 발행만. 운영 DB 직접 접근 금지(Worker 역할)."""

from __future__ import annotations

#
# enqueue 및 S3 업로드는 execution_router 에서 orchestration 한다.
