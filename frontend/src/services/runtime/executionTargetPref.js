const KEY = "ailab_execution_target";

const VALID = new Set(["aws", "lab_gpu", "auto"]);

function fromEnv() {
  try {
    const raw = import.meta.env.VITE_DEFAULT_EXECUTION_TARGET;
    if (typeof raw === "string" && VALID.has(raw.trim())) return raw.trim();
  } catch {
    /* ignore */
  }
  return "aws";
}

export function readStoredExecutionTarget() {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (v && VALID.has(v)) return v;
  } catch {
    /* ignore */
  }
  return fromEnv();
}

export function writeStoredExecutionTarget(value) {
  if (!VALID.has(value)) return;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent("ailab-execution-target-change", { detail: value }));
  } catch {
    /* ignore */
  }
}

export const EXECUTION_TARGET_OPTIONS = [
  { value: "aws", label: "AWS 기본 실행" },
  { value: "lab_gpu", label: "연구실 GPU 서버 실행" },
  { value: "auto", label: "자동 선택" },
];
