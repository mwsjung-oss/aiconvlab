/**
 * APS 전역 필수 변수: 운영·개발 공통으로 VITE_AWS_API_URL (AWS 전용 Backend 오리진) 비어 있으면 즉시 실패.
 */

import { readAwsApiUrlFromEnvironment } from "./publicEnv";

const trim = (u: string) => (u || "").replace(/\/+$/, "").trim();

/** import.meta.env + (선택) window.__PUBLIC_ENV__ */
export function validateAwsApiUrlConfigured(): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const raw = trim(readAwsApiUrlFromEnvironment());
  if (!raw || raw.trim() === "") {
    errors.push(
      "FATAL: VITE_AWS_API_URL 이 설정되어 있지 않습니다. 빌드·배포 전에 APS AWS Backend 도메인(HTTPS)을 환경 변수로 설정해야 합니다.",
    );
    return { ok: false, errors };
  }
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    if (import.meta.env.PROD && u.protocol !== "https:") {
      if (host !== "localhost" && host !== "127.0.0.1") {
        errors.push(
          "운영 빌드에서는 VITE_AWS_API_URL 이 https:// 로 시작하는 공개 도메인이어야 합니다.",
        );
      }
    }
  } catch {
    errors.push(`VITE_AWS_API_URL 형식이 올바른 URL 이 아닙니다: "${raw}"`);
    return { ok: false, errors };
  }
  return { ok: true, errors: [] };
}
