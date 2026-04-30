import { useCallback, useState } from "react";
import { apiJson } from "../api";

export default function ExperimentsPlatformPage() {
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const [compareIds, setCompareIds] = useState("");
  const [compareRows, setCompareRows] = useState(null);

  const [lineageId, setLineageId] = useState("");
  const [lineage, setLineage] = useState(null);

  const [regModelId, setRegModelId] = useState("");
  const [regStage, setRegStage] = useState("staging");

  const [tagModelId, setTagModelId] = useState("");

  const [sweepPayload, setSweepPayload] = useState(
    JSON.stringify(
      {
        filename: "sample.csv",
        target_column: "target",
        task: "classification",
        model_type: "random_forest",
        feature_columns: null,
        test_size: 0.2,
        random_state: 42,
      },
      null,
      2
    )
  );
  const [sweepGrid, setSweepGrid] = useState(
    JSON.stringify({ random_state: [42, 43], model_type: ["random_forest", "logistic_regression"] }, null, 2)
  );
  const [sweepResult, setSweepResult] = useState(null);

  const [llmName, setLlmName] = useState("데모 평가");
  const [llmPrompt, setLlmPrompt] = useState("v1");
  const [llmScores, setLlmScores] = useState('{"fluency": 0.85, "groundedness": 0.9}');

  const [lbKey, setLbKey] = useState("builtin_iris_binary");
  const [lbEntries, setLbEntries] = useState(null);
  const [lbNick, setLbNick] = useState("");
  const [lbMetric, setLbMetric] = useState(0.95);
  const [lbModelId, setLbModelId] = useState("");

  const [scoreModelId, setScoreModelId] = useState("");
  const [scoreRows, setScoreRows] = useState('[{"sepal length (cm)":5.1,"sepal width (cm)":3.5,"petal length (cm)":1.4,"petal width (cm)":0.2}]');

  const [benchmarks, setBenchmarks] = useState(null);

  const clearFeedback = () => {
    setErr(null);
    setMsg(null);
  };

  const loadBenchmarks = useCallback(async () => {
    try {
      const d = await apiJson("/api/ml/benchmarks");
      setBenchmarks(d.benchmarks || []);
    } catch (e) {
      setBenchmarks([]);
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      const d = await apiJson(
        `/api/ml/leaderboard?dataset_key=${encodeURIComponent(lbKey)}`
      );
      setLbEntries(d.entries || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [lbKey]);

  const runCompare = async () => {
    clearFeedback();
    try {
      const d = await apiJson(
        `/api/ml/compare?model_ids=${encodeURIComponent(compareIds)}`
      );
      setCompareRows(d.runs || []);
      setMsg("비교 결과를 불러왔습니다.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const runLineage = async () => {
    clearFeedback();
    try {
      const d = await apiJson(
        `/api/ml/lineage?model_id=${encodeURIComponent(lineageId)}`
      );
      setLineage(d.edges || []);
      setMsg("계보를 불러왔습니다.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const patchRegistry = async () => {
    clearFeedback();
    try {
      await apiJson(`/api/ml/models/${encodeURIComponent(regModelId)}/registry`, {
        method: "PATCH",
        body: JSON.stringify({ stage: regStage, note: "UI에서 변경" }),
      });
      setMsg("레지스트리 단계가 갱신되었습니다.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const tagBest = async () => {
    clearFeedback();
    try {
      await apiJson(`/api/ml/models/${encodeURIComponent(tagModelId)}/tag-best`, {
        method: "POST",
        body: JSON.stringify({ note: "best" }),
      });
      setMsg("최적 Run 으로 태그했습니다.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const runSweep = async () => {
    clearFeedback();
    try {
      const job_payload = JSON.parse(sweepPayload);
      const param_grid = JSON.parse(sweepGrid);
      const d = await apiJson("/api/ml/sweep", {
        method: "POST",
        body: JSON.stringify({
          job_payload,
          param_grid,
          max_runs: 16,
        }),
      });
      setSweepResult(d);
      setMsg(`스윕 제출: ${d.count}개 잡 (parent ${d.parent_sweep_id})`);
    } catch (e) {
      setErr(e.message);
    }
  };

  const submitLlm = async () => {
    clearFeedback();
    try {
      const judge_scores = JSON.parse(llmScores);
      await apiJson("/api/ml/llm-evaluation", {
        method: "POST",
        body: JSON.stringify({
          name: llmName,
          prompt_version: llmPrompt,
          eval_dataset_label: "demo",
          judge_scores,
        }),
      });
      setMsg("LLM 평가 로그를 저장했습니다.");
    } catch (e) {
      setErr(e.message);
    }
  };

  const submitLb = async () => {
    clearFeedback();
    try {
      await apiJson("/api/ml/leaderboard/submit", {
        method: "POST",
        body: JSON.stringify({
          dataset_key: lbKey,
          nickname: lbNick || "anon",
          metric_name: "accuracy",
          metric_value: lbMetric,
          model_id: lbModelId || null,
        }),
      });
      setMsg("리더보드에 제출했습니다.");
      await loadLeaderboard();
    } catch (e) {
      setErr(e.message);
    }
  };

  const runScore = async () => {
    clearFeedback();
    try {
      const rows = JSON.parse(scoreRows);
      const d = await apiJson(
        `/api/ml/models/${encodeURIComponent(scoreModelId)}/score`,
        {
          method: "POST",
          body: JSON.stringify({ rows }),
        }
      );
      setMsg(`예측 ${d.predictions?.length ?? 0}건: ${JSON.stringify(d.predictions)}`);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <section className="page experiments-platform">
      <h2>실험 플랫폼 (재현성·계보·스윕·레지스트리·LLM·리더보드)</h2>
      <p className="muted">
        MIT/Stanford류 실험 플랫폼 패턴을 반영: Run 메타(git·데이터 SHA·소요 시간), MLflow/W&B는
        환경변수 설정 시 자동 기록, 계보는 학습·예측 시 자동 적재됩니다.
      </p>
      {err && <div className="error-banner">{err}</div>}
      {msg && <div className="success-banner">{msg}</div>}

      <div className="card-grid">
        <article className="card">
          <h3>Run 비교</h3>
          <label>model_id 쉼표 구분</label>
          <input
            value={compareIds}
            onChange={(e) => setCompareIds(e.target.value)}
            placeholder="uuid1, uuid2"
            style={{ width: "100%" }}
          />
          <button type="button" onClick={runCompare}>
            비교
          </button>
          {compareRows && (
            <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 240 }}>
              {JSON.stringify(compareRows, null, 2)}
            </pre>
          )}
        </article>

        <article className="card">
          <h3>계보 (Lineage)</h3>
          <input
            value={lineageId}
            onChange={(e) => setLineageId(e.target.value)}
            placeholder="model_id"
          />
          <button type="button" onClick={runLineage}>
            조회
          </button>
          {lineage && (
            <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 240 }}>
              {JSON.stringify(lineage, null, 2)}
            </pre>
          )}
        </article>

        <article className="card">
          <h3>모델 레지스트리</h3>
          <input
            value={regModelId}
            onChange={(e) => setRegModelId(e.target.value)}
            placeholder="model_id"
          />
          <select value={regStage} onChange={(e) => setRegStage(e.target.value)}>
            <option value="none">none</option>
            <option value="candidate">candidate</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
            <option value="archived">archived</option>
          </select>
          <button type="button" onClick={patchRegistry}>
            단계 저장
          </button>
        </article>

        <article className="card">
          <h3>최적 Run 태그</h3>
          <input
            value={tagModelId}
            onChange={(e) => setTagModelId(e.target.value)}
            placeholder="model_id"
          />
          <button type="button" onClick={tagBest}>
            태그
          </button>
        </article>

        <article className="card">
          <h3>하이퍼파라미터 스윕 (잡 큐)</h3>
          <label>job_payload (JSON)</label>
          <textarea
            rows={8}
            value={sweepPayload}
            onChange={(e) => setSweepPayload(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          <label>param_grid (JSON)</label>
          <textarea
            rows={4}
            value={sweepGrid}
            onChange={(e) => setSweepGrid(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          <button type="button" onClick={runSweep}>
            스윕 제출
          </button>
          {sweepResult && (
            <pre style={{ fontSize: 12 }}>{JSON.stringify(sweepResult, null, 2)}</pre>
          )}
        </article>

        <article className="card">
          <h3>REST 배치 스코어</h3>
          <input
            value={scoreModelId}
            onChange={(e) => setScoreModelId(e.target.value)}
            placeholder="model_id"
            style={{ width: "100%" }}
          />
          <textarea
            rows={4}
            value={scoreRows}
            onChange={(e) => setScoreRows(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          <button type="button" onClick={runScore}>
            예측
          </button>
        </article>

        <article className="card">
          <h3>LLM / 에이전트 평가 로그</h3>
          <input value={llmName} onChange={(e) => setLlmName(e.target.value)} />
          <input
            value={llmPrompt}
            onChange={(e) => setLlmPrompt(e.target.value)}
            placeholder="prompt_version"
          />
          <textarea
            rows={3}
            value={llmScores}
            onChange={(e) => setLlmScores(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          <button type="button" onClick={submitLlm}>
            저장
          </button>
        </article>

        <article className="card">
          <h3>공개 벤치마크 리더보드</h3>
          <button type="button" onClick={loadBenchmarks}>
            벤치마크 목록
          </button>
          {benchmarks && (
            <pre style={{ fontSize: 11 }}>{JSON.stringify(benchmarks, null, 2)}</pre>
          )}
          <select value={lbKey} onChange={(e) => setLbKey(e.target.value)}>
            <option value="builtin_iris_binary">builtin_iris_binary</option>
          </select>
          <button type="button" onClick={loadLeaderboard}>
            순위 새로고침
          </button>
          {lbEntries && (
            <ul style={{ fontSize: 13 }}>
              {lbEntries.map((e, i) => (
                <li key={i}>
                  {e.nickname}: {e.metric_name}={e.metric_value?.toFixed?.(4) ?? e.metric_value}
                </li>
              ))}
            </ul>
          )}
          <input
            placeholder="닉네임"
            value={lbNick}
            onChange={(e) => setLbNick(e.target.value)}
          />
          <input
            type="number"
            step="0.0001"
            value={lbMetric}
            onChange={(e) => setLbMetric(parseFloat(e.target.value))}
          />
          <input
            placeholder="model_id (선택)"
            value={lbModelId}
            onChange={(e) => setLbModelId(e.target.value)}
          />
          <button type="button" onClick={submitLb}>
            제출
          </button>
        </article>
      </div>
    </section>
  );
}
