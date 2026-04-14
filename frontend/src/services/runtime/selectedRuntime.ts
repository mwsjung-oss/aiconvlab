export const SELECTED_RUNTIME_KEY = "ailab_selected_runtime";

export type ExecutionRuntime = "local" | "lab" | "cloud";

export function readSelectedRuntime(): ExecutionRuntime {
  try {
    const v = (localStorage.getItem(SELECTED_RUNTIME_KEY) || "").trim().toLowerCase();
    if (v === "local" || v === "lab" || v === "cloud") return v;
  } catch {
    // ignore
  }
  return "local";
}

export function writeSelectedRuntime(runtime: ExecutionRuntime): void {
  try {
    localStorage.setItem(SELECTED_RUNTIME_KEY, runtime);
  } catch {
    // ignore
  }
}

