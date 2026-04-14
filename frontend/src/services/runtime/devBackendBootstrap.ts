/** 개발 시 로컬 uvicorn 자동 기동(Vite 플러그인) + 연구실 헬스 확인 */

import {
  getAwsApiUrl,
  getLabApiUrlWithLegacyFallback,
  getPublicApiBaseUrl,
} from "../config/publicEnv";

const trim = (u: string) => u.replace(/\/+$/, "");

function labBase() {
  return trim(getLabApiUrlWithLegacyFallback());
}

function awsBase() {
  return trim(getAwsApiUrl());
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
        "연구실 API 주소가 비어 있습니다. `.env`에 VITE_LAB_API_URL(또는 VITE_DEV_PROXY_TARGET)을 설정하세요.",
    };
  }
  if (import.meta.env.DEV) {
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

  const base = kind === "lab" ? labBase() : kind === "render" ? renderBase() : awsBase();
  const remoteName =
    kind === "lab" ? "연구실" : kind === "render" ? "Cloud (Render)" : "Cloud (AWS)";
  try {
    const health = await fetch(`${base}/api/health`, { mode: "cors", signal });
    if (health.ok) {
      return { ok: true, message: `${remoteName} API에 연결되었습니다.` };
    }
    const openapi = await fetch(`${base}/openapi.json`, { mode: "cors", signal });
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
  } catch {
    return {
      ok: false,
      message: `${remoteName}에 연결할 수 없습니다. VPN·망·방화벽과 서버 기동 여부를 확인하세요.`,
    };
  }
}
