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
    if "bcrypt==4.0.1" not in lines:
        errors.append("requirements.txt must pin exactly: bcrypt==4.0.1")
    if "passlib[bcrypt]==1.7.4" not in lines:
        errors.append("requirements.txt must pin exactly: passlib[bcrypt]==1.7.4")
    # Disallow looser bcrypt/passlib lines (e.g. bcrypt>=...)
    for ln in lines:
        if re.match(r"^bcrypt[<>=!]", ln) and ln != "bcrypt==4.0.1":
            errors.append(f"Unexpected bcrypt requirement line (use only bcrypt==4.0.1): {ln}")
        if ln.startswith("passlib") and ln != "passlib[bcrypt]==1.7.4":
            errors.append(
                f"Unexpected passlib requirement line (use only passlib[bcrypt]==1.7.4): {ln}"
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


def check_login_success_if_env(base_url: str) -> None:
    import os

    email = (os.environ.get("AILAB_SMOKE_EMAIL") or "").strip()
    password = (os.environ.get("AILAB_SMOKE_PASSWORD") or "").strip()
    if not email or not password:
        return
    code, body = _request_json(
        "POST",
        f"{base_url}/api/auth/login",
        {"email": email, "password": password},
    )
    assert code == 200, f"smoke login expected 200, got {code}, body={body}"
    assert isinstance(body, dict), body
    assert body.get("access_token"), f"missing access_token in {body}"


def run_smoke_http(base_url: str) -> None:
    base_url = base_url.rstrip("/")
    check_health(base_url)
    check_login_invalid_returns_401(base_url)
    check_login_success_if_env(base_url)


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
