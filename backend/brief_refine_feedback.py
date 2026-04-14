"""
프로젝트 브리프에 대한 Chatbot 보완 메시지를 제목·본문에 반영 (규칙 + 선택적 OpenAI).
"""
from __future__ import annotations

import json
import os
import re
from typing import Any


def _refine_openai(title: str, content: str, user_message: str) -> dict[str, Any] | None:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        from openai import OpenAI
    except ImportError:
        return None

    model = (os.getenv("OPENAI_BRIEF_REFINE_MODEL") or "gpt-4o-mini").strip()
    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You help refine an AI lab project brief. "
                    "Return ONLY valid JSON with keys: new_title (string), new_content (string), "
                    "assistant_reply (string, Korean). "
                    "Merge the user's feedback into the brief. new_content must be the full updated body. "
                    "Preserve useful existing text unless the user asks to replace it."
                ),
            },
            {
                "role": "user",
                "content": f"현재 제목:\n{title}\n\n현재 본문:\n{content}\n\n사용자 보완 요청:\n{user_message}",
            },
        ],
        temperature=0.3,
    )
    raw = completion.choices[0].message.content
    if not raw:
        return None
    data = json.loads(raw)
    nt = str(data.get("new_title", title)).strip()[:500]
    nc = str(data.get("new_content", content))
    ar = str(data.get("assistant_reply", "반영했습니다.")).strip()
    if not nt or not nc:
        return None
    return {"ok": True, "title": nt, "content": nc, "assistant_reply": ar}


def refine_brief_from_user_message(
    title: str,
    content: str,
    user_message: str,
) -> dict[str, Any]:
    um = (user_message or "").strip()
    if not um:
        return {"ok": False, "error": "메시지가 비어 있습니다."}

    t = (title or "").strip()
    c = (content or "").strip()

    llm = _refine_openai(t, c, um)
    if llm and llm.get("ok"):
        return llm

    # --- 규칙 기반 ---

    # 제목: 한 줄
    m = re.match(r"^\s*제목\s*[:：]\s*(.+?)(?:\n|$)", um, re.S)
    if m:
        nt = m.group(1).strip().replace("\n", " ")[:500]
        if nt:
            return {
                "ok": True,
                "title": nt,
                "content": c,
                "assistant_reply": f"**제목**을 다음으로 반영했습니다.\n\n`{nt}`",
            }

    # 본문 전체 교체 (여러 줄)
    m = re.match(
        r"^\s*본문\s*[:：]\s*([\s\S]+)$",
        um,
    )
    if m:
        nc = m.group(1).strip()
        if nc:
            return {
                "ok": True,
                "title": t,
                "content": nc,
                "assistant_reply": "**본문** 전체를 요청하신 내용으로 바꿨습니다.",
            }

    m = re.match(
        r"^\s*(?:본문에\s*)?추가\s*[:：]\s*([\s\S]+)$",
        um,
    )
    if m:
        block = m.group(1).strip()
        if block:
            sep = "\n\n" if c else ""
            nc = f"{c}{sep}{block}"
            return {
                "ok": True,
                "title": t,
                "content": nc,
                "assistant_reply": "요청하신 문단을 **본문 끝**에 추가했습니다.",
            }

    m = re.match(
        r'^\s*제목\s*을\s*["「](.+?)["」]\s*(?:로|으로)\s*(?:바꿔|변경|해)',
        um,
    )
    if m:
        nt = m.group(1).strip()[:500]
        if nt:
            return {
                "ok": True,
                "title": nt,
                "content": c,
                "assistant_reply": f"**제목**을 「{nt}」(으)로 바꿨습니다.",
            }

    # 기본: 본문에 사용자 문장을 보완 블록으로 추가
    sep = "\n\n" if c else ""
    block = f"{sep}[보완·Chatbot 반영]\n{um}"
    nc = f"{c}{block}"
    return {
        "ok": True,
        "title": t,
        "content": nc,
        "assistant_reply": (
            "요청 내용을 **본문 끝**에 반영했습니다.\n\n"
            "- **제목만** 바꾸려면: `제목: 새 제목`\n"
            "- **본문을 통째로** 쓰려면: `본문:` 다음 줄부터 전체를 적어 주세요.\n"
            "- **한 문단만 덧붙이려면**: `추가:` 다음에 내용을 적어 주세요."
        ),
    }
