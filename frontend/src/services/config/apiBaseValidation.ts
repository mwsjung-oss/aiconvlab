/**
 * 클라우드 상시 APS: 프로덕션 번들에서는 반드시 공개 원격 Backend URL 로만 접속해야 합니다.
 */

import { getPublicApiBaseUrl } from "./publicEnv";

const trim = (u: string) => (u || "").replace(/\/+$/, "").trim();

function isProbablyPrivateLoopback(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    !h ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0"
  ) {
    return true;
  }
  const ipv4 =
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!ipv4) {
    /* hostname only — block obvious tailscale-ish if starts with fd? skip */
    return false;
  }
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if ([a, b].some((n) => Number.isNaN(n))) return true;

  /* 100.0.0.0/8 — Tailscale 등 오버레이·CGNAT 흔히 사용, 운영 API 기준 URL로 금지 */
  if (a === 100) return true;

  /* RFC1918 + loopback + link-local */
  if (h.startsWith("10.")) return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (a === 169 && b === 254) return true;
  /* 172.16.0.0/12 */
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * 실행 시 검증 결과. SPA 구동 직후 한 번 확인합니다.
 */
export function validateOperationalApiEnvironment(): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!import.meta.env.PROD) {
    /* 개발: Vite 프록시·직접 localhost 대역 허용 (수동 디버깅용). 운영과 혼동되지 않도록 `npm run dev` 만 사용합니다. */
    return { ok: true, errors: [] };
  }

  /* ---- production ----- */
  const raw = trim(getPublicApiBaseUrl());
  if (!raw) {
    errors.push(
      "운영 SPA 빌드(import.meta.env.PROD)에서는 VITE_API_BASE_URL 에 Render 등 공개 Backend HTTPS 원본이 필수입니다. " +
        "예: Cloudflare Pages / CI 에 `VITE_API_BASE_URL=https://your-backend.onrender.com` 를 주입합니다."
    );
    return { ok: false, errors };
  }
  let resolved: URL;
  try {
    resolved = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    errors.push(`VITE_API_BASE_URL 이 올바른 URL 이 아닙니다: "${raw}"`);
    return { ok: false, errors };
  }

  const host = resolved.hostname.toLowerCase();
  if (isProbablyPrivateLoopback(host)) {
    errors.push(
      `운영 환경에서 API 서버 호스트(${host})는 사설 네트워크 또는 루프백처럼 보입니다. ` +
        "`VITE_API_BASE_URL` 을 원격 호스트(https://backend.onrender.com 등) 로 고정했는지 확인하세요."
    );
  }
  if (
    resolved.protocol === "http:" &&
    !(host === "localhost" || host === "127.0.0.1")
  ) {
    errors.push(
      "운영 빌드는 HTTPS 의 공개 Backend 를 권장합니다(현재 프로토콜이 http: 입니다). " +
        "TLS 종료되는 Render·리버스 프록시 후 방문자 링크는 https 를 쓰는지 검토하세요."
    );
  }
  return errors.length === 0 ? { ok: true, errors } : { ok: false, errors };
}
