import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { getStoredBackendMode, setStoredBackendMode } from "./api/backendMode";
import "./index.css";

if (typeof localStorage !== "undefined" && getStoredBackendMode() == null) {
  setStoredBackendMode("local");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
