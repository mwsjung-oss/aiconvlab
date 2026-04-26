/**
 * /api, /history → 백엔드 (http-proxy-middleware, 스트리밍·multipart 안정적)
 * dev 서버 + vite preview 둘 다 동일 프록시 (LAN에서 preview 시 Failed to fetch 방지)
 * 쿠키 `ailab_backend_mode`: local | render | aws (연구실 lab 모드 제거)
 */
import { createProxyMiddleware } from "http-proxy-middleware";

function trim(u) {
  return (u || "").replace(/\/+$/, "");
}

function cookieMode(cookieHeader) {
  const m = /(?:^|;\s*)ailab_backend_mode=(local|render|aws)(?:;|$)/.exec(
    cookieHeader || ""
  );
  return m ? m[1] : "local";
}

function renderModeMissingUrlGuard(opts) {
  const renderTarget = trim(opts.renderApiUrl || "");
  return (req, res, next) => {
    const pathOnly = (req.url || "").split("?")[0];
    if (!pathOnly.startsWith("/api") && !pathOnly.startsWith("/history")) {
      return next();
    }
    if (cookieMode(req.headers.cookie || "") === "render" && !renderTarget) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          detail:
            "Render 모드인데 VITE_API_BASE_URL 이 비어 있습니다. frontend/.env 를 확인하세요.",
        })
      );
      return;
    }
    next();
  };
}

function awsModeMissingUrlGuard(opts) {
  const awsTarget = trim(opts.awsApiUrl || "");
  return (req, res, next) => {
    const pathOnly = (req.url || "").split("?")[0];
    if (!pathOnly.startsWith("/api") && !pathOnly.startsWith("/history")) {
      return next();
    }
    if (cookieMode(req.headers.cookie || "") === "aws" && !awsTarget) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          detail:
            "Cloud (AWS) 모드인데 VITE_AWS_API_URL 이 비어 있습니다. frontend/.env 를 확인하세요.",
        })
      );
      return;
    }
    next();
  };
}

function buildProxy(opts) {
  const localTarget = trim(opts.localApiUrl || "http://127.0.0.1:8000");
  const renderTarget = trim(opts.renderApiUrl || "");
  const awsTarget = trim(opts.awsApiUrl || "");

  return createProxyMiddleware({
    target: localTarget,
    changeOrigin: true,
    secure: false,
    pathFilter: (pathname) =>
      pathname.startsWith("/api") || pathname.startsWith("/history"),
    router: (req) => {
      const mode = cookieMode(req.headers.cookie || "");
      if (mode === "render") return renderTarget || localTarget;
      if (mode === "aws") return awsTarget || localTarget;
      return localTarget;
    },
    proxyTimeout: 300_000,
    timeout: 300_000,
    on: {
      error: (err, _req, res) => {
        if (res.writableEnded || res.headersSent) return;
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            detail: `API 프록시 오류: ${err?.message || String(err)}`,
          })
        );
      },
    },
  });
}

export function ailabApiProxyPlugin(opts = {}) {
  return {
    name: "ailab-api-proxy",
    configureServer(server) {
      server.middlewares.use(renderModeMissingUrlGuard(opts));
      server.middlewares.use(awsModeMissingUrlGuard(opts));
      server.middlewares.use(buildProxy(opts));
    },
    configurePreviewServer(server) {
      server.middlewares.use(renderModeMissingUrlGuard(opts));
      server.middlewares.use(awsModeMissingUrlGuard(opts));
      server.middlewares.use(buildProxy(opts));
    },
  };
}
