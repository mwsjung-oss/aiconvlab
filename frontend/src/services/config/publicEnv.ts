/**
 * Public (browser-safe) env accessors for Vite `import.meta.env`.
 * Secrets must never be prefixed with VITE_ or placed here.
 */

declare global {
  interface Window {
    /** 런타임 주입(선택). 호스팅에서 스크립트로 덮어쓸 때 사용. */
    __PUBLIC_ENV__?: Partial<Record<"VITE_AWS_API_URL", string>>;
  }
}

const trim = (u: string) => (u || "").replace(/\/+$/, "").trim();

export type AppPublicEnv = "development" | "production" | "test" | string;

export function getViteMode(): string {
  return import.meta.env.MODE || "development";
}

/** Deployment label. Falls back to Vite MODE. */
export function getAppPublicEnv(): AppPublicEnv {
  const v = (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || "development").trim();
  return v || "development";
}

/**
 * 정적 SPA에서 브라우저가 호출할 공개 API 오리진(EB 등).
 * 비어 있으면 개발 빌드에서만 동일 출처 `/api` + Vite 프록시.
 */
export function getPublicApiBaseUrl(): string {
  return trim(import.meta.env.VITE_API_BASE_URL || "");
}

/** Dev proxy target: local FastAPI (not used when using relative `/api` in dev). */
export function getLocalApiUrl(): string {
  return trim(import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000");
}

/** EB·배포 백엔드 베이스 URL (환경 변수만 — localStorage 금지). */
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
 * AWS 백엔드 오리진. 비어 있으면 배포 설정 실패로 간주 가능.
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
