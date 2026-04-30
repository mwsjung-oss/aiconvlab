/** 개발 시 Render/AWS 원격 헬스 확인(Vite 플러그인 경유 또는 브라우저 직접) */

import { getPublicApiBaseUrl } from "../config/publicEnv";

const trim = (u: string) => u.replace(/\/+$/, "");

function joinApiLikePath(base: string, path: string): string {
  const b = trim(base);
  if (!b) return path;
  if (!path.startsWith("/")) return `${b}/${path}`;
  if (/\/api$/i.test(b) && /^\/api(?:\/|$)/i.test(path)) {
    return `${b}${path.slice(4)}`;
  }
  if (/\/history$/i.test(b) && /^\/history(?:\/|$)/i.test(path)) {
    return `${b}${path.slice(8)}`;
  }
  return `${b}${path}`;
}

function isViteLocalhostClient(): boolean {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

async function sleep(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const t = globalThis.setTimeout(() => resolve(), ms);
    const onAbort = () => {
      globalThis.clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function probeRemoteHealthDirect(
  base: string,
  remoteName: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  const b = trim(base);
  let lastErr = "알 수 없는 오류";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) {
      return { ok: false, message: "취소되었습니다." };
    }
    try {
      const health = await fetch(joinApiLikePath(b, "/api/health"), {
        mode: "cors",
        signal,
      });
      if (health.ok) {
        return { ok: true, message: `${remoteName} API에 연결되었습니다.` };
      }
      const openapi = await fetch(`${b}/openapi.json`, { mode: "cors", signal });
      if (openapi.ok) {
        return {
          ok: true,
          message:
            health.status === 404
              ? `${remoteName} FastAPI에 연결되었습니다. (/api/health 없음·OpenAPI로 확인)`
              : `${remoteName} FastAPI에 연결되었습니다. (/api/health 비정상·OpenAPI로 확인)`,
        };
      }
      if (health.status === 404 && openapi.status === 404) {
        return {
          ok: false,
          message: `${remoteName}: 해당 URL에서 API를 찾을 수 없습니다(404). Render·서버가 기동 중인지, VITE_API_BASE_URL(또는 AWS 저장 URL)이 실제 백엔드 주소와 일치하는지 확인하세요.`,
        };
      }
      return {
        ok: false,
        message: `${remoteName} 응답: health HTTP ${health.status}, openapi HTTP ${openapi.status}.`,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < 2) {
        try {
          await sleep(600 * (attempt + 1), signal);
        } catch {
          return { ok: false, message: "취소되었습니다." };
        }
      }
    }
  }
  const onProd =
    typeof window !== "undefined" && import.meta.env.PROD && window.location?.origin
      ? ` 현재 사이트: ${window.location.origin} — 백엔드 Render의 CORS_ORIGINS 에 이 주소(및 www)가 포함돼 있어야 합니다. aiconvlab.com 과 aiconlab.com 은 서로 다른 오리진입니다.`
      : "";
  const devLanHint =
    /failed to fetch/i.test(lastErr) &&
    typeof window !== "undefined" &&
    import.meta.env.DEV
      ? " 같은 Wi‑Fi에서 `http://(PC의 LAN IP):5174`로 접속 중이면, Render CORS(백엔드 최신 배포)와 브라우저(확장·광고 차단)을 확인하세요."
      : "";
  const corsHint = /failed to fetch/i.test(lastErr) ? `${onProd}${devLanHint}` : "";
  return {
    ok: false,
    message: `${remoteName}에 연결할 수 없습니다 (${lastErr}). VPN·망·방화벽·서버 기동을 확인하세요.${corsHint}`,
  };
}


function cloudBase() {
  return trim(getPublicApiBaseUrl());
}

export async function ensureRemoteBackendReachable(
  kind: "render" | "aws",
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  const base = cloudBase();
  if (!base && !(import.meta.env.DEV && isViteLocalhostClient())) {
    return {
      ok: false,
      message:
        "VITE_API_BASE_URL 이 비어 있습니다. AWS Elastic Beanstalk 공개 API URL(https)을 설정하세요.",
    };
  }
  if (!base) {
    return {
      ok: true,
      message: "로컬 개발 — Vite 가 `/api` 를 백엔드로 프록시합니다.",
    };
  }

  const remoteName = "APS Backend (AWS EB)";
  if (import.meta.env.DEV && isViteLocalhostClient()) {
    try {
      const r = await fetch(
        `/__ailab/dev/remote-health?kind=${encodeURIComponent(kind)}`,
        { signal }
      );
      const text = await r.text();
      let j: { ok?: boolean; message?: string } = {};
      try {
        j = JSON.parse(text) as { ok?: boolean; message?: string };
      } catch {
        // VITE_API_BASE_URL 이 있으면 vite.config에서 dev 플러그인이 생략되어
        // /__ailab/dev/remote-health 가 없을 수 있음 → 브라우저 CORS로 직접 확인
        if (r.status === 404) {
          return probeRemoteHealthDirect(base, remoteName, signal);
        }
        return {
          ok: false,
          message: `remote-health 응답이 올바르지 않습니다 (HTTP ${r.status}).`,
        };
      }
      return {
        ok: !!j.ok,
        message:
          j.message ||
          (j.ok
            ? kind === "render"
              ? "Cloud (Render) API에 연결되었습니다."
              : "Cloud (AWS) API에 연결되었습니다."
            : kind === "render"
              ? "Cloud (Render) 확인 실패"
              : "Cloud (AWS) 확인 실패"),
      };
    } catch (e) {
      return {
        ok: false,
        message: `Vite와 통신하지 못했습니다: ${String(e)}`,
      };
    }
  }


  return probeRemoteHealthDirect(base, remoteName, signal);
}
