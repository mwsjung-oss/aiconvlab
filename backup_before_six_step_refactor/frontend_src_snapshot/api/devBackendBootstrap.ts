/** 개발 시 로컬 uvicorn 자동 기동(Vite 플러그인) + 연구실 헬스 확인 */

const trim = (u: string) => u.replace(/\/+$/, "");

function labBase() {
  return trim(import.meta.env.VITE_LAB_API_URL || "http://100.70.20.91:8000");
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

export async function ensureLabBackendReachable(
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string }> {
  if (import.meta.env.DEV) {
    try {
      const r = await fetch("/__ailab/dev/lab-health", { signal });
      const text = await r.text();
      let j: { ok?: boolean; message?: string } = {};
      try {
        j = JSON.parse(text) as { ok?: boolean; message?: string };
      } catch {
        return {
          ok: false,
          message: `lab-health 응답이 올바르지 않습니다 (HTTP ${r.status}).`,
        };
      }
      return {
        ok: !!j.ok,
        message:
          j.message ||
          (j.ok ? "연구실 서버 API에 연결되었습니다." : "연구실 서버 확인 실패"),
      };
    } catch (e) {
      return {
        ok: false,
        message: `Vite와 통신하지 못했습니다: ${String(e)}`,
      };
    }
  }

  const base = labBase();
  try {
    const health = await fetch(`${base}/api/health`, { mode: "cors", signal });
    if (health.ok) {
      return { ok: true, message: "연구실 서버 API에 연결되었습니다." };
    }
    const openapi = await fetch(`${base}/openapi.json`, { mode: "cors", signal });
    if (openapi.ok) {
      return {
        ok: true,
        message:
          health.status === 404
            ? "연구실 FastAPI에 연결되었습니다. (/api/health 없음·OpenAPI로 확인)"
            : "연구실 FastAPI에 연결되었습니다. (/api/health 비정상·OpenAPI로 확인)",
      };
    }
    return {
      ok: false,
      message: `연구실 응답: health HTTP ${health.status}, openapi HTTP ${openapi.status}.`,
    };
  } catch {
    return {
      ok: false,
      message:
        "연구실 서버에 연결할 수 없습니다. VPN·망·방화벽과 서버 기동 여부를 확인하세요.",
    };
  }
}
