/**
 * Inline rendering for structured agent outputs.
 *
 * Each agent returns a distinct Pydantic-shaped payload. This component
 * detects common field patterns and renders them as scannable cards rather
 * than dumping raw JSON. Unknown shapes fall back to a plain `<pre>`.
 */
import { useState } from "react";

export default function InlineAgentOutput({ output, meta }) {
  if (!output) return null;

  const sections = [];

  if (typeof output.dataset_summary === "string") {
    sections.push(
      <TextCard key="summary" title="Dataset summary" text={output.dataset_summary} />
    );
  }

  if (Array.isArray(output.target_candidates) && output.target_candidates.length) {
    sections.push(
      <ListCard
        key="targets"
        title="Target candidates"
        items={output.target_candidates}
      />
    );
  }

  if (Array.isArray(output.feature_groups) && output.feature_groups.length) {
    sections.push(
      <ListCard key="features" title="Feature groups" items={output.feature_groups} />
    );
  }

  if (
    Array.isArray(output.recommended_preprocessing) &&
    output.recommended_preprocessing.length
  ) {
    sections.push(
      <ListCard
        key="prep"
        title="Recommended preprocessing"
        items={output.recommended_preprocessing}
      />
    );
  }

  if (
    Array.isArray(output.data_quality_concerns) &&
    output.data_quality_concerns.length
  ) {
    sections.push(
      <ListCard
        key="dq"
        title="Data quality concerns"
        items={output.data_quality_concerns}
      />
    );
  }

  if (typeof output.task_type === "string") {
    sections.push(
      <KVCard
        key="mtype"
        title="Modeling overview"
        pairs={[
          ["Task type", output.task_type],
          ["Validation", output.validation_strategy || "—"],
        ]}
      />
    );
  }

  if (
    Array.isArray(output.recommended_models) &&
    output.recommended_models.length
  ) {
    sections.push(
      <ModelCards key="models" items={output.recommended_models} />
    );
  }

  if (Array.isArray(output.evaluation_metrics) && output.evaluation_metrics.length) {
    sections.push(
      <TagCard
        key="metrics"
        title="Evaluation metrics"
        items={output.evaluation_metrics}
      />
    );
  }

  if (Array.isArray(output.tracking_checklist) && output.tracking_checklist.length) {
    sections.push(
      <ListCard
        key="track"
        title="Tracking checklist"
        items={output.tracking_checklist}
      />
    );
  }

  if (typeof output.executive_summary === "string") {
    sections.push(
      <TextCard
        key="exec"
        title="Executive summary"
        text={output.executive_summary}
      />
    );
  }

  if (Array.isArray(output.key_findings) && output.key_findings.length) {
    sections.push(
      <ListCard key="findings" title="Key findings" items={output.key_findings} />
    );
  }

  if (Array.isArray(output.recommendations) && output.recommendations.length) {
    sections.push(
      <ListCard
        key="recs"
        title="Recommendations"
        items={output.recommendations}
      />
    );
  }

  if (Array.isArray(output.risks) && output.risks.length) {
    sections.push(<ListCard key="risks" title="Risks" items={output.risks} />);
  }

  if (Array.isArray(output.next_experiments) && output.next_experiments.length) {
    sections.push(
      <ListCard
        key="next"
        title="Next experiments"
        items={output.next_experiments}
      />
    );
  }

  // ExperimentAgent orchestrator output
  if (output.data_plan || output.modeling_plan || output.report) {
    if (output.data_plan) {
      sections.push(
        <SubSection key="exp-data" title="Data plan">
          <InlineAgentOutput output={stripMeta(output.data_plan)} />
        </SubSection>
      );
    }
    if (output.modeling_plan) {
      sections.push(
        <SubSection key="exp-model" title="Modeling plan">
          <InlineAgentOutput output={stripMeta(output.modeling_plan)} />
        </SubSection>
      );
    }
    if (output.report) {
      sections.push(
        <SubSection key="exp-report" title="Report">
          <InlineAgentOutput output={stripMeta(output.report)} />
        </SubSection>
      );
    }
  }

  if (Array.isArray(output._retrieved_sources) && output._retrieved_sources.length) {
    sections.push(
      <SourcesCard key="sources" items={output._retrieved_sources} />
    );
  }

  if (sections.length === 0) {
    sections.push(
      <div key="raw" className="notebook-output">
        <div className="notebook-output__title">Raw output</div>
        <pre
          style={{
            margin: 0,
            fontSize: 11.5,
            fontFamily: "var(--nc-font-mono)",
            color: "#cbd5e1",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(output, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sections}
      {meta?.sources?.length ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--nc-muted)",
            fontStyle: "italic",
          }}
        >
          Based on {meta.sources.length}개의 관련 지식베이스 컨텍스트
        </div>
      ) : null}
    </div>
  );
}

