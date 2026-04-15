/**
 * Public (browser-safe) env accessors for Vite `import.meta.env`.
 * Secrets must never be prefixed with VITE_ or placed here.
 */

const trim = (u: string) => (u || "").replace(/\/+$/, "").trim();

export type AppPublicEnv = "development" | "production" | "test" | string;

export function getViteMode(): string {
  return import.meta.env.MODE || "development";
}

/** Deployment label (e.g. Cloudflare Pages). Falls back to Vite MODE. */
export function getAppPublicEnv(): AppPublicEnv {
  const v = (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || "development").trim();
  return v || "development";
}

/**
 * Absolute API base for static hosting. Empty => same-origin `/api` (Vite proxy in dev/preview).
 */
export function getPublicApiBaseUrl(): string {
  return trim(import.meta.env.VITE_API_BASE_URL || "");
}

/** Dev proxy target: local FastAPI (not used by the browser when using relative `/api`). */
export function getLocalApiUrl(): string {
  return trim(import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000");
}

/** Remote lab/staging API base. No default — set in `.env` for lab mode. */
export function getLabApiUrl(): string {
  return trim(import.meta.env.VITE_LAB_API_URL || "");
}

/** Legacy alias `VITE_DEV_PROXY_TARGET` (phase-1 migration). */
export function getLabApiUrlWithLegacyFallback(): string {
  return trim(
    import.meta.env.VITE_LAB_API_URL ||
      import.meta.env.VITE_DEV_PROXY_TARGET ||
      ""
  );
}

/** 브라우저 localStorage — 운영·LAN에서 빌드 없이 연구실 주소 지정 */
export const LAB_API_BASE_STORAGE_KEY = "ailab_lab_api_base";
export const AWS_API_BASE_STORAGE_KEY = "ailab_aws_api_base";

export function getLabApiBaseWithOverride(): string {
  if (typeof window !== "undefined") {
    const o = trim(localStorage.getItem(LAB_API_BASE_STORAGE_KEY) || "");
    if (o) return o;
  }
  return getLabApiUrlWithLegacyFallback();
}

export function setLabApiBaseOverride(url: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const t = trim(url || "");
  if (!t) localStorage.removeItem(LAB_API_BASE_STORAGE_KEY);
  else localStorage.setItem(LAB_API_BASE_STORAGE_KEY, t);
}

export function getAwsApiBaseWithOverride(): string {
  if (typeof window !== "undefined") {
    const o = trim(localStorage.getItem(AWS_API_BASE_STORAGE_KEY) || "");
    if (o) return o;
  }
  return getAwsApiUrl();
}

export function setAwsApiBaseOverride(url: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const t = trim(url || "");
  if (!t) localStorage.removeItem(AWS_API_BASE_STORAGE_KEY);
  else localStorage.setItem(AWS_API_BASE_STORAGE_KEY, t);
}

export function getAwsApiUrl(): string {
  return trim(import.meta.env.VITE_AWS_API_URL || "");
}

export function getApiTimeoutMs(): number {
  return Number(import.meta.env.VITE_API_TIMEOUT_MS || "") || 20000;
}

export function getDevPort(): number {
  const n = Number(import.meta.env.VITE_DEV_PORT || "");
  return Number.isFinite(n) ? n : 5174;
}
