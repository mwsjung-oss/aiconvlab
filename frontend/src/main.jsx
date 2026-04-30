import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { getStoredBackendMode, setStoredBackendMode } from "./api/backendMode";
import { validateOperationalApiEnvironment } from "./services/config/apiBaseValidation";
import "./index.css";

if (typeof localStorage !== "undefined" && getStoredBackendMode() == null) {
  setStoredBackendMode("cloud");
}

const prodApiIssues = validateOperationalApiEnvironment();
const bootstrapOk = prodApiIssues.ok;
const bootstrapErrors = [...prodApiIssues.errors];

function FatalOperationalConfig() {
  if (bootstrapOk) return null;
  const text = bootstrapErrors.join("\n");
  console.error("[APS Frontend 설정 오류]", text);
  return (
    <div
      style={{
        padding: 24,
        fontFamily:
          '"Pretendard", system-ui, "Segoe UI", sans-serif',
        backgroundColor: "#2b0f0f",
        color: "#ffc9c9",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 18, margin: "0 0 16px", color: "#fff" }}>
        APS Frontend 환경 설정 오류 (VITE_API_BASE_URL)
      </h1>
      <p style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: 0 }}>{text}</p>
      <p style={{ fontSize: 12, opacity: 0.9, marginTop: 24 }}>
        AWS Amplify / CI 에 `VITE_API_BASE_URL` 이 Elastic Beanstalk 공개 Backend HTTPS 원본으로
        설정되었는지 확인하세요. (과거 Render/Cloudflare 운영은 docs/cloudflare-render-retirement.md)
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {!bootstrapOk && import.meta.env.PROD ? (
      <FatalOperationalConfig />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>,
);
