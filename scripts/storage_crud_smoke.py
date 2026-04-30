#!/usr/bin/env python3
"""R2 또는 S3 호환 버킷에 대한 put/read/delete 스모크(자격증명 필요)."""
from __future__ import annotations

import os
import sys
import uuid

def main() -> int:
    bucket = os.getenv("STORAGE_BUCKET", "").strip()
    ak = (
        os.getenv("STORAGE_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID") or ""
    ).strip()
    sk = (
        os.getenv("STORAGE_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY") or ""
    ).strip()
    endpoint = (
        os.getenv("STORAGE_ENDPOINT_URL") or os.getenv("CLOUDFLARE_R2_ENDPOINT") or ""
    ).strip()

    backend = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
    sys.path.insert(0, backend)

    os.environ.setdefault("STORAGE_BACKEND", os.getenv("STORAGE_BACKEND") or "s3")
    if not bucket or not ak or not sk:
        print("[SKIP] STORAGE_BUCKET / 액세스 키가 없어 스토리지 CRUD 테스트를 건너뜁니다.")
        return 0

    from blob_storage.object_store import object_key
    from blob_storage.object_store import ops as s3_ops

    op = s3_ops()
    key_path = object_key("smoke", "crud", f"{uuid.uuid4().hex}.txt")
    payload = b"ailab-crud-test"
    print("[PUT]", key_path)
    op.put_bytes(key_path, payload, content_type="text/plain")
    got = op.get_bytes(key_path)
    if got != payload:
        print("[FAIL] round-trip mismatch", repr(got), repr(payload), file=sys.stderr)
        return 1
    print("[DEL]", key_path)
    op.delete_keys([key_path])
    after = op.get_bytes(key_path)
    if after is not None:
        print("[WARN] 객체가 삭제된 뒤에도 응답이 있습니다(캐시/폴링 차이 확인).", after[:40])
    print("[OK] storage_crud_smoke 통과(endpoint=%r)" % (endpoint,))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
