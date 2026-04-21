"""Unified gateway for OpenAI and Gemini chat completions.

- Loads API keys exclusively from environment variables (never hardcoded).
- Masks key material in logs.
- Exposes ``ask_openai``, ``ask_gemini`` and the unified ``ask_llm`` entry point.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Literal, Sequence

logger = logging.getLogger("llm_gateway")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s")
    )
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

Provider = Literal["openai", "gemini"]

DEFAULT_OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")


class LLMGatewayError(RuntimeError):
    """Raised when an LLM call fails or configuration is invalid."""


def _require_key(name: str) -> str:
    value = os.getenv(name)
    if not value or not value.strip():
        raise LLMGatewayError(
            f"Environment variable {name} is missing. "
            "Define it in .env (never commit the value)."
        )
    return value.strip()


def _mask(secret: str) -> str:
    """Redact a credential for logging.

    Per the project's SAFETY RULES we must NEVER print any portion of an API
    key, so this intentionally returns a static marker with no length hint.
    """
    return "<configured>" if secret else "<empty>"


def has_openai_key() -> bool:
    value = os.getenv("OPENAI_API_KEY")
    return bool(value and value.strip())


def has_gemini_key() -> bool:
    value = os.getenv("GEMINI_API_KEY")
    return bool(value and value.strip())


def ask_openai(prompt: str, *, model: str | None = None) -> str:
    """Call OpenAI chat completions and return the assistant text.

    Raises :class:`LLMGatewayError` on configuration or API errors.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        raise LLMGatewayError("prompt must be a non-empty string")

    key = _require_key("OPENAI_API_KEY")
    chosen_model = (model or DEFAULT_OPENAI_MODEL).strip()
    logger.info(
        "openai.ask model=%s key=%s prompt_chars=%d",
        chosen_model,
        _mask(key),
        len(prompt),
    )

    try:
        from openai import OpenAI  # local import keeps startup light
    except ImportError as exc:  # pragma: no cover - guarded by requirements
        raise LLMGatewayError(
            "openai package is not installed. Run: pip install openai"
        ) from exc

    try:
        client = OpenAI(api_key=key)
        response = client.chat.completions.create(
            model=chosen_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=256,
        )
    except Exception as exc:  # noqa: BLE001 - normalize all upstream errors
        logger.exception("openai.ask failed: %s", type(exc).__name__)
        raise LLMGatewayError(f"OpenAI request failed: {exc}") from exc

    try:
        text = response.choices[0].message.content or ""
    except (AttributeError, IndexError) as exc:
        raise LLMGatewayError("OpenAI response had no choices") from exc

    text = text.strip()
    if not text:
        raise LLMGatewayError("OpenAI returned empty content")
    logger.info("openai.ask ok chars=%d", len(text))
    return text


