"""requirements.txt bcrypt/passlib pins for login stability."""
from __future__ import annotations

from pathlib import Path

from smoke_remote_checks import requirements_pins_ok


def test_bcrypt_and_passlib_pins() -> None:
    root = Path(__file__).resolve().parent.parent
    errs = requirements_pins_ok(root / "requirements.txt")
    assert not errs, "; ".join(errs)
