/** 로그인 화면에서 선택한 백엔드(로컬 uvicorn vs 연구실 서버). */

export const BACKEND_MODE_KEY = "ailab_backend_mode";

export type BackendMode = "local" | "lab";

const trimBase = (u: string) => u.replace(/\/+$/, "");

const localDefault = trimBase(
  import.meta.env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000"
);
const labDefault = trimBase(
  import.meta.env.VITE_LAB_API_URL || "http://100.70.20.91:8000"
);

export function getStoredBackendMode(): BackendMode | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(BACKEND_MODE_KEY);
  if (v === "local" || v === "lab") return v;
  return null;
}

export function setStoredBackendMode(mode: BackendMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKEND_MODE_KEY, mode);
  document.cookie = `ailab_backend_mode=${mode}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

/**
 * 빌드 시 VITE_API_BASE_URL 이 있으면 최우선.
 * 개발(Vite)에서는 상대 경로만 쓰고, 서버 플러그인이 쿠키로 로컬/연구실에 프록시합니다(CORS 회피).
 * 프로덕션(preview/배포)에서는 local / lab 절대 URL.
 */
export function getResolvedApiBase(): string {
  const fixed = trimBase(import.meta.env.VITE_API_BASE_URL || "");
  if (fixed) return fixed;

  if (import.meta.env.DEV) return "";

  if (typeof window === "undefined") return "";

  const mode = getStoredBackendMode();
  if (mode === "local") return localDefault;
  if (mode === "lab") return labDefault;
  return "";
}

export function getBackendModeLabel(): string {
  if (trimBase(import.meta.env.VITE_API_BASE_URL || "")) {
    return "배포 API";
  }
  const mode = getStoredBackendMode();
  if (mode === "lab") return "연구실 서버";
  if (mode === "local") return "이 PC (로컬)";
  return "Vite 프록시";
}

export function getBackendHint(mode: BackendMode): string {
  return mode === "local"
    ? `API → ${localDefault} (개발 시 선택하면 자동 기동을 시도합니다. 이미 떠 있으면 유지됩니다.)`
    : `API → ${labDefault} (선택 시 연결·헬스를 확인합니다. 서버가 켜져 있어야 합니다.)`;
}
