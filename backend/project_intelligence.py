"""
프로젝트 개요 또는 논문 Title+Abstract 를 분석해 과제 유형·데이터·모델·주의사항을 제안합니다.
외부 LLM API 없이 키워드·규칙 기반(교육용 로컬 환경에 적합).
"""
from __future__ import annotations

from typing import Any

# (키워드 목록, 힌트)
_TASK_RULES: list[tuple[list[str], dict[str, Any]]] = [
    (
        ["시계열", "예측", "forecast", "arima", "lstm", "tft", "계절", "트렌드"],
        {"tasks": ["time_series"], "models": ["tft", "random_forest"], "domain_hint": "시계열/예측"},
    ),
    (
        ["이상", "anomaly", "불량 탐지", "outlier", "침입", "fault"],
        {"tasks": ["anomaly_detection"], "models": ["random_forest", "xgboost"], "domain_hint": "이상탐지"},
    ),
    (
        ["이미지", "cnn", "vision", "segmentation", "yolo", "객체"],
        {"tasks": ["classification"], "models": ["random_forest"], "domain_hint": "비전", "note": "이 플랫폼은 주로 표형 CSV 학습을 지원합니다. 이미지 특성은 임베딩·요약 후 표로 만드는 전처리가 필요할 수 있습니다."},
    ),
    (
        ["텍스트", "nlp", "bert", "llm", "문서", "감성"],
        {"tasks": ["classification"], "models": ["logistic_regression", "random_forest"], "domain_hint": "텍스트", "note": "텍스트는 수치/TF-IDF 피처로 변환한 CSV에서 분류·회귀를 수행하는 흐름을 권장합니다."},
    ),
    (
        ["분류", "classification", "클래스", "불량/정상", "이진"],
        {"tasks": ["classification"], "models": ["random_forest", "logistic_regression", "xgboost"]},
    ),
    (
        ["회귀", "regression", "수요", "가격", "연속"],
        {"tasks": ["regression"], "models": ["random_forest", "xgboost", "linear_regression"]},
    ),
    (
        ["금속", "metal", "제조", "공정", "센서", "열연", "압연"],
        {"tasks": ["regression", "classification"], "models": ["random_forest", "xgboost"], "domain_hint": "제조/메탈"},
    ),
    (
        ["수요", "demand", "재고", "sku", "판매"],
        {"tasks": ["regression", "time_series"], "models": ["random_forest", "tft", "linear_regression"], "domain_hint": "수요예측"},
    ),
    (
        ["추천", "recommendation", "협업 필터"],
        {"tasks": ["regression"], "models": ["random_forest"], "domain_hint": "추천", "note": "협업 필터·임베딩 결과를 표 형태로 정리하면 본 플랫폼에서 회귀·분류 실험이 가능합니다."},
    ),
]

_DATASET_TEMPLATES: list[tuple[list[str], list[dict[str, str]]]] = [
    (
        ["시계열", "예측", "forecast", "주간", "일별"],
        [
            {
                "name": "시계열 패널 CSV",
                "role": "학습·검증",
                "schema_hint": "시간 인덱스(또는 year_week), 엔티티 ID, 타깃, 외생 변수(환율·휴일 등)",
                "notes": "시간 순서 유지, 검증 구간은 미래 구간을 사용하세요.",
            }
        ],
    ),
    (
        ["이상", "anomaly", "불량"],
        [
            {
                "name": "정상/비정상 라벨 + 공정 변수",
                "role": "학습",
                "schema_hint": "라벨 열, 센서·공정 수치형 피처",
                "notes": "클래스 불균형 시 샘플링·가중치를 검토하세요.",
            }
        ],
    ),
    (
        ["이미지", "vision", "cnn"],
        [
            {
                "name": "이미지 메타·임베딩 CSV",
                "role": "학습",
                "schema_hint": "파일 ID, 추출한 벡터 또는 요약 지표, 라벨",
                "notes": "원시 픽셀 대신 전처리된 표 형태를 업로드하세요.",
            }
        ],
    ),
    (
        ["텍스트", "nlp", "문서"],
        [
            {
                "name": "문서 단위 특성 CSV",
                "role": "학습",
                "schema_hint": "문서 ID, TF-IDF 차원 또는 요약 점수, 타깃",
                "notes": "개인정보·저작권이 없는 데이터만 사용하세요.",
            }
        ],
    ),
]

