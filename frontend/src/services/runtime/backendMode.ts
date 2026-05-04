/**
 * API 베이스: 운영 단일 AWS EB(또는 공개 API) URL — `VITE_API_BASE_URL`.
 * 개발 프록시 쿠키 모드(`render` 레이블 등)은 dev 전용 과거 호환입니다.
 */
import {
  getPublicApiBaseUrl,
  getLocalApiUrl,
} from "../config/publicEnv";

export const BACKEND_MODE_KEY = "ailab_backend_mode";

/** @deprecated 레거시 UI; 저장값은 모두 cloud 단일로 취급 */
export type BackendMode = "local" | "render" | "aws" | "cloud";

const trimBase = (u: string) => u.replace(/\/+$/, "");
const localDefault = trimBase(getLocalApiUrl());

function effectiveCloudBase(): string {
  return trimBase(getPublicApiBaseUrl());
}

/** 단일 EB/배포 URL. dev 에서 비어 있으면 Vite 프록시 ``/api`` */
export function getApiBase(_selectedBackend: BackendMode = "cloud"): string {
  const cloud = effectiveCloudBase();
  if (import.meta.env.DEV && !cloud) return "";
  if (!cloud) {
    throw new Error("VITE_API_BASE_URL 이 설정되지 않았습니다.");
  }
  return cloud;
}

export function getStoredBackendMode(): BackendMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(BACKEND_MODE_KEY);
  if (v === "local") return "local";
  if (v === "render" || v === "aws" || v === "cloud") return "cloud";
  return null;
}

export function setStoredBackendMode(mode: BackendMode): void {
  if (typeof window === "undefined") return;
  const unified = mode === "local" ? "local" : "cloud";
  localStorage.setItem(BACKEND_MODE_KEY, unified === "local" ? "local" : "cloud");
  document.cookie = `ailab_backend_mode=${unified}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function getResolvedApiBase(): string {
  const m = typeof window !== "undefined" ? getStoredBackendMode() : null;
  if (m === "local") {
    return localDefault;
  }
  const cloud = effectiveCloudBase();
  if (import.meta.env.DEV && !cloud) return "";
  return cloud || "";
}

export function getBackendModeLabel(): string {
  return "APS Cloud";
}

export function getBackendHint(_mode: BackendMode): string {
  const b = effectiveCloudBase();
  return b ? `API → ${b} (AWS EB / 운영 원본)` : "개발: VITE_API_BASE_URL 비움 → Vite 프록시 /api";
}

export function isRemoteBackendMode(m: BackendMode): boolean {
  return m !== "local";
}
