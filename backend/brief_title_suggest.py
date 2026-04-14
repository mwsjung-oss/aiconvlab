"""
업로드·붙여넣기 본문에서 프로젝트/논문 제목 후보 추출 (규칙 기반, LLM 없음).
"""
from __future__ import annotations

import re
from typing import Any, Literal

Confidence = Literal["high", "medium", "low"]

# 제목으로 부적절한 한 줄 (전부 기호·숫자만 등)
_TITLE_SKIP = re.compile(r"^[\d\s\-_/\\.:,;|()[\]{}#*]+$")


def _looks_like_title_line(s: str) -> bool:
    s = s.strip()
    if len(s) < 4 or len(s) > 220:
        return False
    if _TITLE_SKIP.match(s):
        return False
    # 한 줄이 너무 긴 문장(논문 초록 첫 문장) 배제: 마침표로 끝나고 매우 김
    if len(s) > 120 and s.endswith(".") and s.count(" ") > 15:
        return False
    letters = sum(1 for c in s if c.isalpha() or ("가" <= c <= "힣"))
    return letters >= 2


def suggest_title_from_content(content: str) -> dict[str, Any]:
    text = (content or "").strip()
    if not text:
        return {"ok": False, "error": "내용이 비어 있습니다."}

    lines: list[str] = []
    for ln in text.splitlines():
        t = ln.strip()
        if t:
            lines.append(t)
    if not lines:
        return {"ok": False, "error": "내용이 비어 있습니다."}

    head = "\n".join(lines[:80])

    # 명시 라벨 (고신뢰)
    for pat in (
        r"^(?:title|paper\s*title|article\s*title|manuscript\s*title)\s*[:：]\s*(.+)$",
        r"^(?:제목|논문\s*제목|연구\s*제목|과제\s*제목|프로젝트\s*제목)\s*[:：]\s*(.+)$",
    ):
        for line in lines[:40]:
            m = re.match(pat, line, re.I)
            if m:
                cand = m.group(1).strip().strip('"').strip("'")
                if 2 <= len(cand) <= 220:
                    return {"ok": True, "title": cand, "confidence": "high"}

    # Markdown H1
    if lines[0].startswith("#"):
        cand = lines[0].lstrip("#").strip()
        if 2 <= len(cand) <= 220:
            return {"ok": True, "title": cand, "confidence": "high"}

    # 논문: Title 줄 다음 Author, Abstract 구조 — 첫 줄이 짧은 편이면 제목
    for i, line in enumerate(lines[:25]):
        low = line.lower()
        if re.match(r"^abstract\s*$", low) and i > 0:
            cand = lines[i - 1].strip()
            if _looks_like_title_line(cand) and len(cand) < 180:
                return {"ok": True, "title": cand, "confidence": "medium"}

    # 첫 줄
    first = lines[0]
    if _looks_like_title_line(first):
        conf: Confidence = "medium" if len(first) <= 150 else "low"
        return {"ok": True, "title": first[:220], "confidence": conf}

    # 두 번째 줄 (표지에서 첫 줄이 학교명 등인 경우)
    if len(lines) >= 2 and not _looks_like_title_line(first) and _looks_like_title_line(lines[1]):
        return {"ok": True, "title": lines[1][:220], "confidence": "low"}

    # 마지막 수단: 앞부분에서 가장 짧은 ‘줄’ 후보
    for line in lines[:15]:
        if 8 <= len(line) <= 200 and _looks_like_title_line(line):
            return {"ok": True, "title": line[:220], "confidence": "low"}

    snippet = lines[0][:220] + ("…" if len(lines[0]) > 220 else "")
    return {"ok": True, "title": snippet, "confidence": "low"}
