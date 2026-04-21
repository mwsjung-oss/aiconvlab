"""Smoke test: call OpenAI through the shared LLM gateway and print the reply."""
from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
_SRC_DIR = _REPO_ROOT / "backend" / "src"

load_dotenv(_REPO_ROOT / ".env", override=False)
load_dotenv(_REPO_ROOT / "backend" / ".env", override=False)

if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

from services.llm_gateway import ask_openai, LLMGatewayError  # noqa: E402


def main() -> int:
    prompt = "Reply with exactly the single word: pong"
    try:
        text = ask_openai(prompt)
    except LLMGatewayError as exc:
        print(f"[FAIL] OpenAI gateway error: {exc}")
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] Unexpected error: {type(exc).__name__}: {exc}")
        return 2

    preview = text if len(text) <= 400 else text[:400] + "…"
    print("[OK] OpenAI response:")
    print(preview)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
