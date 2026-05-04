#!/usr/bin/env python3
"""
배포 후 스모크 점검(선택값).
  APS_API_ORIGIN=https://YOUR-EB-HOST.elasticbeanstalk.com python scripts/smoke_deploy_check.py
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_ENV = Path(__file__).resolve().parents[1] / "backend"
if BACKEND_ENV.is_dir():
    sys.path.insert(0, str(BACKEND_ENV))
try:
    from dotenv import load_dotenv

    load_dotenv(BACKEND_ENV / ".env")
except ImportError:
    pass


def _get(url: str, *, timeout_s: float = 20.0) -> tuple[int, bytes]:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "ailab-smoke/1"})
    with urllib.request.urlopen(req, timeout=timeout_s, context=ctx) as r:
        return r.status, r.read()


def main() -> int:
    api = (os.getenv("APS_API_ORIGIN") or "").strip().rstrip("/") or ""
    if not api:
        print(
            "[ERROR] APS_API_ORIGIN 또는 환경 변수로 공개 Backend HTTPS URL 을 설정하세요. "
            "예: APS_API_ORIGIN=https://your-eb.env.region.elasticbeanstalk.com python scripts/smoke_deploy_check.py",
            file=sys.stderr,
        )
        return 2
    if not api.startswith(("http://", "https://")):
        api = "https://" + api

    try:
        hc, hb = _get(f"{api}/api/health")
    except urllib.error.HTTPError as e:
        hc = e.code
        hb = b""
        print("[FAIL]", f"/api/health HTTP {hc}", file=sys.stderr)
        return 1
    except OSError as e:
        print("[FAIL]", f"/api/health 접속 불가: {e}", file=sys.stderr)
        return 1

    ok_h = hc == 200

    ok_db = False
    dbbody = b""
    dbc = 0
    try:
        dbc, dbbody = _get(f"{api}/api/health/db")
        ok_db = dbc == 200
    except urllib.error.HTTPError as e:
        dbc = e.code
        ok_db = False
    except OSError:
        ok_db = False
        print("[WARN] /api/health/db 접속 실패(네트워크)")
    else:
        if ok_db:
            try:
                data = json.loads(dbbody.decode("utf-8"))
                if data.get("database") != "postgresql":
                    print("[WARN]", f"/api/health/db 응답 형식 확인: {data}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                print("[WARN] /api/health/db JSON 파싱 실패")

    print("[OK]" if ok_h else "[FAIL]", f"GET /api/health ({hc})", hb.decode("utf-8", errors="replace")[:160])
    print("[OK]" if ok_db else "[FAIL]", f"GET /api/health/db ({dbc})", dbbody.decode("utf-8", errors="replace")[:160])

    if not ok_h:
        print(
            "(로컬 테스트는 DATABASE_URL 과 Render 환경이 필요합니다. 운영 URL 기준 검사입니다.)",
            file=sys.stderr,
        )
        return 1

    print(
        "로그인·실험 리스트 테스트는 테스트 계정/토큰이 필요하므로 별도 E2E 절차입니다. 문서 참고."
    )

    return 0 if ok_h and ok_db else 1


if __name__ == "__main__":
    raise SystemExit(main())
