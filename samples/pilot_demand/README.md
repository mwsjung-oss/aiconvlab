# Pilot — 제품 구매 수요 예측 (엔드투엔드 데모)

가상의 **주간 단위** 판매 데이터로 수요 회귀 모델을 학습하고, **별도 스코어링 CSV**로 예측한 뒤 **Reports**까지 확인하는 절차입니다.

## 샘플 파일

| 파일 | 설명 |
|------|------|
| `pilot_demand_train.csv` | 학습용 80주. 타깃: `product_weekly_demand`. 특성: `week_idx`, `price_index`, `promo_depth`, `competitor_ad_spend`, `seasonal_factor` |
| `pilot_demand_scoring.csv` | 예측 전용 20주. **타깃 열 없음** (학습 시 사용한 특성 열만 동일) |

## 권장 절차 (UI)

1. **Projects**에서 `Pilot — 제품 구매 수요예측` 프로젝트(시드) 확인.
2. **데이터 업로드**에서 `pilot_demand_train.csv` 업로드 → 자동으로 **Datasets** 카탈로그에도 반영됩니다.
3. **미리보기**에서 데이터 확인.
4. **모델 학습**: 과제 **회귀**, 타깃 **`product_weekly_demand`**, 모델은 **Random Forest** 또는 **XGBoost** 등 선택 후 학습.
5. 학습 직후 **모델 학습** / **결과** 탭에서 **지표 해석 (자동 · Colab 스타일)** 문단과 산점도 확인.
6. **데이터 업로드**로 `pilot_demand_scoring.csv` 추가 업로드.
7. **예측**: 학습한 **모델 ID**와 **`pilot_demand_scoring.csv`** 선택 후 실행.
8. **Reports**: `pilot_demand_lab_report.md`가 **예측 결과 파일** 목록에 나타나며, **해석**·**원문 요약**에 학습·예측 누적 기록이 표시됩니다.

> `pilot_demand_lab_report.md`는 워크스페이스 `outputs`에 생성됩니다. 학습·예측 API가 파일명이 위 샘플명일 때만 섹션을 append합니다.

## 데이터 생성 스크립트

동일 분포로 CSV를 다시 만들려면:

```bash
python samples/pilot_demand/regenerate.py
```