function stripMeta(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = { ...obj };
  for (const k of Object.keys(clone)) {
    if (k.startsWith("_")) delete clone[k];
  }
  return clone;
}

function TextCard({ title, text }) {
  return (
    <div className="notebook-output">
      <div className="notebook-output__title">{title}</div>
      <div className="notebook-output__narrative">{text}</div>
    </div>
  );
}

function ListCard({ title, items }) {
  return (
    <div className="notebook-output">
      <div className="notebook-output__title">{title}</div>
      <ul className="notebook-output__list">
        {items.map((it, i) => (
          <li key={i}>{typeof it === "string" ? it : JSON.stringify(it)}</li>
        ))}
      </ul>
    </div>
  );
}

function KVCard({ title, pairs }) {
  return (
    <div className="notebook-output">
      <div className="notebook-output__title">{title}</div>
      <div className="notebook-output__grid">
        {pairs.map(([k, v]) => (
          <div key={k} className="notebook-output__kv">
            <span className="notebook-output__kv-label">{k}</span>
            <span className="notebook-output__kv-value">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagCard({ title, items }) {
  return (
    <div className="notebook-output">
      <div className="notebook-output__title">{title}</div>
      <div className="notebook-tags">
        {items.map((t, i) => (
          <span key={i} className="notebook-tag">
            {String(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ModelCards({ items }) {
  return (
    <div className="notebook-output">
      <div className="notebook-output__title">Recommended models</div>
      <div className="notebook-model-cards">
        {items.map((m, i) => (
          <div key={i} className="notebook-model-card">
            <div className="notebook-model-card__name">
              {m.name || `Model ${i + 1}`}
            </div>
            {m.rationale ? (
              <div className="notebook-model-card__reason">{m.rationale}</div>
            ) : null}
            {m.hyperparameters &&
            typeof m.hyperparameters === "object" &&
            Object.keys(m.hyperparameters).length > 0 ? (
              <pre className="notebook-model-card__hp">
                {JSON.stringify(m.hyperparameters, null, 2)}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesCard({ items }) {
  return (
    <div className="notebook-output">
      <div className="notebook-output__title">
        Retrieved context · {items.length}건
      </div>
      <div className="notebook-output__sources">
        {items.map((h, i) => (
          <SourceItem key={h.id || i} index={i + 1} hit={h} />
        ))}
      </div>
    </div>
  );
}

function SourceItem({ index, hit }) {
  const [open, setOpen] = useState(false);
  const src = hit?.source || hit?.metadata?.source || "unknown";
  const score =
    typeof hit?.score === "number" ? hit.score.toFixed(2) : "—";
  const text = hit?.snippet || hit?.text || "";
  return (
    <div className="notebook-output__source">
      <div className="notebook-output__source-head">
        <span>[{index}]</span>
        <span className="notebook-output__source-score">score {score}</span>
        <span style={{ color: "var(--nc-muted)" }}>source: {src}</span>
      </div>
      <div
        className="notebook-output__source-text"
        style={open ? { maxHeight: "none" } : { maxHeight: 60, overflow: "hidden" }}
      >
        {text}
      </div>
      {text && text.length > 120 ? (
        <button
          type="button"
          className="notebook-knowledge__card-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "접기" : "전체 보기"}
        </button>
      ) : null}
    </div>
  );
}

function SubSection({ title, children }) {
  return (
    <div
      className="notebook-output"
      style={{ background: "rgba(148, 163, 184, 0.03)" }}
    >
      <div className="notebook-output__title">{title}</div>
      {children}
    </div>
  );
}
