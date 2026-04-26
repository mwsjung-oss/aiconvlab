"""Deployed backend smoke checks (health, login). Used by pytest and CLI script."""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def requirements_pins_ok(requirements_path: Path) -> list[str]:
    """Return list of error messages if bcrypt/passlib pins are missing or wrong."""
    errors: list[str] = []
    text = requirements_path.read_text(encoding="utf-8")
    lines = [
        ln.strip()
        for ln in text.splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]
    req_bcrypt = "bcrypt==4.0.1"
    req_passlib = "passlib[bcrypt]==1.7.4"
    if lines.count(req_bcrypt) != 1:
        errors.append(
            f"requirements.txt must contain exactly one line: {req_bcrypt} (found {lines.count(req_bcrypt)})"
        )
    if lines.count(req_passlib) != 1:
        errors.append(
            f"requirements.txt must contain exactly one line: {req_passlib} (found {lines.count(req_passlib)})"
        )
    # Disallow looser bcrypt/passlib lines (e.g. bcrypt>=...)
    for ln in lines:
        if re.match(r"^bcrypt[<>=!]", ln) and ln != req_bcrypt:
            errors.append(f"Unexpected bcrypt requirement line (use only {req_bcrypt}): {ln}")
        if ln.startswith("passlib") and ln != req_passlib:
            errors.append(
                f"Unexpected passlib requirement line (use only {req_passlib}): {ln}"
            )
    return errors


def _request_json(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    timeout: int = 45,
) -> tuple[int, Any]:
    data = None
    headers: dict[str, str] = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            parsed: Any = json.loads(raw) if raw else None
            return resp.status, parsed
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


def check_health(base_url: str) -> None:
    code, body = _request_json("GET", f"{base_url}/api/health")
    assert code == 200, f"/api/health expected 200, got {code}, body={body}"
    assert isinstance(body, dict) and body.get("status") == "ok", body


def check_health_db(base_url: str) -> None:
    code, body = _request_json("GET", f"{base_url}/api/health/db")
    assert code == 200, f"/api/health/db expected 200, got status={code}, body={body!r}"
    assert isinstance(body, dict) and body.get("status") == "ok", body


def check_login_invalid_returns_401(base_url: str) -> None:
    # EmailStr rejects reserved/special TLDs (e.g. .invalid); use a valid-format address.
    code, body = _request_json(
        "POST",
        f"{base_url}/api/auth/login",
        {
            "email": "ailab_smoke_no_such_user_7f3a2c9e@example.com",
            "password": "wrong-password-smoke-test",
        },
    )
    assert code != 500, f"login invalid must not return 500, got {code}, body={body}"
    assert code == 401, f"login invalid expected 401, got {code}, body={body}"


def check_login_success_required(base_url: str) -> None:
    """CI 필수: AILAB_SMOKE_EMAIL / AILAB_SMOKE_PASSWORD 환경변수와 유효한 로그인."""
    import os

    email = (os.environ.get("AILAB_SMOKE_EMAIL") or "").strip()
    password = (os.environ.get("AILAB_SMOKE_PASSWORD") or "").strip()
    if not email or not password:
        raise AssertionError(
            "AILAB_SMOKE_EMAIL and AILAB_SMOKE_PASSWORD must be set (e.g. GitHub Actions secrets)."
        )
    code, body = _request_json(
        "POST",
        f"{base_url}/api/auth/login",
        {"email": email, "password": password},
    )
    if code != 200 or not isinstance(body, dict) or not body.get("access_token"):
        raise AssertionError(
            f"smoke login success expected 200 and access_token; "
            f"status={code}, body={body!r}"
        )


def run_smoke_http(base_url: str) -> None:
    base_url = base_url.rstrip("/")
    check_health(base_url)
    check_health_db(base_url)
    check_login_invalid_returns_401(base_url)
    check_login_success_required(base_url)


def main(argv: list[str]) -> int:
    backend_root = Path(__file__).resolve().parent
    req_path = backend_root / "requirements.txt"
    pin_errs = requirements_pins_ok(req_path)
    if pin_errs:
        for e in pin_errs:
            print(e, file=sys.stderr)
        return 1

    base = (argv[1] if len(argv) > 1 else "").strip() or (
        __import__("os").environ.get("SMOKE_BACKEND_URL") or ""
    ).strip()
    if not base:
        print(
            "SMOKE_BACKEND_URL or first CLI arg required for HTTP checks.",
            file=sys.stderr,
        )
        return 1
    try:
        run_smoke_http(base)
    except AssertionError as e:
        print(f"SMOKE FAILED: {e}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"SMOKE FAILED (network): {e}", file=sys.stderr)
        return 1
    print("smoke OK:", base)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
