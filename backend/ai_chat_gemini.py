"""Gemini API + function calling (도구는 OPENAI_TOOL_SPECS와 동일)."""
from __future__ import annotations

import json
import os
from typing import Any

import google.generativeai as genai
from google.generativeai.types import FunctionDeclaration, Tool

from models import User

from ai_chat_tools import OPENAI_TOOL_SPECS, execute_tool


def _json_safe(obj: Any) -> Any:
    try:
        return json.loads(json.dumps(obj, ensure_ascii=False, default=str))
    except Exception:
        return {"raw": str(obj)}


def _build_tool() -> Tool:
    decls: list[Any] = []
    for spec in OPENAI_TOOL_SPECS:
        fn = spec.get("function") or {}
        name = fn.get("name")
        if not name:
            continue
        decls.append(
            FunctionDeclaration(
                name=name,
                description=fn.get("description") or "",
                parameters=fn.get("parameters")
                or {"type": "object", "properties": {}},
            )
        )
    return Tool(function_declarations=decls)


def _turns_from_messages(
    messages: list[dict[str, str]], base_system: str
) -> tuple[str, list[tuple[str, str]]]:
    """system 병합 문자열, (user|model, text) 리스트. 마지막은 반드시 user."""
    extra = ""
    turns: list[tuple[str, str]] = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content") or ""
        if role == "system":
            extra += "\n\n[사용자 지시]\n" + content
        elif role == "user":
            turns.append(("user", content))
        elif role == "assistant":
            turns.append(("model", content))
    return base_system + extra, turns


def run_gemini_chat(
    messages: list[dict[str, str]], user: User, *, system_prompt: str
) -> dict[str, Any]:
    key = (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        return {"ok": False, "reason": "no_google_api_key", "mode": "error"}

    try:
        genai.configure(api_key=key)
    except Exception as e:
        return {"ok": False, "reason": str(e), "mode": "error"}

    model_name = (os.getenv("GEMINI_CHAT_MODEL") or "gemini-2.0-flash").strip()
    tool = _build_tool()
    sys_full, turns = _turns_from_messages(messages, system_prompt)

    if not turns or turns[-1][0] != "user":
        return {
            "ok": False,
            "reason": "마지막 메시지는 사용자(user)여야 합니다.",
            "mode": "error",
        }

    try:
        model = genai.GenerativeModel(
            model_name=model_name,
            tools=[tool],
            system_instruction=sys_full,
        )
    except Exception as e:
        return {"ok": False, "reason": str(e), "mode": "error"}

    history: list[dict[str, Any]] = []
    for role, text in turns[:-1]:
        gr = "user" if role == "user" else "model"
        history.append({"role": gr, "parts": [text]})

    last_user_text = turns[-1][1]
    chat = model.start_chat(history=history)
    tool_results_log: list[dict[str, Any]] = []
    max_rounds = 6
    response = chat.send_message(last_user_text)

    for _ in range(max_rounds):
        parts: list[Any] = []
        try:
            cands = getattr(response, "candidates", None) or []
            if cands:
                parts = list(cands[0].content.parts or [])
        except (AttributeError, IndexError):
            parts = []

        if not parts:
            try:
                t = getattr(response, "text", None) or ""
            except Exception:
                t = ""
            return {
                "ok": True,
                "mode": "gemini",
                "reply": (t or "").strip() or "(응답 없음)",
                "tool_results": tool_results_log,
            }

        fc_list = [p for p in parts if getattr(p, "function_call", None)]
        tx_list = [p for p in parts if getattr(p, "text", None)]

        if fc_list:
            fr_parts: list[genai.protos.Part] = []
            for p in fc_list:
                fc = p.function_call
                name = fc.name
                args = dict(fc.args) if fc.args else {}
                result = execute_tool(
                    name, user, args if isinstance(args, dict) else {}
                )
                tool_results_log.append({"name": name, "result": result})
                fr_parts.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=name,
                            response=_json_safe(result),
                        )
                    )
                )
            response = chat.send_message(genai.protos.Content(parts=fr_parts))
            continue

        if tx_list:
            text = "".join((p.text or "") for p in tx_list).strip()
            return {
                "ok": True,
                "mode": "gemini",
                "reply": text or "(응답 없음)",
                "tool_results": tool_results_log,
            }

        return {
            "ok": True,
            "mode": "gemini",
            "reply": "(응답 없음)",
            "tool_results": tool_results_log,
        }

    return {
        "ok": True,
        "mode": "gemini",
        "reply": "도구 호출 반복 한도에 도달했습니다.",
        "tool_results": tool_results_log,
    }