_DEFAULT_DATASETS = [
    {
        "name": "정형 표 데이터 (CSV)",
        "role": "학습·검증",
        "schema_hint": "타깃 열, 설명 변수(숫자/범주), 결측 처리 전략",
        "notes": "최소 수백 행 이상을 권장합니다.",
    },
    {
        "name": "홀드아웃/스코어링용 동일 스키마 CSV",
        "role": "추론·리포트",
        "schema_hint": "학습과 동일한 열 구성(타깃 없을 수 있음)",
        "notes": "데이터 누수 방지: 테스트는 시간·그룹 기준으로 분리하세요.",
    },
]


def _normalize_text(title: str, body: str) -> str:
    t = f"{title or ''}\n{body or ''}"
    return t.lower()


def _dedupe_preserve(seq: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def evaluate_lab_requirements(title: str, content: str) -> dict[str, Any]:
    """
    AI 실습 프로젝트 브리프가 과제 정의에 필요한 요소를 갖추었는지 규칙 기반 점검.
    (목표·데이터·방법/모델·평가 지표 등)
    """
    t = (title or "").strip()
    body = (content or "").strip()
    combined = f"{t}\n{body}".lower()

    def has_any(kws: list[str]) -> bool:
        return any(kw.lower() in combined for kw in kws)

    dims = {
        "goal_problem": has_any(
            [
                "목표",
                "문제",
                "가설",
                "해결",
                "연구",
                "과제",
                "배경",
                "objective",
                "goal",
                "problem",
                "hypothesis",
            ]
        ),
        "data": has_any(
            [
                "데이터",
                "csv",
                "변수",
                "피처",
                "특성",
                "샘플",
                "레코드",
                "dataset",
                "data",
                "feature",
                "column",
                "표",
            ]
        ),
        "method_model": has_any(
            [
                "모델",
                "알고리즘",
                "학습",
                "방법",
                "분류",
                "회귀",
                "예측",
                "model",
                "train",
                "classification",
                "regression",
                "random forest",
                "xgboost",
                "neural",
            ]
        ),
        "evaluation": has_any(
            [
                "평가",
                "지표",
                "metric",
                "accuracy",
                "f1",
                "rmse",
                "mae",
                "검증",
                "validation",
                "성능",
            ]
        ),
    }

    score = sum(1 for v in dims.values() if v)
    gaps: list[str] = []
    if not dims["goal_problem"]:
        gaps.append("연구·실습 **목표**와 풀고자 하는 **문제 정의**를 한두 문장으로 명시하세요.")
    if not dims["data"]:
        gaps.append("사용할 **데이터**의 출처·형식(CSV 등)·주요 **변수(타깃 후보 포함)** 를 적어 주세요.")
    if not dims["method_model"]:
        gaps.append("시도할 **모델·방법**(예: 분류/회귀, 베이스라인 모델)을 언급하면 실습 설계가 분명해집니다.")
    if not dims["evaluation"]:
        gaps.append("**성공 기준**(평가 지표·검증 방법)을 적으면 과제 완료 여부를 판단하기 쉽습니다.")

    if len(body) < 80:
        gaps.append("본문이 짧습니다. 배경·제약·기대 결과를 조금 더 구체적으로 써 주세요.")

    meets_requirements = score >= 3 and len(body) >= 80

    summary_parts: list[str] = []
    summary_parts.append(
        f"요건 충족도: {score}/4 영역에서 관련 키워드가 확인되었습니다."
        + (" (실습 제출용으로는 보완이 권장됩니다.)" if not meets_requirements else "")
    )
    if dims["goal_problem"]:
        summary_parts.append("목표·문제 영역은 어느 정도 서술되어 있습니다.")
    if dims["data"]:
        summary_parts.append("데이터 관련 언급이 있습니다.")
    if dims["method_model"]:
        summary_parts.append("모델·방법 관련 언급이 있습니다.")
    if dims["evaluation"]:
        summary_parts.append("평가·검증 관련 언급이 있습니다.")

    summary_short = " ".join(summary_parts)

    return {
        "meets_requirements": meets_requirements,
        "dimension_score": score,
        "dimensions": dims,
        "gaps": gaps,
        "summary_short": summary_short,
    }


def analyze_brief(
    *,
    source_type: str,
    title: str,
    content: str,
) -> dict[str, Any]:
    """
    source_type: 'project' | 'paper'
    """
    title = (title or "").strip()
    content = (content or "").strip()
    text = _normalize_text(title, content)
    if len(text) < 3:
        return {
            "ok": False,
            "error": "제목과 내용을 조금 더 입력해 주세요.",
        }

    tasks: list[str] = []
    models: list[str] = []
    domain_hints: list[str] = []
    extra_notes: list[str] = []

    for kws, hint in _TASK_RULES:
        if any(kw.lower() in text for kw in kws):
            tasks.extend(hint.get("tasks", []))
            models.extend(hint.get("models", []))
            if hint.get("domain_hint"):
                domain_hints.append(hint["domain_hint"])
            if hint.get("note"):
                extra_notes.append(hint["note"])

    tasks = _dedupe_preserve(tasks)
    models = _dedupe_preserve(models)
    if not tasks:
        tasks = ["regression", "classification"]
    if not models:
        models = ["random_forest", "xgboost", "logistic_regression"]

    datasets: list[dict[str, str]] = []
    for kws, blocks in _DATASET_TEMPLATES:
        if any(kw.lower() in text for kw in kws):
            datasets.extend(blocks)
    if not datasets:
        datasets = list(_DEFAULT_DATASETS)

    considerations: list[str] = [
        "학습/검증 분할 시 시계열·그룹(제품·라인) 누수가 없는지 확인하세요.",
        "범주형 변수는 원-핫 인코딩, 결측은 도메인에 맞는 대치 전략을 선택하세요.",
        "지표는 과제에 맞게 선택하세요(분류: 정밀도/재현율/F1, 회귀: RMSE/MAE/R²).",
    ]
    if "time_series" in tasks or "시계열" in text:
        considerations.append("시계열은 미래 구간 검증·환율·휴일 등 외생 변수를 명시적으로 포함하는 것이 좋습니다.")
    if "anomaly_detection" in tasks:
        considerations.append("불량 샘플이 매우 적으면 단일 클래스 학습·one-class, 또는 이상치 점수 임계값 튜닝이 필요합니다.")
    if source_type == "paper":
        considerations.append("논문 재현: 데이터 출처·전처리·시드·코드 버전을 실험 Run 메타에 남기세요.")
    if source_type == "project":
        considerations.append("프로젝트 일정: 베이스라인 모델부터 확립한 뒤 복잡 모델로 확장하는 것을 권장합니다.")

    considerations.extend(extra_notes)
    considerations = _dedupe_preserve(considerations)

    # 간단 키워드 매칭 로그
    matched: list[str] = []
    for kws, _ in _TASK_RULES:
        for kw in kws:
            if kw.lower() in text and kw not in matched:
                matched.append(kw)

    summary_lines = [
        f"추정 과제: {', '.join(tasks)}",
        f"추천 모델(플랫폼 지원): {', '.join(models[:5])}",
    ]
    if domain_hints:
        summary_lines.append(f"도메인 힌트: {', '.join(_dedupe_preserve(domain_hints))}")

    description_rich = "\n\n".join(
        [
            "[자동 분석 요약]",
            "\n".join(summary_lines),
            "",
            "[데이터셋 제안]",
            *[f"- {d['name']}: {d.get('notes', '')}" for d in datasets[:4]],
            "",
            "[수행 시 고려사항]",
            *[f"- {c}" for c in considerations[:8]],
        ]
    )

    lab_req = evaluate_lab_requirements(title, content)

    return {
        "ok": True,
        "source_type": source_type,
        "title": title,
        "inferred_tasks": tasks,
        "recommended_models": [{"model_type": m, "rationale": "키워드·과제 유형 기반"} for m in models[:6]],
        "recommended_datasets": datasets[:6],
        "considerations": considerations,
        "keywords_matched": matched[:20],
        "description_suggestion": description_rich,
        "lab_requirements": lab_req,
    }


def build_data_prep_guide(
    *,
    source_type: str = "project",
    title: str,
    content: str,
    cached_analysis: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    등록·분석된 프로젝트 브리프를 바탕으로, 실습 수행에 필요한 데이터 요건·준비 절차를 정리합니다.
    """
    if cached_analysis and cached_analysis.get("ok"):
        analysis: dict[str, Any] = dict(cached_analysis)
    else:
        analysis = analyze_brief(source_type=source_type, title=title, content=content)
    if not analysis.get("ok"):
        return {"ok": False, "error": analysis.get("error", "분석 실패")}

    tasks = list(analysis.get("inferred_tasks") or [])
    datasets = list(analysis.get("recommended_datasets") or [])
    models = list(analysis.get("recommended_models") or [])
    considerations = list(analysis.get("considerations") or [])
    lr = analysis.get("lab_requirements") or {}
    gaps = list(lr.get("gaps") or [])

    text_l = _normalize_text(title, content)

    intro = (
        f"「{(title or '').strip()[:120]}」 과제를 이 플랫폼에서 수행하려면 **정형 CSV** 중심으로 데이터를 준비하는 것이 좋습니다. "
        f"추정 과제 유형은 **{', '.join(tasks[:6]) or '일반'}** 입니다."
    )

    fmt_items = [
        "파일 형식: **CSV**(UTF-8 권장). 엑셀은 업로드 전 CSV로 저장하세요.",
        "최소 규모: 분류·회귀는 가능하면 **수백 행 이상**(클래스당 충분한 표본). 시계열은 **시간 순서**가 맞는지 확인.",
        "열 이름: 한글·영문 혼용 가능하나 **중복 열 이름·공백만 있는 열**은 피하세요.",
        "타깃(레이블) 열: 과제에 맞는 **예측 대상 열**을 하나 정하고, 학습 시 그 열을 지정할 수 있어야 합니다.",
        "식별자(ID)·그룹 열: 시계열·패널·제품 단위가 있으면 **엔티티 ID 열**을 남겨 두면 검증 분할에 유리합니다.",
    ]

    if "time_series" in tasks or "시계열" in text_l or "forecast" in text_l:
        fmt_items.append(
            "시계열: **시간 인덱스**(날짜·주차 등) 열과 **타깃**, 필요 시 **외생 변수**(휴일·환율 등) 열을 분리해 두세요."
        )
    if "anomaly_detection" in tasks or "이상" in text_l:
        fmt_items.append(
            "이상탐지: **정상/비정상 라벨**이 있으면 지도 학습, 없으면 **공정 변수** 위주의 점수·임계값 전략을 고려하세요."
        )

    schema_items: list[str] = []
    for d in datasets[:5]:
        name = d.get("name", "데이터셋")
        role = d.get("role", "")
        hint = d.get("schema_hint", "")
        note = d.get("notes", "")
        line = f"**{name}** ({role}): 스키마 — {hint}"
        if note:
            line += f" · 참고: {note}"
        schema_items.append(line)
    if not schema_items:
        schema_items.append(
            "브리프만으로는 구체 스키마가 불명확합니다. **타깃 후보 열**과 **설명 변수**를 열거한 샘플 CSV를 먼저 만드세요."
        )

    quality_items = [
        "결측·이상값: 학습 전 **결측 비율**이 높은 열은 제거·대치 전략을 정합니다.",
        "검증 분할: **시계열은 미래 구간**, 그룹(제품·라인) 단위 누수가 없도록 **train/valid**를 나눕니다.",
        "클래스 불균형: 분류에서 한쪽 클래스가 매우 적으면 **가중치·샘플링**을 검토합니다.",
    ]
    quality_items.extend([c for c in considerations[:5] if c not in quality_items])

    next_steps = [
        "워크스페이스에 CSV **업로드** 후 **데이터 미리보기**로 열 타입·결측을 확인합니다.",
        "**학습** 단계에서 타깃 열·과제 유형(분류/회귀)·모델을 선택하고, 먼저 **dry_run**으로 설정을 검증합니다.",
        "실험 Run·지표를 남기고, 필요하면 Chatbot으로 **다음 실험**을 질문합니다.",
    ]

    checklist: list[str] = [
        "CSV 한 개 이상 준비(학습용; 검증·스코어링용은 동일 스키마 권장)",
        "타깃(예측) 열과 그 의미가 문서/브리프와 일치하는지 확인",
        "시계열·그룹 ID가 있으면 열로 포함",
        "개인정보·내부 비밀 데이터는 제거·비식별 후 업로드",
    ]
    checklist.extend([f"브리프 보완 권장: {g}" for g in gaps[:4]])

    sections: list[dict[str, Any]] = [
        {"heading": "데이터 파일·형식 요건", "items": fmt_items},
        {"heading": "과제에 맞는 데이터 스키마(참고)", "items": schema_items},
        {"heading": "품질·검증", "items": _dedupe_preserve(quality_items)[:12]},
        {"heading": "플랫폼에서의 다음 단계", "items": next_steps},
    ]

    model_hint = ", ".join(
        m.get("model_type", "") for m in models[:5] if isinstance(m, dict) and m.get("model_type")
    )

    return {
        "ok": True,
        "intro": intro,
        "sections": sections,
        "checklist": checklist[:14],
        "model_hint": model_hint or None,
        "inferred_tasks": tasks,
    }


def build_intelligence_json(analysis: dict[str, Any]) -> str:
    import json

    return json.dumps(analysis, ensure_ascii=False, indent=2)
