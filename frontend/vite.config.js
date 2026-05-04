import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { ailabApiProxyPlugin } from "./vite-plugin-ailab-api-proxy.mjs";
import { ailabDevApiPlugin } from "./vite-plugin-ailab-local-api.mjs";

// Empty VITE_API_BASE_URL => browser uses same-origin `/api`; Vite proxies to:
//   local: VITE_LOCAL_API_URL, public API: VITE_API_BASE_URL / VITE_AWS_API_URL.
// Non-empty VITE_API_BASE_URL => browser calls that origin directly (backend must allow CORS).

function trimApiBase(u) {
  return (u || "").replace(/\/+$/, "").trim();
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(env.VITE_DEV_PORT || "5174");
  const publicFromEnv = trimApiBase(env.VITE_API_BASE_URL || "");
  const hasApiBase = !!publicFromEnv;
  const localApi = env.VITE_LOCAL_API_URL || "http://127.0.0.1:8000";
  const awsApi = (env.VITE_AWS_API_URL || "").trim();

  return {
    plugins: [
      ...(hasApiBase
        ? []
        : [
            ailabApiProxyPlugin({
              localApiUrl: localApi,
              remoteApiUrl: publicFromEnv,
              awsApiUrl: awsApi,
            }),
            ailabDevApiPlugin({
              localApiUrl: localApi,
              awsApiUrl: awsApi,
              remoteApiUrl: publicFromEnv,
            }),
          ]),
      react(),
    ],
    server: {
      port: Number.isFinite(devPort) ? devPort : 5174,
      host: true,
    },
    preview: {
      port: Number.isFinite(devPort) ? devPort : 5174,
      host: true,
    },
  };
});
