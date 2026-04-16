/** 개발 시 로컬 uvicorn 자동 기동(Vite 플러그인) + 연구실 헬스 확인 */

import {
  getAwsApiBaseWithOverride,
  getLabApiBaseWithOverride,
  getPublicApiBaseUrl,
} from "../config/publicEnv";

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

function labBase() {
  return trim(getLabApiBaseWithOverride());
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
  return {
    ok: false,
    message: `${remoteName}에 연결할 수 없습니다 (${lastErr}). VPN·망·방화벽·서버 기동을 확인하세요.`,
  };
}

function awsBase() {
  return trim(getAwsApiBaseWithOverride());
}

function renderBase() {
  return trim(getPublicApiBaseUrl());
}

/** Vite dev 전용: 로컬 백엔드가 없으면 서버가 uvicorn 을 띄운 뒤 /api/health 까지 대기 */
export async function ensureLocalBackendReady(
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  if (!import.meta.env.DEV) {
    return {
      ok: true,
      message: "배포 빌드에서는 백엔드를 서버에서 직접 실행하세요.",
    };
  }

  try {
    const r = await fetch("/__ailab/dev/start-local-backend", {
      method: "POST",
      signal,
    });
    const text = await r.text();
    let j: { ok?: boolean; message?: string } = {};
    try {
      j = JSON.parse(text) as { ok?: boolean; message?: string };
    } catch {
      return {
        ok: false,
        message: `Vite 응답이 올바르지 않습니다 (HTTP ${r.status}).`,
      };
    }
    if (!j.ok) {
      return { ok: false, message: j.message || "로컬 API 시작 요청이 거부되었습니다." };
    }
  } catch (e) {
    return {
      ok: false,
      message: `Vite 개발 서버와 통신하지 못했습니다. \`npm run dev\` 로 프론트를 띄웠는지 확인하세요. (${String(e)})`,
    };
  }

  for (let i = 0; i < 90; i++) {
    if (signal?.aborted) {
      return { ok: false, message: "취소되었습니다." };
    }
    try {
      const h = await fetch("/api/health", { signal });
      if (h.ok) {
        return { ok: true, message: "로컬 백엔드가 준비되었습니다." };
      }
    } catch {
      /* retry */
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  return {
    ok: false,
    message:
      "로컬 백엔드가 응답하지 않습니다. `backend`에서 Python·의존성(uvicorn)을 확인하세요.",
  };
}

export async function ensureRemoteBackendReachable(
  kind: "lab" | "render" | "aws",
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  if (kind === "render" && !renderBase()) {
    return {
      ok: false,
      message: "VITE_API_BASE_URL 이 비어 있습니다. `.env`에 Render API 베이스 URL을 설정하세요.",
    };
  }
  if (kind === "aws" && !awsBase()) {
    return {
      ok: false,
      message: "VITE_AWS_API_URL 이 비어 있습니다. `.env`에 Cloud API 베이스 URL을 설정하세요.",
    };
  }


  if (kind === "lab" && !labBase()) {
    return {
      ok: false,
      message:
        "연구실 API 주소가 비어 있습니다. 아래 입력란에 저장하거나 `.env`의 VITE_LAB_API_URL 을 설정하세요.",
    };
  }

  const base = kind === "lab" ? labBase() : kind === "render" ? renderBase() : awsBase();
  const remoteName =
    kind === "lab" ? "연구실" : kind === "render" ? "Cloud (Render)" : "Cloud (AWS)";

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
            ? kind === "lab"
              ? "연구실 서버 API에 연결되었습니다."
              : kind === "render"
                ? "Cloud (Render) API에 연결되었습니다."
                : "Cloud (AWS) API에 연결되었습니다."
            : kind === "lab"
              ? "연구실 서버 확인 실패"
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

  if (!base) {
    return {
      ok: false,
      message: `${remoteName} API 베이스 URL이 비어 있습니다.`,
    };
  }

  return probeRemoteHealthDirect(base, remoteName, signal);
}
