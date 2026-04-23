/**
 * RightAnalysisSidebar
 *
 * Inspector/analysis companion:
 *   - Summary
 *   - Visualization (stub; surfaces numeric fields if present)
 *   - AI Interpretation (textual explanation from last agent output)
 *   - Comparison (cell-by-cell digest)
 *   - Export (stub actions)
 */
import { formatRelative } from "./useExperimentV2State.js";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "viz", label: "Viz" },
  { id: "interp", label: "AI Insight" },
  { id: "compare", label: "Compare" },
  { id: "export", label: "Export" },
];

export default function RightAnalysisSidebar({
  state,
  collapsed,
  onToggleCollapse,
  onChangeTab,
  onExport,
}) {
  if (collapsed) {
    return (
      <aside
        className="expv2-right expv2-right--collapsed"
        aria-label="분석 사이드바 (접힘)"
      >
        <div className="expv2-right__head">
          <button
            type="button"
            className="expv2-btn expv2-btn--icon"
            onClick={onToggleCollapse}
            title="분석 패널 펼치기"
            aria-label="분석 패널 펼치기"
          >
            ◂
          </button>
        </div>
      </aside>
    );
  }

  const tab = state.rightPanelTab || "summary";

  return (
    <aside className="expv2-right" aria-label="분석 사이드바">
      <header className="expv2-right__head">
        <span className="expv2-right__title">Inspector</span>
        <button
          type="button"
          className="expv2-btn expv2-btn--icon expv2-btn--ghost"
          onClick={onToggleCollapse}
          title="분석 패널 접기"
          aria-label="분석 패널 접기"
        >
          ▸
        </button>
      </header>

      <nav className="expv2-right__tabs" aria-label="분석 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={
              tab === t.id
                ? "expv2-right__tab expv2-right__tab--active"
                : "expv2-right__tab"
            }
            onClick={() => onChangeTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="expv2-right__body">
        {tab === "summary" && <SummaryBody state={state} />}
        {tab === "viz" && <VisualizationBody state={state} />}
        {tab === "interp" && <InterpretationBody state={state} />}
        {tab === "compare" && <ComparisonBody state={state} />}
        {tab === "export" && <ExportBody state={state} onExport={onExport} />}
      </div>
    </aside>
  );
}