def ask_gemini(prompt: str, *, model: str | None = None) -> str:
    """Call Gemini ``generate_content`` and return the assistant text."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise LLMGatewayError("prompt must be a non-empty string")

    key = _require_key("GEMINI_API_KEY")
    chosen_model = (model or DEFAULT_GEMINI_MODEL).strip()
    logger.info(
        "gemini.ask model=%s key=%s prompt_chars=%d",
        chosen_model,
        _mask(key),
        len(prompt),
    )

    try:
        import warnings

        # The SDK emits a FutureWarning on every import/use; suppress only
        # that single notice so it doesn't flood request logs.
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                category=FutureWarning,
                module=r"google\.generativeai(\..*)?$",
            )
            import google.generativeai as genai
    except ImportError as exc:  # pragma: no cover
        raise LLMGatewayError(
            "google-generativeai package is not installed. "
            "Run: pip install google-generativeai"
        ) from exc

    try:
        genai.configure(api_key=key)
        model_obj = genai.GenerativeModel(chosen_model)
        response = model_obj.generate_content(prompt)
    except Exception as exc:  # noqa: BLE001
        logger.exception("gemini.ask failed: %s", type(exc).__name__)
        raise LLMGatewayError(f"Gemini request failed: {exc}") from exc

    text = ""
    try:
        text = (response.text or "").strip()
    except Exception:  # response.text may raise if safety-blocked
        text = ""
    if not text:
        try:
            for cand in getattr(response, "candidates", []) or []:
                parts = getattr(getattr(cand, "content", None), "parts", []) or []
                for part in parts:
                    piece = getattr(part, "text", None)
                    if piece:
                        text += piece
            text = text.strip()
        except Exception:  # noqa: BLE001
            text = ""

    if not text:
        raise LLMGatewayError(
            "Gemini returned empty content (possibly filtered by safety settings)"
        )
    logger.info("gemini.ask ok chars=%d", len(text))
    return text


def ask_llm(provider: str, prompt: str, *, model: str | None = None) -> str:
    """Dispatch to the configured provider (``openai`` or ``gemini``)."""
    if not isinstance(provider, str):
        raise LLMGatewayError("provider must be a string")
    key = provider.strip().lower()
    if key in {"openai", "gpt"}:
        return ask_openai(prompt, model=model)
    if key in {"gemini", "google"}:
        return ask_gemini(prompt, model=model)
    raise LLMGatewayError(
        f"Unknown provider '{provider}'. Supported: openai, gemini."
    )


def _extract_json(text: str) -> Any:
    """Best-effort JSON extraction from a model response.

    Handles fenced code blocks (```json ... ```), stray prose before/after,
    and single-quoted Python-ish dicts as a last resort.
    """
    text = (text or "").strip()
    if not text:
        raise LLMGatewayError("empty response from model")

    fence = re.search(r"```(?:json)?\s*(\{.*?\}|\[.*?\])\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Greedy match the first top-level JSON object/array.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        end = text.rfind(closer)
        if 0 <= start < end:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue

    raise LLMGatewayError("model response was not valid JSON")


def ask_openai_json(
    prompt: str,
    *,
    model: str | None = None,
    system: str | None = None,
) -> Any:
    """Call OpenAI with JSON mode and return the parsed object."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise LLMGatewayError("prompt must be a non-empty string")

    key = _require_key("OPENAI_API_KEY")
    chosen_model = (model or DEFAULT_OPENAI_MODEL).strip()
    logger.info(
        "openai.ask_json model=%s key=%s prompt_chars=%d",
        chosen_model,
        _mask(key),
        len(prompt),
    )

    try:
        from openai import OpenAI
    except ImportError as exc:  # pragma: no cover
        raise LLMGatewayError("openai package is not installed") from exc

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        client = OpenAI(api_key=key)
        response = client.chat.completions.create(
            model=chosen_model,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1024,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("openai.ask_json failed: %s", type(exc).__name__)
        raise LLMGatewayError(f"OpenAI JSON request failed: {exc}") from exc

    try:
        content = response.choices[0].message.content or ""
    except (AttributeError, IndexError) as exc:
        raise LLMGatewayError("OpenAI response had no choices") from exc

    data = _extract_json(content)
    logger.info("openai.ask_json ok")
    return data


def ask_gemini_json(
    prompt: str,
    *,
    model: str | None = None,
    system: str | None = None,
) -> Any:
    """Call Gemini requesting JSON and return the parsed object."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise LLMGatewayError("prompt must be a non-empty string")

    key = _require_key("GEMINI_API_KEY")
    chosen_model = (model or DEFAULT_GEMINI_MODEL).strip()
    logger.info(
        "gemini.ask_json model=%s key=%s prompt_chars=%d",
        chosen_model,
        _mask(key),
        len(prompt),
    )

    try:
        import warnings

        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                category=FutureWarning,
                module=r"google\.generativeai(\..*)?$",
            )
            import google.generativeai as genai
    except ImportError as exc:  # pragma: no cover
        raise LLMGatewayError(
            "google-generativeai package is not installed"
        ) from exc

    full_prompt = prompt
    if system:
        full_prompt = f"{system}\n\n{prompt}"

    try:
        genai.configure(api_key=key)
        model_obj = genai.GenerativeModel(
            chosen_model,
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )
        response = model_obj.generate_content(full_prompt)
    except Exception as exc:  # noqa: BLE001
        logger.exception("gemini.ask_json failed: %s", type(exc).__name__)
        raise LLMGatewayError(f"Gemini JSON request failed: {exc}") from exc

    try:
        text = (response.text or "").strip()
    except Exception:  # noqa: BLE001
        text = ""
    if not text:
        raise LLMGatewayError("Gemini returned empty content")

    data = _extract_json(text)
    logger.info("gemini.ask_json ok")
    return data


def ask_llm_json(
    provider: str,
    prompt: str,
    *,
    model: str | None = None,
    system: str | None = None,
) -> Any:
    """Dispatch JSON requests to the configured provider."""
    if not isinstance(provider, str):
        raise LLMGatewayError("provider must be a string")
    key = provider.strip().lower()
    if key in {"openai", "gpt"}:
        return ask_openai_json(prompt, model=model, system=system)
    if key in {"gemini", "google"}:
        return ask_gemini_json(prompt, model=model, system=system)
    raise LLMGatewayError(
        f"Unknown provider '{provider}'. Supported: openai, gemini."
    )


def embed_texts(texts: Sequence[str], *, model: str | None = None) -> list[list[float]]:
    """Return OpenAI embeddings for each input string.

    Uses ``OPENAI_API_KEY`` + ``EMBEDDING_MODEL`` (default
    ``text-embedding-3-small``). Empty inputs are rejected early to avoid a
    billable call with no result.
    """
    if not isinstance(texts, Sequence) or isinstance(texts, (str, bytes)):
        raise LLMGatewayError("embed_texts expects a sequence of strings")
    cleaned = [str(t) for t in texts if isinstance(t, str) and t.strip()]
    if not cleaned:
        raise LLMGatewayError("embed_texts called with no non-empty inputs")

    key = _require_key("OPENAI_API_KEY")
    chosen_model = (model or DEFAULT_EMBEDDING_MODEL).strip()
    logger.info(
        "openai.embed model=%s key=%s batch=%d",
        chosen_model,
        _mask(key),
        len(cleaned),
    )

    try:
        from openai import OpenAI
    except ImportError as exc:  # pragma: no cover
        raise LLMGatewayError("openai package is not installed") from exc

    try:
        client = OpenAI(api_key=key)
        response = client.embeddings.create(model=chosen_model, input=cleaned)
    except Exception as exc:  # noqa: BLE001
        logger.exception("openai.embed failed: %s", type(exc).__name__)
        raise LLMGatewayError(f"OpenAI embeddings failed: {exc}") from exc

    try:
        vectors = [item.embedding for item in response.data]
    except AttributeError as exc:
        raise LLMGatewayError("OpenAI embeddings response malformed") from exc

    if len(vectors) != len(cleaned):
        raise LLMGatewayError(
            f"embedding count mismatch: got {len(vectors)} for {len(cleaned)} inputs"
        )
    logger.info("openai.embed ok dim=%d", len(vectors[0]) if vectors else 0)
    return vectors


def embed_text(text: str, *, model: str | None = None) -> list[float]:
    """Single-string convenience wrapper around :func:`embed_texts`."""
    return embed_texts([text], model=model)[0]


__all__ = [
    "LLMGatewayError",
    "Provider",
    "ask_openai",
    "ask_gemini",
    "ask_llm",
    "ask_openai_json",
    "ask_gemini_json",
    "ask_llm_json",
    "embed_texts",
    "embed_text",
    "has_openai_key",
    "has_gemini_key",
    "DEFAULT_OPENAI_MODEL",
    "DEFAULT_GEMINI_MODEL",
    "DEFAULT_EMBEDDING_MODEL",
]
