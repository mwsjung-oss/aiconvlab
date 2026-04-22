/**
 * Lightweight pub/sub so read-only surfaces (e.g. the right Inspector panel)
 * can observe the notebook canvas' state without reaching into React context.
 *
 * Rationale
 * ---------
 * The notebook store lives inside `ExperimentCanvas`; the Inspector lives
 * outside it in `ExperimentWorkbenchLayout`. Rather than lifting state up
 * (which would force a large App.jsx rewrite), the canvas publishes a
 * snapshot on every tick and the Inspector subscribes.
 *
 * Snapshots are intentionally small (no React refs, no functions) so they
 * can be safely serialised and stored anywhere.
 */

const EVENT_NAME = "ailab-notebook-snapshot";
const STORAGE_KEY = "ailab_notebook_snapshot_v1";

function safeClone(value) {
  try {
    // structuredClone is available in all browsers we support.
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {
    /* fallthrough */
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/** Broadcast the latest notebook state. Called from inside the canvas. */
export function publishNotebookSnapshot(state) {
  if (typeof window === "undefined") return;
  const snapshot = safeClone(state) || {};
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* quota exceeded — continue, event still fires */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: snapshot })
    );
  } catch {
    /* older browsers — noop */
  }
}

/** Synchronous accessor — reads whatever the last published snapshot was.
 *  Safe to call during the first render of the Inspector. */
export function readNotebookSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Subscribe to updates. Returns an unsubscribe function. */
export function subscribeNotebookSnapshot(listener) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event) => {
    try {
      listener(event?.detail || readNotebookSnapshot());
    } catch {
      /* listener must not break the canvas */
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/* ---------------------------------------------------------------
 * Shared timeline sink.
 *
 * Blocks (6 fixed + dynamic cells) drop structured events here via
 * `writeTimeline(event)`. ExperimentCanvas installs the actual writer
 * (wired to useNotebookState.appendTimeline) with `setTimelineSink`.
 *
 * Having a module-level sink avoids threading an `onTimeline` prop
 * through every block/cell call site and keeps backwards-compatibility
 * with existing block signatures.
 * --------------------------------------------------------------- */
let _timelineSink = null;

export function setTimelineSink(fn) {
  _timelineSink = typeof fn === "function" ? fn : null;
}

export function writeTimeline(event) {
  try {
    if (_timelineSink) _timelineSink(event);
  } catch {
    /* never let telemetry break the UI */
  }
}
