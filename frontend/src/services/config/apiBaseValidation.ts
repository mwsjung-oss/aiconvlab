/**
 * 클라우드 상시 APS: 프로덕션 번들에서는 공개 원격 Backend HTTPS 오리진이 필요합니다 (AWS EB 권장).
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
    return false;
  }
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if ([a, b].some((n) => Number.isNaN(n))) return true;

  if (a === 100) return true;
  if (h.startsWith("10.")) return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (a === 169 && b === 254) return true;
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
    return { ok: true, errors: [] };
  }

  const raw = trim(getPublicApiBaseUrl());
  if (!raw) {
    errors.push(
      "운영 SPA 빌드(import.meta.env.PROD)에서는 VITE_API_BASE_URL 에 공개 Backend HTTPS 원본이 필요합니다. " +
        "AWS Amplify 콘솔 또는 CI에서 Elastic Beanstalk 공개 API URL을 주입하세요. 형식 예: docs/aws-cutover-runbook.md",
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
        "`VITE_API_BASE_URL` 을 퍼블릭 EB HTTPS 엔드포인트로 설정했는지 확인하세요.",
    );
  }
  if (
    resolved.protocol === "http:" &&
    !(host === "localhost" || host === "127.0.0.1")
  ) {
    errors.push(
      "운영 빌드는 HTTPS 의 공개 Backend 를 권장합니다(현재 프로토콜이 http: 입니다). " +
        "TLS 종료 로드밸런서 뒤의 방문자 링크는 https 를 쓰는지 검토하세요.",
    );
  }
  return errors.length === 0 ? { ok: true, errors } : { ok: false, errors };
}
