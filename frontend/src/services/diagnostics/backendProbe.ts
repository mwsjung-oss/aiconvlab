/** 클라우드 Backend 연결 상태 진단(개발 도구 및 배포 검증용). */

export interface ProbeAttempt {
  ok: boolean;
  url: string;
  status: number | null;
}

export interface ProbeBackendSummary {
  ok: boolean;
  lines: string[];
  health: ProbeAttempt;
  db: ProbeAttempt;
}

async function fetchHeadOrGet(path: string, signal?: AbortSignal): Promise<ProbeAttempt> {
  const base = `${window.location.protocol}//${window.location.host}`;
  const u = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const r = await fetch(u, {
      credentials: "include",
      mode: "same-origin",
      signal,
    });
    return { ok: r.ok, url: u, status: r.status };
  } catch {
    return { ok: false, url: u, status: null };
  }
}

/**
 * SPA 가 **상대경로**/동일 호스트 에서 제공될 때: ``/api/health`` 과 ``/api/health/db`` 동일 오리진으로 프로브합니다.
 *
 * 명시적인 클라우드 원격 호스트 검사에는 ``probeRemoteBackend`` 를 사용하세요.
 */
export async function probeSameOriginApiHealth(
  signal?: AbortSignal,
): Promise<ProbeBackendSummary> {
  const health = await fetchHeadOrGet("/api/health", signal);
  const db = await fetchHeadOrGet("/api/health/db", signal);
  const lines = [
    `GET ${health.url} → ${health.status ?? "network"} (${health.ok ? "ok" : "fail"})`,
    `GET ${db.url} → ${db.status ?? "network"} (${db.ok ? "ok" : "fail"})`,
  ];
  const ok = health.ok && db.ok;
  return { ok, lines, health, db };
}

export async function probeRemoteBackend(apiOrigin: string, signal?: AbortSignal): Promise<ProbeBackendSummary> {
  const base = apiOrigin.replace(/\/+$/, "").trim();
  const targetBase = /^https?:\/\//i.test(base) ? base : `https://${base}`;

  async function once(pathSuffix: string): Promise<ProbeAttempt> {
    const u = `${targetBase}${pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`}`;
    try {
      const r = await fetch(u, { credentials: "omit", mode: "cors", signal });
      return { ok: r.ok, url: u, status: r.status };
    } catch {
      return { ok: false, url: u, status: null };
    }
  }

  const health = await once("/api/health");
  const db = await once("/api/health/db");
  const lines = [
    `GET /api/health → ${health.status ?? "network error"} (${health.ok ? "ok" : "fail"}): ${health.url}`,
    `GET /api/health/db → ${db.status ?? "network error"} (${db.ok ? "ok" : "fail"}): ${db.url}`,
  ];
  return { ok: health.ok && db.ok, lines, health, db };
}
