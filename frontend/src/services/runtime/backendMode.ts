/** 로그인 화면에서 선택한 백엔드(연구실 vs Cloud AWS 중심). */

import {
  getAwsApiUrl,
  getLabApiUrl,
  getLabApiUrlWithLegacyFallback,
  getLocalApiUrl,
  getPublicApiBaseUrl,
} from "../config/publicEnv";

export const BACKEND_MODE_KEY = "ailab_backend_mode";

export type BackendMode = "local" | "lab" | "aws";

const trimBase = (u: string) => u.replace(/\/+$/, "");

const localDefault = trimBase(getLocalApiUrl());
const labConfigured = trimBase(getLabApiUrl());
const labWithLegacy = trimBase(getLabApiUrlWithLegacyFallback());
/** Effective lab URL for UI hints (legacy name kept for template strings below). */
const labDefault = labConfigured || labWithLegacy;
const awsDefault = trimBase(getAwsApiUrl());

export function getStoredBackendMode(): BackendMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(BACKEND_MODE_KEY);
  // 운영 UX에서는 local 옵션을 숨기므로 기존 local 저장값은 aws로 승격합니다.
  if (v === "local") return "aws";
  if (v === "local" || v === "lab" || v === "aws") return v;
  return null;
}

export function setStoredBackendMode(mode: BackendMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKEND_MODE_KEY, mode);
  document.cookie = `ailab_backend_mode=${mode}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

/**
 * 빌드 시 VITE_API_BASE_URL 이 있으면 최우선(별도 API 도메인).
 * 비어 있으면 항상 상대 경로 `/api` — Vite dev·preview 프록시가 동일 출처로 백엔드에 연결합니다.
 *
 * 예전에는 호스트명이 사설 IP가 아닐 때 127.0.0.1 로 직접 붙였는데, 다른 기기에서
 * `http://PC이름:5174` 로 접속하면 그 기기의 루프백으로 가서 Failed to fetch 가 납니다.
 * 원격 정적 호스팅만 쓸 때는 반드시 VITE_API_BASE_URL 을 설정하세요.
 */
export function getResolvedApiBase(): string {
  const fixed = trimBase(getPublicApiBaseUrl());
  if (fixed) return fixed;

  if (typeof window === "undefined") return "";

  return "";
}

export function getBackendModeLabel(): string {
  const mode = getStoredBackendMode();
  if (mode === "lab") return "연구실 서버";
  if (mode === "aws") return "Cloud (AWS)";
  if (mode === "local") return "Cloud (AWS)";
  // 기본 라벨은 cloud로 고정해 배포 API 같은 추상 표현 대신 실제 선택지를 노출합니다.
  return "Cloud (AWS)";
}

export function getBackendHint(mode: BackendMode): string {
  if (mode === "local") {
    return `API → ${localDefault} (개발 시 선택하면 자동 기동을 시도합니다. 이미 떠 있으면 유지됩니다.)`;
  }
  if (mode === "lab") {
    if (!labDefault) {
      return "연구실 모드: `.env`에 VITE_LAB_API_URL(또는 하위호환 VITE_DEV_PROXY_TARGET)을 설정하세요.";
    }
    return `API → ${labDefault} (선택 시 연결·헬스를 확인합니다. 서버가 켜져 있어야 합니다.)`;
  }
  if (mode === "aws" && awsDefault) {
    return `API → ${awsDefault} (Cloud 백엔드 주소. 서버가 켜져 있어야 합니다.)`;
  }
  if (mode === "aws") {
    return "Cloud (AWS): `.env`에 VITE_AWS_API_URL 을 설정하세요.";
  }
  return "";
}

/** 원격(비로컬) 모드인지 — lab 또는 aws */
export function isRemoteBackendMode(m: BackendMode): boolean {
  return m === "lab" || m === "aws";
}
