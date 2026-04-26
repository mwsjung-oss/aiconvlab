/**
 * 개발 모드 전용:
 * - 쿠키 ailab_backend_mode=local|lab|aws 에 따라 /api, /history 를 로컬·연구실·Cloud 로 프록시 (브라우저 CORS 회피)
 * - POST /__ailab/dev/start-local-backend → 로컬 uvicorn 자동 기동
 * - GET /__ailab/dev/remote-health?kind=render|aws → Node 에서 원격 /api/health 확인
 */
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../backend");

function trim(u) {
  return (u || "").replace(/\/+$/, "");
}

function portHasListener(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
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

/** LAN 에서 Vite(예: :5174) — 원격/탭으로 접속 시 remote-health 가 Node 쪽에서 Render를 확인 */
function isAllowedDevRemoteClient(req) {
  if (isLocalReq(req)) return true;
  const h = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(
      h,
    )
  )
    return true;
  return false;
}

/** /api/health 가 없거나 404/5xx 일 때 FastAPI 표준 /openapi.json 으로 연결 여부 확인 */
async function probeRemoteBackend(baseUrl, kind = "render") {
  const b = trim(baseUrl);
  const shortLabel = kind === "aws" ? "Cloud (AWS)" : "Cloud (Render)";
  const tryFetch = (path) => fetch(`${b}${path}`, { redirect: "follow" });

  const health = await tryFetch("/api/health");
  if (health.ok) {
    return { ok: true, message: `${shortLabel} API에 연결되었습니다.` };
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
      message: `${shortLabel}: 해당 URL에서 API를 찾을 수 없습니다(404). 주소(${b})·Render/배포 URL이 올바른지 확인하세요.`,
    };
  }
  return {
    ok: false,
    message: `${shortLabel} 응답: health HTTP ${health.status}, openapi HTTP ${openapi.status}. 주소(${b})·경로·배포를 확인하세요.`,
  };
}

export function ailabDevApiPlugin(opts = {}) {
  const awsTarget = trim(opts.awsApiUrl || "");
  const renderTarget = trim(opts.renderApiUrl || "");

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
          const base = kind === "aws" ? awsTarget : renderTarget;
          if (kind === "aws" && !base) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                message: "VITE_AWS_API_URL 이 비어 있습니다. `.env`에 설정하세요.",
              })
            );
            return;
          }
          if (kind === "render" && !base) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: false,
                message:
                  "VITE_API_BASE_URL 이 비어 있습니다. `frontend/.env`에 Cloud Render API 베이스 URL(예: https://ailab-backend.onrender.com)을 넣고 Vite 를 다시 켜 주세요.",
              })
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
                  message: `노트북에서 원격 주소로 접속하지 못했습니다: ${e.message}. VPN·망·IP(${base})를 확인하세요.`,
                })
              );
            }
          })();
          return;
        }

        if (pathOnly.startsWith("/__ailab/dev/start-local-backend")) {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end();
            return;
          }
          if (!isLocalReq(req)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, message: "localhost 전용입니다." }));
            return;
          }

          (async () => {
            const listening = await portHasListener(8000);
            if (listening) {
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  ok: true,
                  already: true,
                  message: "이미 127.0.0.1:8000 에서 API가 수신 중입니다.",
                })
              );
              return;
            }

            const child = spawn(
              "python",
              ["-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
              {
                cwd: backendRoot,
                shell: true,
                detached: true,
                stdio: "ignore",
                windowsHide: true,
              }
            );
            child.unref();
            child.on("error", (err) => {
              console.error("[ailab-dev-api] uvicorn spawn:", err.message);
            });

            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                ok: true,
                started: true,
                message: "로컬 uvicorn 프로세스를 시작했습니다.",
              })
            );
          })().catch((e) => {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, message: String(e?.message || e) }));
          });
          return;
        }

        next();
      });
    },
  };
}
