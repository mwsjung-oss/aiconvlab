import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { ailabApiProxyPlugin } from "./vite-plugin-ailab-api-proxy.mjs";
import { ailabDevApiPlugin } from "./vite-plugin-ailab-local-api.mjs";

// Empty VITE_API_BASE_URL => browser uses same-origin `/api`; Vite proxies to:
//   local: VITE_LOCAL_API_URL, render: VITE_API_BASE_URL, aws: VITE_AWS_API_URL.
// Non-empty VITE_API_BASE_URL => browser calls that origin directly (backend must allow CORS).

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT || "5174");
  const hasApiBase = !!(env.VITE_API_BASE_URL || "").trim();
  const localApi = env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000";
  const awsApi = (env.VITE_AWS_API_URL || "").trim();
  // remote-health?kind=render (개발)에서 Node→Render 를 확인할 때 씁니다(값 없으면 Vite 쪽에 안내만).
  const renderApi = (env.VITE_API_BASE_URL || "").trim();

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
