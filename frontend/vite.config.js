import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { ailabApiProxyPlugin } from "./vite-plugin-ailab-api-proxy.mjs";
import { ailabDevApiPlugin } from "./vite-plugin-ailab-local-api.mjs";

// Empty VITE_API_BASE_URL => browser uses same-origin `/api`; Vite proxies to:
//   local: VITE_LOCAL_API_URL, render: VITE_API_BASE_URL, aws: VITE_AWS_API_URL.
// Non-empty VITE_API_BASE_URL => browser calls that origin directly (backend must allow CORS).

function normalizeRenderApiBaseForVite(u) {
  const t = (u || "").replace(/\/+$/, "").trim();
  if (!t) return t;
  try {
    const h = new URL(t).hostname.toLowerCase();
    if (
      h === "ai-lab-be.onrender.com" ||
      h === "labapi-backend-k62f.onrender.com"
    ) {
      return "https://ailab-backend.onrender.com";
    }
  } catch {
    /* ignore */
  }
  return t;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT || "5174");
  const renderFromEnv = normalizeRenderApiBaseForVite(env.VITE_API_BASE_URL || "");
  const hasApiBase = !!renderFromEnv;
  const localApi = env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000";
  const awsApi = (env.VITE_AWS_API_URL || "").trim();
  // remote-health·프록시: publicEnv.ts 의 폐기 호스트 보정과 동일
  const renderApi = renderFromEnv;

  return {
    plugins: [
      ...(hasApiBase
        ? []
        : [
            ailabApiProxyPlugin({
              localApiUrl: localApi,
              renderApiUrl: renderApi,
              awsApiUrl: awsApi,
            }),
            ailabDevApiPlugin({
              localApiUrl: localApi,
              awsApiUrl: awsApi,
              renderApiUrl: renderApi,
            }),
          ]),
      react(),
    ],
    server: {
      port: Number.isFinite(devPort) ? devPort : 5174,
      // LAN·다른 호스트명으로 접속할 때도 동작 (기본은 localhost 전용)
      host: true,
    },
    preview: {
      port: Number.isFinite(devPort) ? devPort : 5174,
      host: true,
    },
  };
});
