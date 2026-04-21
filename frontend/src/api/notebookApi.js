/**
 * Notebook workspace API client.
 *
 * Thin wrapper around `apiJson` that talks to the lightweight LLM gateway
 * routes mounted in `backend/src/main.py`:
 *   - POST /api/agent/run
 *   - POST /api/rag/query
 *   - POST /api/rag/ingest
 *   - GET  /api/rag/stats
 *   - GET  /api/chat/health
 *
 * The module is deliberately provider-agnostic: callers pass the provider
 * ("openai" | "gemini") as a simple option.
 */
import { apiJson } from "../api";

const DEFAULT_TIMEOUT_MS = 180_000;

/**
 * Run a structured agent.
 *
 * @param {object} params
 * @param {"data"|"model"|"report"|"experiment"|"smart"} params.agent
 * @param {string} params.task
 * @param {string} [params.context]
 * @param {"openai"|"gemini"} [params.provider]
 * @param {string} [params.model]
 * @param {{inner?: string, top_k?: number, min_score?: number}} [params.options]
 * @param {AbortSignal} [params.signal]
 */
export async function runAgent({
  agent,
  task,
  context,
  provider = "openai",
  model,
  options,
  signal,
}) {
  if (!agent || !task) throw new Error("runAgent requires agent and task");
  return apiJson("/api/agent/run", {
    method: "POST",
    body: JSON.stringify({
      agent,
      task,
      context: context || undefined,
      provider,
      model: model || undefined,
      options: options || undefined,
    }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    signal,
  });
}

/** List of registered agents. */
export async function listAgents({ signal } = {}) {
  return apiJson("/api/agent/list", { signal });
}

/**
 * Query the RAG knowledge base.
 * @param {object} params
 * @param {string} params.query
 * @param {"search"|"answer"} [params.mode]
 * @param {number} [params.topK]
 * @param {"openai"|"gemini"} [params.provider]
 * @param {number} [params.minScore]
 * @param {string} [params.collection]
 */
export async function queryKnowledge({
  query,
  mode = "answer",
  topK = 4,
  provider = "openai",
  minScore = 0,
  collection,
  signal,
}) {
  if (!query || !query.trim()) {
    throw new Error("queryKnowledge requires a non-empty query");
  }
  return apiJson("/api/rag/query", {
    method: "POST",
    body: JSON.stringify({
      query,
      mode,
      top_k: topK,
      provider,
      min_score: minScore,
      collection: collection || undefined,
    }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    signal,
  });
}

/**
 * Ingest documents into the RAG store.
 * @param {Array<{text: string, metadata?: object, id?: string}>} documents
 */
export async function ingestKnowledge(documents, { collection, signal } = {}) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error("ingestKnowledge requires at least one document");
  }
  return apiJson("/api/rag/ingest", {
    method: "POST",
    body: JSON.stringify({
      documents,
      collection: collection || undefined,
    }),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    signal,
  });
}

/** Current RAG collection stats. */
export async function knowledgeStats({ collection, signal } = {}) {
  const qs = collection ? `?collection=${encodeURIComponent(collection)}` : "";
  return apiJson(`/api/rag/stats${qs}`, { signal });
}

/** Health for the lightweight gateway (openai/gemini key flags). */
export async function gatewayHealth({ signal } = {}) {
  return apiJson("/api/chat/health", { signal });
}

/**
 * Best-effort mapping from a notebook step id to the most relevant
 * structured agent. The notebook UI uses this to decide what to send to
 * `/api/agent/run` when a step's "AI" action is invoked.
 */
export const STEP_AGENT_MAP = Object.freeze({
  problem: "data", // problem → data-plan helps clarify objective & data needs
  data: "data",
  model: "model",
  run: "model",
  compare: "report",
  report: "report",
});

/**
 * Drop-in safe wrapper that catches network errors and returns a shaped
 * error payload instead of throwing. Useful for inline UI slots where we
 * don't want to tear down the page on a transient 500.
 */
export async function safeCall(fn) {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err) || "request failed",
    };
  }
}
