/** 로그인 화면에서 선택한 백엔드(Cloud: Render / AWS, 로컬 dev 전용: local). */

import {
  AILAB_RENDER_PRODUCTION_API_ORIGIN,
  getAwsApiBaseWithOverride,
  getAwsApiUrl,
  getLocalApiUrl,
  getPublicApiBaseUrl,
} from "../config/publicEnv";

export const BACKEND_MODE_KEY = "ailab_backend_mode";

export type BackendMode = "local" | "render" | "aws";

const trimBase = (u: string) => u.replace(/\/+$/, "");

const localDefault = trimBase(getLocalApiUrl());
const awsDefault = trimBase(getAwsApiUrl());

export function getStoredBackendMode(): BackendMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(BACKEND_MODE_KEY);
  // 기존 연구실(lab) 모드는 Cloud(Render)로 승격 (연구실 API 선택 UI 제거)
  if (v === "lab" || v === "local") return "render";
  if (v === "render" || v === "aws") return v;
  return null;
}

export function setStoredBackendMode(mode: BackendMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKEND_MODE_KEY, mode);
  document.cookie = `ailab_backend_mode=${mode}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

/**
 * 브라우저가 호출할 API 오리진.
 * - 개발(`import.meta.env.DEV`)이고 VITE_API_BASE_URL 이 비어 있으면 상대 경로 `/api` → Vite 프록시·쿠키 모드.
 * - 그 외: Cloud(Render) 또는 AWS 베이스를 고릅니다.
 */
export function getResolvedApiBase(): string {
  const mode =
    typeof window !== "undefined" ? getStoredBackendMode() ?? "render" : "render";

  let fixed = trimBase(getPublicApiBaseUrl());
  /* Pages 빌드에서 VITE_API_BASE_URL 이 비면 상대 /api → 정적 호스트 404(Not Found).
     Render(Cloud) 모드일 때만 운영 API로 보정. */
  if (!fixed && import.meta.env.PROD && mode === "render") {
    fixed = trimBase(AILAB_RENDER_PRODUCTION_API_ORIGIN);
  }

  if (mode === "aws") {
    const aws = trimBase(getAwsApiBaseWithOverride());
    if (aws) return aws;
    if (import.meta.env.DEV && !fixed) return "";
    return fixed;
  }
  if (import.meta.env.DEV && !fixed) return "";
  return fixed;
}

export function getBackendModeLabel(): string {
  return "Cloud";
}

export function getBackendHint(mode: BackendMode): string {
  if (mode === "local") {
    return `API → ${localDefault} (개발 시 선택하면 자동 기동을 시도합니다. 이미 떠 있으면 유지됩니다.)`;
  }
  if (mode === "render") {
    const fixed = trimBase(getPublicApiBaseUrl());
    if (fixed) {
      return `API → ${fixed} (Cloud-Render 운영 백엔드)`;
    }
    return "Cloud-Render: VITE_API_BASE_URL 을 설정하세요.";
  }
  if (mode === "aws") {
    const eff = trimBase(getAwsApiBaseWithOverride());
    if (eff) {
      return `API → ${eff} (Cloud AWS. 서버가 켜져 있어야 합니다.)`;
    }
    return "Cloud (AWS): 아래에 URL을 저장하거나 `.env`에 VITE_AWS_API_URL 을 설정하세요.";
  }
  return "";
}

/** 원격(비로컬) 모드인지 */
export function isRemoteBackendMode(m: BackendMode): boolean {
  return m === "render" || m === "aws";
}
