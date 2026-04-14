"""AI 채팅: OpenAI 도구 호출 또는 로컬 슬래시/안전 키워드 처리."""
from __future__ import annotations

import json
import os
import re
from typing import Any

from models import User

from ai_chat_tools import OPENAI_TOOL_SPECS, execute_tool

SYSTEM_PROMPT_KO = """당신은 AILab(로컬 ML 실험 플랫폼)의 조수입니다.
사용자가 데이터 목록 확인, CSV 미리보기, 모델 학습·예측, 실험 이력·잡 조회, 프로젝트/논문 분석을 요청하면 반드시 제공된 함수(tool)를 호출하세요.
한국어로 간결하게 답하고, 수치·파일명은 정확히 인용하세요.
학습·예측은 사용자 워크스페이스의 CSV와 저장된 model_id만 사용할 수 있습니다.

[학습·예측 절차]
- 학습(train_model) 전에 가능하면 preview_dataset으로 열 이름·행 수·샘플을 확인하세요.
- task(regression/classification)나 model_type이 사용자 요청에서 불명확하면 추측하지 말고 짧게 질문하세요.
- 학습·예측을 처음 제안할 때는 train_model 또는 predict_batch를 dry_run=true로 한 번 호출해 계획을 검증한 뒤, 사용자가 실행을 동의하면 같은 인자로 dry_run=false(또는 생략)로 실제 호출하세요.
- 사용자가 즉시 실행을 명시하면(예: "바로 학습해") dry_run을 생략해도 됩니다.

[실험 플랫폼 도구 ml_*]
- ml_compare_runs, ml_get_lineage, ml_get_leaderboard, ml_list_benchmarks: 조회용이므로 필요 시 자유롭게 호출하세요.
- ml_set_registry_stage, ml_tag_best, ml_submit_sweep, ml_submit_leaderboard, ml_log_llm_evaluation: 사용자가 명시적으로 요청하거나 실행에 동의했다고 말한 경우에만 호출하세요.
- ml_submit_sweep은 여러 학습 잡을 큐에 넣어 시간·자원을 씁니다. 불필요한 반복 호출을 하지 마세요.
- 리더보드 dataset_key는 ml_list_benchmarks 결과의 키만 사용하세요(예: builtin_iris_binary)."""


def _run_openai_sdk_chat(
    messages: list[dict[str, str]],
    user: User,
    *,
    client: Any,
    model: str,
    mode: str,
) -> dict[str, Any]:
    """OpenAI Python SDK 호환 엔드포인트(OpenAI·Ollama /v1)."""
    try:
        api_messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT_KO}]
        for m in messages:
            role = m.get("role", "user")
            if role == "system":
                api_messages[0]["content"] += "\n\n[사용자 지시]\n" + (m.get("content") or "")
            elif role in ("user", "assistant"):
                api_messages.append({"role": role, "content": m.get("content", "")})

        tool_results_log: list[dict[str, Any]] = []
        max_rounds = 6
        for _ in range(max_rounds):
            completion = client.chat.completions.create(
                model=model,
                messages=api_messages,
                tools=OPENAI_TOOL_SPECS,
                tool_choice="auto",
            )
            choice = completion.choices[0].message
            if choice.tool_calls:
                api_messages.append(
                    {
                        "role": "assistant",
                        "content": choice.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments or "{}",
                                },
                            }
                            for tc in choice.tool_calls
                        ],
                    }
                )
                for tc in choice.tool_calls:
                    name = tc.function.name
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    result = execute_tool(name, user, args if isinstance(args, dict) else {})
                    tool_results_log.append({"name": name, "result": result})
                    api_messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": json.dumps(result, ensure_ascii=False)[:24000],
                        }
                    )
                continue
            text = (choice.content or "").strip()
            return {
                "ok": True,
                "mode": mode,
                "reply": text,
                "tool_results": tool_results_log,
            }

        return {
            "ok": True,
            "mode": mode,
            "reply": "도구 호출 반복 한도에 도달했습니다. 대화를 나눠서 다시 시도해 주세요.",
            "tool_results": tool_results_log,
        }
    except Exception as e:
        return {"ok": False, "reason": str(e), "mode": "error"}


def run_openai_chat(messages: list[dict[str, str]], user: User) -> dict[str, Any]:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return {"ok": False, "reason": "no_api_key", "mode": "error"}
    try:
        from openai import OpenAI
    except ImportError:
        return {"ok": False, "reason": "openai_not_installed", "mode": "error"}

    client = OpenAI(api_key=api_key)
    model = (os.getenv("OPENAI_CHAT_MODEL") or "gpt-4o-mini").strip()
    return _run_openai_sdk_chat(messages, user, client=client, model=model, mode="openai")


