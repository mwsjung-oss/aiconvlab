/**
 * Public (browser-safe) env accessors for Vite `import.meta.env`.
 * Secrets must never be prefixed with VITE_ or placed here.
 */

declare global {
  interface Window {
    /** 런타임 주입(선택). Cloudflare 등에서 스크립트로 넣을 때 사용. */
    __PUBLIC_ENV__?: Partial<Record<"VITE_AWS_API_URL", string>>;
  }
}

const trim = (u: string) => (u || "").replace(/\/+$/, "").trim();

/** Blueprint·저장소·`frontend/.env.production` 과 동일한 Cloud-Render API 오리진 */
export const AILAB_RENDER_PRODUCTION_API_ORIGIN = "https://ailab-backend.onrender.com";
const CANONICAL_RENDER_API_ORIGIN = AILAB_RENDER_PRODUCTION_API_ORIGIN;
const ABANDONED_RENDER_API_HOSTNAMES = new Set([
  "ai-lab-be.onrender.com",
  "labapi-backend-k62f.onrender.com",
]);

function normalizeViteRenderApiBaseUrl(raw: string): string {
  const t = trim(raw);
  if (!t) return t;
  try {
    const h = new URL(t).hostname.toLowerCase();
    if (ABANDONED_RENDER_API_HOSTNAMES.has(h)) {
      return CANONICAL_RENDER_API_ORIGIN;
    }
  } catch {
    /* keep raw */
  }
  return t;
}

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
 * `VITE_API_BASE_URL`에 배포·Pages에서 잘못 남은 삭제/404 Render 호스트가 있으면 정식 API로 맞춥니다.
 */
export function getPublicApiBaseUrl(): string {
  return normalizeViteRenderApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
}

/** Dev proxy target: local FastAPI (not used by the browser when using relative `/api`). */
export function getLocalApiUrl(): string {
  return trim(import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000");
}

/** AWS Backend 베이스 URL (환경 변수만 — 사용자 입력·localStorage 금지). */
export function readAwsApiUrlFromEnvironment(): string {
  if (typeof window !== "undefined" && window.__PUBLIC_ENV__?.VITE_AWS_API_URL) {
    return trim(String(window.__PUBLIC_ENV__.VITE_AWS_API_URL));
  }
  return trim(import.meta.env.VITE_AWS_API_URL || "");
}

/** @deprecated use readAwsApiUrlFromEnvironment */
export function getAwsApiUrl(): string {
  return readAwsApiUrlFromEnvironment();
}

/**
 * 사용자·배포자 설정 AWS API 오리진. 비어 있으면 throw (배포/설정 실패로 간주).
 */
export function assertAwsApiUrl(): string {
  const url =
    typeof window !== "undefined"
      ? readAwsApiUrlFromEnvironment()
      : trim(import.meta.env.VITE_AWS_API_URL || "");
  if (!url || url.trim() === "") {
    throw new Error(
      "FATAL: VITE_AWS_API_URL is not configured. AWS backend must be configured before deployment.",
    );
  }
  return normalizeAwsApiUrl(url);
}

export function normalizeAwsApiUrl(url: string): string {
  return trim(url || "");
}

export function getApiTimeoutMs(): number {
  return Number(import.meta.env.VITE_API_TIMEOUT_MS || "") || 20000;
}

export function getDevPort(): number {
  const n = Number(import.meta.env.VITE_DEV_PORT || "");
  return Number.isFinite(n) ? n : 5174;
}
