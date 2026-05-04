/**
 * 개발 모드 전용:
 * GET /__ailab/dev/remote-health?kind=render|aws → Node 에서 원격 /api/health 확인
 * kind=render → VITE_API_BASE_URL , kind=aws → VITE_AWS_API_URL
 */
function trim(u) {
  return (u || "").replace(/\/+$/, "");
}

function isLocalReq(req) {
  const h = req.socket?.remoteAddress || "";
  return (
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "::ffff:127.0.0.1" ||
    h.endsWith("127.0.0.1")
  );
}

function isAllowedDevRemoteClient(req) {
  if (isLocalReq(req)) return true;
  const h = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(
      h,
    )
  )
    return true;
  return false;
}

async function probeRemoteBackend(baseUrl, kind = "render") {
  const b = trim(baseUrl);
  const shortLabel =
    kind === "aws" ? "Cloud (AWS, VITE_AWS_API_URL)" : "공개 API (VITE_API_BASE_URL)";
  const tryFetch = (path) => fetch(`${b}${path}`, { redirect: "follow" });

  const health = await tryFetch("/api/health");
  if (health.ok) {
    return { ok: true, message: `${shortLabel}에 연결되었습니다.` };
  }

  const openapi = await tryFetch("/openapi.json");
  if (openapi.ok) {
    return {
      ok: true,
      message:
        health.status === 404
          ? `${shortLabel} FastAPI에 연결되었습니다. (/api/health 없음·OpenAPI로 확인)`
          : `${shortLabel} FastAPI에 연결되었습니다. (/api/health 비정상·OpenAPI로 확인)`,
    };
  }

  if (health.status === 404 && openapi.status === 404) {
    return {
      ok: false,
      message: `${shortLabel}: 해당 URL에서 API를 찾을 수 없습니다(404). 주소(${b})·배포 URL이 올바른지 확인하세요.`,
    };
  }
  return {
    ok: false,
    message: `${shortLabel} 응답: health HTTP ${health.status}, openapi HTTP ${openapi.status}. 주소(${b})·경로·배포를 확인하세요.`,
  };
}

export function ailabDevApiPlugin(opts = {}) {
  const awsTarget = trim(opts.awsApiUrl || "");
  const remoteTarget = trim(opts.remoteApiUrl || opts.renderApiUrl || "");

  return {
    name: "ailab-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        const pathOnly = url.split("?")[0];

        if (pathOnly.startsWith("/__ailab/dev/remote-health") && req.method === "GET") {
          if (!isAllowedDevRemoteClient(req)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                message: "Vite dev remote-health — 로컬·같은 LAN 클라이언트만 사용할 수 있습니다.",
              }),
            );
            return;
          }
          const u = new URL(url, "http://vite.local");
          const k = (u.searchParams.get("kind") || "render").toLowerCase();
          const kind = k === "aws" || k === "render" ? k : "render";
          const base = kind === "aws" ? awsTarget : remoteTarget;
          if (kind === "aws" && !base) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                message: "VITE_AWS_API_URL 이 비어 있습니다. `.env`에 설정하세요.",
              }),
            );
            return;
          }
          if (kind === "render" && !base) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                message:
                  "VITE_API_BASE_URL 이 비어 있습니다. 개발 프록시 테스트 시 `frontend/.env` 에 EB 공개 API 베이스 URL(https) 을 설정하세요.",
              }),
            );
            return;
          }
          (async () => {
            try {
              const result = await probeRemoteBackend(base, kind);
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ ok: result.ok, message: result.message }));
            } catch (e) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  ok: false,
                  message: `개발 서버(Node)에서 원격 주소로 접속하지 못했습니다: ${e.message}. VPN·망·IP(${base})를 확인하세요.`,
                }),
              );
            }
          })();
          return;
        }

        next();
      });
    },
  };
}
