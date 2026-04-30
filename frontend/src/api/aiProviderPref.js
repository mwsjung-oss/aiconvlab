export const AI_PROVIDER_STORAGE_KEY = "ailab_ai_provider";

const VALID = ["openai", "gemini", "bedrock", "auto", "ollama", "local"];

export function readStoredAiProvider() {
  try {
    const v = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    if (VALID.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "openai";
}

export function writeStoredAiProvider(value) {
  if (!VALID.includes(value)) return;
  try {
    localStorage.setItem(AI_PROVIDER_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("ailab-ai-provider-change", { detail: value })
  );
}

export const AI_PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "bedrock", label: "Bedrock" },
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama (로컬·레거시)" },
  { value: "local", label: "로컬 (레거시)" },
];