function SummaryBody({ state }) {
  const done = state.cells.filter((c) => c.status === "complete").length;
  const running = state.cells.filter((c) => c.status === "running").length;
  const errored = state.cells.filter((c) => c.status === "error").length;
  const summary = state.resultSummary;
  return (
    <>
      <section className="expv2-section">
        <div className="expv2-section__head">노트북 상태</div>
        <div className="expv2-section__body">
          <div className="expv2-metrics">
            <div className="expv2-metric">
              <div className="expv2-metric__label">Cells</div>
              <div className="expv2-metric__value">{state.cells.length}</div>
            </div>
            <div className="expv2-metric">
              <div className="expv2-metric__label">완료</div>
              <div className="expv2-metric__value">{done}</div>
            </div>
            <div className="expv2-metric">
              <div className="expv2-metric__label">실행 중</div>
              <div className="expv2-metric__value">{running}</div>
            </div>
            <div className="expv2-metric">
              <div className="expv2-metric__label">실패</div>
              <div className="expv2-metric__value">{errored}</div>
            </div>
          </div>
          <dl className="expv2-kv" style={{ marginTop: 8 }}>
            <dt>제목</dt>
            <dd>{state.notebookTitle}</dd>
            <dt>Agent</dt>
            <dd>{state.agent}</dd>
            <dt>Provider</dt>
            <dd>{state.provider}</dd>
            <dt>RAG</dt>
            <dd>{state.useRag ? "on" : "off"}</dd>
            <dt>Saved</dt>
            <dd>{state.savedAt ? formatRelative(state.savedAt) : "—"}</dd>
          </dl>
        </div>
      </section>

      <section className="expv2-section">
        <div className="expv2-section__head">최근 결과 요약</div>
        <div className="expv2-section__body">
          {!summary ? (
            <div className="expv2-empty">
              아직 결과가 없습니다. 프롬프트 셀을 실행해 보세요.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                {summary.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--subt)" }}>
                {typeof summary.summary === "string"
                  ? summary.summary
                  : "(구조화 결과)"}
              </div>
              {summary.meta?.provider ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--dim)",
                    marginTop: 4,
                  }}
                >
                  {summary.meta.provider}
                  {summary.meta.model ? ` · ${summary.meta.model}` : ""}
                  {summary.meta.elapsed_ms
                    ? ` · ${Math.round(summary.meta.elapsed_ms)}ms`
                    : ""}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}

function VisualizationBody({ state }) {
  const summary = state.resultSummary;
  const raw = summary?.raw;
  const numericKeys = collectNumeric(raw);

  return (
    <section className="expv2-section">
      <div className="expv2-section__head">Visualization</div>
      <div className="expv2-section__body">
        {!raw ? (
          <div className="expv2-empty">
            수치 기반 구조화 결과가 아직 없습니다. Run & Evaluate 프롬프트 이후에
            표시됩니다.
          </div>
        ) : numericKeys.length === 0 ? (
          <div className="expv2-empty">
            표시할 수치 지표가 없습니다. (예: accuracy, f1_score)
          </div>
        ) : (
          <MiniBarList items={numericKeys} />
        )}
      </div>
    </section>
  );
}

function MiniBarList({ items }) {
  const max = Math.max(...items.map((i) => Math.abs(Number(i.value) || 0)), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11.5,
              color: "var(--subt)",
            }}
          >
            <span>{it.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtNumber(it.value)}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--muted)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (Math.abs(Number(it.value) || 0) / max) * 100)}%`,
                height: "100%",
                background: "var(--primary)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function InterpretationBody({ state }) {
  const summary = state.resultSummary;
  const raw = summary?.raw;
  const narrative =
    raw?.executive_summary ||
    raw?.dataset_summary ||
    raw?.orchestration_notes ||
    (typeof summary?.summary === "string" ? summary.summary : "");
  const findings = raw?.key_findings || raw?.recommendations || raw?.recommended_preprocessing;
  const limitations = raw?.limitations;
  return (
    <section className="expv2-section">
      <div className="expv2-section__head">AI Interpretation</div>
      <div className="expv2-section__body">
        {!narrative && !findings ? (
          <div className="expv2-empty">해석할 출력이 아직 없습니다.</div>
        ) : (
          <>
            {narrative ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text)" }}>
                {narrative}
              </p>
            ) : null}
            {Array.isArray(findings) && findings.length ? (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginTop: 4,
                  }}
                >
                  주요 포인트
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                  {findings.slice(0, 8).map((f, i) => (
                    <li key={i}>{typeof f === "string" ? f : JSON.stringify(f)}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {Array.isArray(limitations) && limitations.length ? (
              <>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--warning)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginTop: 4,
                  }}
                >
                  주의/한계
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    fontSize: 12,
                    color: "var(--warning)",
                  }}
                >
                  {limitations.slice(0, 6).map((l, i) => (
                    <li key={i}>{typeof l === "string" ? l : JSON.stringify(l)}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function ComparisonBody({ state }) {
  const completed = state.cells.filter(
    (c) => c.status === "complete" && (c.type === "prompt" || c.type === "result")
  );
  return (
    <section className="expv2-section">
      <div className="expv2-section__head">Compare Cells</div>
      <div className="expv2-section__body">
        {completed.length < 2 ? (
          <div className="expv2-empty">
            비교하려면 완료된 프롬프트/결과 셀이 2개 이상 필요합니다.
          </div>
        ) : (
          completed.map((c) => {
            const data = c.output?.data;
            const preview =
              typeof data === "string"
                ? data.slice(0, 140)
                : data?.executive_summary ||
                  data?.dataset_summary ||
                  data?.orchestration_notes ||
                  "(구조화)";
            return (
              <div
                key={c.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text)",
                    marginBottom: 2,
                  }}
                >
                  {c.title}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--subt)" }}>
                  {preview}
                </div>
                {c.output?.meta?.elapsed_ms ? (
                  <div
                    style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}
                  >
                    {Math.round(c.output.meta.elapsed_ms)}ms
                    {c.output.meta.model ? ` · ${c.output.meta.model}` : ""}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function ExportBody({ state, onExport }) {
  return (
    <section className="expv2-section">
      <div className="expv2-section__head">Export</div>
      <div className="expv2-section__body">
        <div style={{ fontSize: 12, color: "var(--subt)" }}>
          현재 노트북의 셀과 출력을 파일로 내보냅니다.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            className="expv2-btn"
            onClick={() => onExport("json")}
          >
            JSON (.ipynb 유사)
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() => onExport("markdown")}
          >
            Markdown (.md)
          </button>
          <button
            type="button"
            className="expv2-btn"
            onClick={() => onExport("copy")}
          >
            클립보드에 요약 복사
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--dim)",
            marginTop: 4,
          }}
        >
          최근 저장: {state.savedAt ? formatRelative(state.savedAt) : "—"}
        </div>
      </div>
    </section>
  );
}

/* -------- helpers -------- */

function collectNumeric(obj) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  walk(obj, "");
  return out.slice(0, 10);

  function walk(node, path) {
    if (node == null) return;
    if (typeof node === "number" && Number.isFinite(node)) {
      out.push({ label: path || "(value)", value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  }
}

function fmtNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000) return n.toLocaleString();
  return n.toFixed(Math.abs(n) >= 1 ? 3 : 4);
}
