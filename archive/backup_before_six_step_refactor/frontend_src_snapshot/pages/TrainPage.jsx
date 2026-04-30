export default function TrainPage({
  datasets,
  selectedFile,
  setSelectedFile,
  preview,
  targetColumn,
  setTargetColumn,
  task,
  setTask,
  modelType,
  setModelType,
  modelOptions,
  featureSelection,
  setFeatureSelection,
  onTrain,
  onCancelTrain,
  trainElapsedSec = 0,
  loading,
  message,
  error,
  trainResult,
  plotUrl,
}) {
  const featureKeys = Object.keys(featureSelection);

  const mm = String(Math.floor(trainElapsedSec / 60)).padStart(2, "0");
  const ss = String(trainElapsedSec % 60).padStart(2, "0");

  const recommendedModel = {
    classification: "random_forest",
    regression: "random_forest",
    time_series: "tft",
    anomaly_detection: "isolation_forest",
  };

  const modelDescriptions = {
    classification: {
      logistic_regression:
        "선형 결정 경계에 가까운 분류에 적합합니다. 계수 해석이 쉽습니다.",
      random_forest:
        "범용 분류 기준선입니다. 범주형·비선형 패턴에 강합니다.",
      xgboost: "부스팅으로 정확도를 올리고 싶을 때 자주 쓰는 선택입니다.",
      gradient_boosting: "순차적으로 오차를 줄이는 부스팅 계열입니다.",
      extra_trees: "랜덤 분할이 더 강한 앙상블로, 분산이 큰 데이터에 유리할 수 있습니다.",
      hist_gradient_boosting:
        "대용량 수치 특성에 적합한 히스토그램 기반 그래디언트 부스팅입니다.",
      svc_rbf: "비선형 커널로 복잡한 경계를 표현합니다. 특성 스케일에 민감할 수 있습니다.",
    },
    regression: {
      linear_regression: "관계가 거의 선형일 때 단순하고 빠른 기준선입니다.",
      ridge: "L2 규제로 다중공선성이 있을 때 선형 모델을 안정화합니다.",
      lasso: "L1 규제로 불필요한 계수를 0에 가깝게 줄입니다.",
      elastic_net: "Ridge와 Lasso를 섞어 희소·안정성을 동시에 노립니다.",
      random_forest: "비선형·상호작용이 있는 회귀에 무난한 트리 앙상블입니다.",
      xgboost: "부스팅으로 잔차를 줄이며 정밀한 예측이 필요할 때 유용합니다.",
      gradient_boosting: "전통적인 그래디언트 부스팅 회귀입니다.",
      extra_trees: "무작위 분할이 강한 트리 앙상블로 분산이 큰 문제에 도움이 될 수 있습니다.",
      hist_gradient_boosting: "큰 표본의 수치 회귀에 효율적인 히스토그램 부스팅입니다.",
      svr_rbf: "RBF 커널로 비선형 회귀를 합니다. 스케일 정규화가 중요합니다.",
    },
    time_series: {
      tft: "시계열 전용 딥러닝(TFT). PyTorch Forecasting이 있을 때 고급 예측에 사용합니다.",
      linear_regression: "과거 값(지연)만으로 선형 예측하는 가벼운 기준선입니다.",
      ridge: "지연 특성에 L2 규제를 준 선형 시계열 기준선입니다.",
      lasso: "지연 특성 중 일부를 줄이고 싶을 때 쓸 수 있는 선형 모델입니다.",
      elastic_net: "지연 특성에 Ridge·Lasso 혼합 규제를 적용합니다.",
      random_forest: "지연 특성으로 비선형 패턴을 잡는 트리 기준선입니다.",
      xgboost: "지연 특성 부스팅으로 잔차를 줄입니다.",
      gradient_boosting: "지연 특성 그래디언트 부스팅 시계열 기준선입니다.",
      extra_trees: "지연 특성에 Extra Trees를 적용한 비선형 기준선입니다.",
      hist_gradient_boosting: "지연 특성 히스토그램 부스팅으로 빠른 대안입니다.",
      svr_rbf: "지연 특성에 RBF SVR을 쓰는 비선형 소규모 실험용입니다.",
    },
    anomaly_detection: {
      isolation_forest:
        "특성 공간에서 고립된 점을 이상으로 보는 비지도 학습입니다. 타깃 열은 메타용으로 두고 수치 특성을 선택하세요.",
    },
  };

  const currentModelDesc =
    modelDescriptions[task]?.[modelType] ?? "모델을 선택하면 간단한 설명이 표시됩니다.";

  return (
    <section className="panel">
      <h2>모델 학습 설정</h2>

      <div className="field">
        <label htmlFor="train-ds">1. 학습에 사용할 데이터셋</label>
        <select
          id="train-ds"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          <option value="">— CSV 선택 —</option>
          {datasets.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <p className="hint">
          데이터셋을 선택하면 열 목록이 자동으로 불러와지고, 숫자 열은 기본 입력 특성으로 선택됩니다.
        </p>
      </div>

      <div className="field">
        <label>2. 과제 유형</label>
        <div className="checkbox-row" style={{ flexWrap: "wrap", gap: "0.5rem 1rem" }}>
          <label>
            <input
              type="radio"
              name="task"
              checked={task === "classification"}
              onChange={() => setTask("classification")}
            />
            분류 (범주 예측)
          </label>
          <label>
            <input
              type="radio"
              name="task"
              checked={task === "regression"}
              onChange={() => setTask("regression")}
            />
            회귀 (연속값 예측)
          </label>
          <label>
            <input
              type="radio"
              name="task"
              checked={task === "time_series"}
              onChange={() => setTask("time_series")}
            />
            시계열 (순서 있는 값 예측)
          </label>
          <label>
            <input
              type="radio"
              name="task"
              checked={task === "anomaly_detection"}
              onChange={() => setTask("anomaly_detection")}
            />
            이상 탐지 (비지도)
          </label>
        </div>
        {task === "time_series" && (
          <p className="hint">
            타깃 열 하나에 시계열 값이 있어야 합니다. TFT는 PyTorch Forecasting 환경이 필요하며, 그 외 모델은 지연(lag) 특성 기준선입니다(최소 약 40행).
          </p>
        )}
        {task === "anomaly_detection" && (
          <p className="hint">
            타깃 열은 메타/라벨용으로 두고, 아래에서 이상 여부를 판단할 숫자 특성을 선택하세요. 학습에는 Isolation Forest만 사용됩니다.
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="target">3. 타깃 열 (예측할 값)</label>
        <select
          id="target"
          value={targetColumn}
          onChange={(e) => setTargetColumn(e.target.value)}
        >
          <option value="">— 선택 —</option>
          {(preview?.columns || []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>4. 입력 특성 (기본: 숫자 열 전체)</label>
        <div className="checkbox-row" style={{ marginTop: "0.35rem" }}>
          {featureKeys.length === 0 && (
            <span className="hint">
              데이터 미리보기를 먼저 불러오면 숫자 열이 자동 선택됩니다.
            </span>
          )}
          {featureKeys.map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={featureSelection[c]}
                onChange={(e) =>
                  setFeatureSelection((prev) => ({
                    ...prev,
                    [c]: e.target.checked,
                  }))
                }
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="model">5. 모델 선택 (권장 순서)</label>
        <select
          id="model"
          value={modelType}
          onChange={(e) => setModelType(e.target.value)}
        >
          {modelOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {recommendedModel[task] === o.value ? " ★ 추천" : ""}
            </option>
          ))}
        </select>
        <p className="hint">{currentModelDesc}</p>
      </div>

      <div
        className="train-run-actions"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.75rem",
          marginTop: "0.25rem",
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={onTrain}
          disabled={loading}
        >
          {loading ? "학습 중…" : "학습 실행"}
        </button>
        {loading && (
          <>
            <span className="hint" style={{ margin: 0 }}>
              경과 {mm}:{ss}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancelTrain}
            >
              중지
            </button>
          </>
        )}
      </div>
      {message && <div className="msg ok">{message}</div>}
      {error && <div className="msg error">{error}</div>}

      {trainResult && (
        <div style={{ marginTop: "1.25rem" }}>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>
            학습 결과 요약
          </h3>
          {trainResult.metrics_interpretation_ko && (
            <div className="metrics-interpretation">
              <h4 className="metrics-interpretation-title">지표 해석 (자동 · Colab 스타일)</h4>
              <div className="metrics-interpretation-body">
                {trainResult.metrics_interpretation_ko}
              </div>
            </div>
          )}
          <pre className="metrics-pre">
            {JSON.stringify(
              {
                metrics: trainResult.metrics,
                preprocessing: trainResult.preprocessing,
              },
              null,
              2
            )}
          </pre>
          {plotUrl && (
            <img
              className="plot-img"
              src={plotUrl}
              alt="학습 결과 차트"
            />
          )}
        </div>
      )}

      {!preview?.columns && (
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          먼저 ‘데이터 업로드’와 ‘미리보기’ 탭에서 CSV를 업로드하고, 표가 보이는지 확인해 주세요.
        </p>
      )}
    </section>
  );
}