def run_ollama_chat(messages: list[dict[str, str]], user: User) -> dict[str, Any]:
    base = (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434/v1").strip()
    model = (os.getenv("OLLAMA_MODEL") or "llama3.2").strip()
    try:
        from openai import OpenAI
    except ImportError:
        return {"ok": False, "reason": "openai_not_installed", "mode": "error"}
    client = OpenAI(base_url=base, api_key="ollama")
    return _run_openai_sdk_chat(messages, user, client=client, model=model, mode="ollama")


def run_local_chat(messages: list[dict[str, str]], user: User) -> dict[str, Any]:
    """API 키 없을 때: 슬래시 명령 + 읽기 전용 자동 실행."""
    last = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last = (m.get("content") or "").strip()
            break
    if not last:
        return {
            "ok": True,
            "mode": "local",
            "reply": "메시지를 입력해 주세요.",
            "tool_results": [],
        }

    tool_results: list[dict[str, Any]] = []

    if last.startswith("/"):
        return _handle_slash(last, user)

    # 읽기 전용 자연어 (안전)
    low = last.lower()
    if re.search(r"(데이터셋|csv|파일).*(목록|리스트|보여|확인)|^목록", last, re.I) or low in (
        "datasets",
        "ls",
    ):
        r = execute_tool("list_datasets", user, {})
        tool_results.append({"name": "list_datasets", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": f"CSV 파일 {r.get('count', 0)}개: {', '.join(r.get('files') or [])}",
            "tool_results": tool_results,
        }
    if re.search(r"모델.*(목록|리스트|확인)|저장.*모델", last, re.I):
        r = execute_tool("list_models", user, {})
        tool_results.append({"name": "list_models", "result": r})
        mids = [m.get("model_id") for m in (r.get("models") or [])[:20]]
        return {
            "ok": True,
            "mode": "local",
            "reply": f"저장 모델 {r.get('count', 0)}개: {', '.join(str(x) for x in mids if x)}",
            "tool_results": tool_results,
        }
    if re.search(r"이력|history|실험.*기록", last, re.I):
        r = execute_tool("history_summary", user, {})
        tool_results.append({"name": "history_summary", "result": r})
        n = len(r.get("items") or [])
        return {
            "ok": True,
            "mode": "local",
            "reply": f"최근 이력 {n}건을 조회했습니다. 아래 JSON을 확인하세요.",
            "tool_results": tool_results,
        }
    if re.search(r"잡|job|작업.*목록", last, re.I):
        r = execute_tool("list_jobs", user, {})
        tool_results.append({"name": "list_jobs", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": f"잡 {r.get('count', 0)}건을 조회했습니다.",
            "tool_results": tool_results,
        }
    if re.search(r"벤치마크.*(목록|키)|dataset_key", last, re.I):
        r = execute_tool("ml_list_benchmarks", user, {})
        tool_results.append({"name": "ml_list_benchmarks", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False)[:8000],
            "tool_results": tool_results,
        }

    return {
        "ok": True,
        "mode": "local",
        "reply": _local_help_message(),
        "tool_results": [],
    }


def _handle_slash(line: str, user: User) -> dict[str, Any]:
    tool_results: list[dict[str, Any]] = []
    parts = line.split()
    cmd = (parts[0] if parts else "").lower()

    if cmd in ("/help", "/도움", "/명령"):
        return {
            "ok": True,
            "mode": "local",
            "reply": _local_help_message(),
            "tool_results": [],
        }

    if cmd == "/datasets":
        r = execute_tool("list_datasets", user, {})
        tool_results.append({"name": "list_datasets", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2),
            "tool_results": tool_results,
        }

    if cmd == "/models":
        r = execute_tool("list_models", user, {})
        tool_results.append({"name": "list_models", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2),
            "tool_results": tool_results,
        }

    if cmd == "/history":
        r = execute_tool("history_summary", user, {})
        tool_results.append({"name": "history_summary", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    if cmd == "/jobs":
        r = execute_tool("list_jobs", user, {})
        tool_results.append({"name": "list_jobs", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    if cmd == "/preview" and len(parts) >= 2:
        fn = parts[1]
        rows = int(parts[2]) if len(parts) >= 3 and parts[2].isdigit() else 5
        r = execute_tool("preview_dataset", user, {"filename": fn, "rows": rows})
        tool_results.append({"name": "preview_dataset", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    # /train filename target task model_type [dry]
    if cmd == "/train" and len(parts) >= 5:
        dry = len(parts) >= 6 and parts[-1].lower() == "dry"
        end = -1 if dry else None
        body = parts[1:end]
        if len(body) >= 4:
            r = execute_tool(
                "train_model",
                user,
                {
                    "filename": body[0],
                    "target_column": body[1],
                    "task": body[2],
                    "model_type": body[3],
                    "dry_run": dry,
                },
            )
            tool_results.append({"name": "train_model", "result": r})
            return {
                "ok": True,
                "mode": "local",
                "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
                "tool_results": tool_results,
            }

    # /predict model_id filename [dry]
    if cmd == "/predict" and len(parts) >= 3:
        dry = len(parts) >= 4 and parts[-1].lower() == "dry"
        end = -1 if dry else None
        body = parts[1:end]
        if len(body) >= 2:
            r = execute_tool(
                "predict_batch",
                user,
                {
                    "model_id": body[0],
                    "filename": body[1],
                    "dry_run": dry,
                },
            )
            tool_results.append({"name": "predict_batch", "result": r})
            return {
                "ok": True,
                "mode": "local",
                "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
                "tool_results": tool_results,
            }

    if cmd in ("/ml_bench", "/mlbench"):
        r = execute_tool("ml_list_benchmarks", user, {})
        tool_results.append({"name": "ml_list_benchmarks", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    if cmd == "/ml_compare" and len(parts) >= 2:
        r = execute_tool(
            "ml_compare_runs", user, {"model_ids": parts[1]}
        )
        tool_results.append({"name": "ml_compare_runs", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    if cmd == "/ml_lineage" and len(parts) >= 2:
        r = execute_tool(
            "ml_get_lineage", user, {"model_id": parts[1]}
        )
        tool_results.append({"name": "ml_get_lineage", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    if cmd == "/ml_lb" and len(parts) >= 2:
        r = execute_tool(
            "ml_get_leaderboard", user, {"dataset_key": parts[1]}
        )
        tool_results.append({"name": "ml_get_leaderboard", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    # /analyze project|paper 제목 본문은_띄어쓰기로_이어쓰기
    if cmd == "/analyze" and len(parts) >= 4:
        st = parts[1] if parts[1] in ("project", "paper") else "project"
        title = parts[2]
        content = " ".join(parts[3:]).strip() or title
        r = execute_tool(
            "project_analyze",
            user,
            {"title": title, "content": content, "source_type": st},
        )
        tool_results.append({"name": "project_analyze", "result": r})
        return {
            "ok": True,
            "mode": "local",
            "reply": json.dumps(r, ensure_ascii=False, indent=2)[:15000],
            "tool_results": tool_results,
        }

    return {
        "ok": True,
        "mode": "local",
        "reply": f"알 수 없는 명령입니다. {_local_help_message()}",
        "tool_results": [],
    }


def _local_help_message() -> str:
    return """**로컬 모드 도움말** (OpenAI API 키가 없을 때)
- 자연어: 「데이터셋 목록」「모델 목록」「이력」「잡」 등으로 읽기 전용 조회
- 슬래시:
  - `/datasets` `/models` `/history` `/jobs`
  - `/preview 파일.csv [행수]`
  - `/train 파일.csv 타깃열 regression|classification 모델종류` (끝에 `dry`를 붙이면 검증만)
  - `/predict 모델UUID 스코어파일.csv` (끝에 `dry`를 붙이면 검증만)
  - `/analyze project 제목 내용...` 또는 `/analyze paper 제목 초록...`
  - `/ml_bench` — 벤치마크 키 목록
  - `/ml_compare uuid1,uuid2,...` — Run 비교
  - `/ml_lineage 모델uuid` — 계보
  - `/ml_lb dataset_key` — 리더보드 조회(예: builtin_iris_binary)
  - `/help`

**자연어로 학습·예측까지 하려면** 서버에 `OPENAI_API_KEY`를 설정하세요. (환경변수)
"""


def run_chat(
    messages: list[dict[str, str]],
    user: User,
    *,
    prefer_openai: bool | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """provider: openai | gemini | ollama | local. prefer_openai=False → local (구 API 호환)."""
    if provider:
        p = provider.strip().lower()
    elif prefer_openai is False:
        p = "local"
    else:
        p = "openai"

    if p == "local":
        return run_local_chat(messages, user)
    if p == "openai":
        return run_openai_chat(messages, user)
    if p == "ollama":
        return run_ollama_chat(messages, user)
    if p == "gemini":
        from ai_chat_gemini import run_gemini_chat

        return run_gemini_chat(messages, user, system_prompt=SYSTEM_PROMPT_KO)

    return run_local_chat(messages, user)
