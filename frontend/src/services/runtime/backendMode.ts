/** 로그인 화면에서 선택한 백엔드(연구실 vs Cloud[Render/AWS]). */

import {
  getAwsApiBaseWithOverride,
  getAwsApiUrl,
  getLabApiBaseWithOverride,
  getLocalApiUrl,
  getPublicApiBaseUrl,
} from "../config/publicEnv";

export const BACKEND_MODE_KEY = "ailab_backend_mode";

export type BackendMode = "local" | "lab" | "render" | "aws";

const trimBase = (u: string) => u.replace(/\/+$/, "");

const localDefault = trimBase(getLocalApiUrl());
const awsDefault = trimBase(getAwsApiUrl());

export function getStoredBackendMode(): BackendMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(BACKEND_MODE_KEY);
  // 운영 UX에서는 local 옵션을 숨기므로 기존 local 저장값은 render로 승격합니다.
  if (v === "local") return "render";
  if (v === "local" || v === "lab" || v === "render" || v === "aws") return v;
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
 * - 그 외: 저장된 백엔드 모드에 따라 연구실·AWS·Cloud(Render) 베이스를 고릅니다.
 *   운영에서도 `연구실 서버` 선택 시 VITE_API_BASE_URL(Cloud) 대신 연구실 주소로 요청이 갑니다.
 */
export function getResolvedApiBase(): string {
  const fixed = trimBase(getPublicApiBaseUrl());
  const mode =
    typeof window !== "undefined" ? getStoredBackendMode() ?? "render" : "render";

  if (import.meta.env.DEV && !fixed) {
    return "";
  }

  if (mode === "lab") {
    const lab = trimBase(getLabApiBaseWithOverride());
    if (lab) return lab;
    return fixed;
  }
  if (mode === "aws") {
    const aws = trimBase(getAwsApiBaseWithOverride());
    if (aws) return aws;
    return fixed;
  }
  return fixed;
}

export function getBackendModeLabel(): string {
  const mode = getStoredBackendMode();
  if (mode === "lab") return "연구실 서버";
  if (mode === "render" || mode === "aws" || mode === "local") return "Cloud";
  // 기본 라벨은 cloud로 고정해 배포 API 같은 추상 표현 대신 실제 선택지를 노출합니다.
  return "Cloud";
}

export function getBackendHint(mode: BackendMode): string {
  if (mode === "local") {
    return `API → ${localDefault} (개발 시 선택하면 자동 기동을 시도합니다. 이미 떠 있으면 유지됩니다.)`;
  }
  if (mode === "lab") {
    const eff = trimBase(getLabApiBaseWithOverride());
    if (!eff) {
      return "연구실: 아래에 API 베이스 URL을 저장하거나, 빌드 시 VITE_LAB_API_URL 을 설정하세요.";
    }
    return `API → ${eff} (요청·헬스는 이 주소로 전달됩니다. VPN·서버 기동을 확인하세요.)`;
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

/** 원격(비로컬) 모드인지 — lab 또는 aws */
export function isRemoteBackendMode(m: BackendMode): boolean {
  return m === "lab" || m === "render" || m === "aws";
}
