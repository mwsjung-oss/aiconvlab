import { buildApiUrl, requestJson } from "./api/client";

const TOKEN_KEY = "lab_token";
const ADMIN_PANEL_TOKEN_KEY = "admin_panel_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAdminPanelToken() {
  return localStorage.getItem(ADMIN_PANEL_TOKEN_KEY);
}

export function setAdminPanelToken(token) {
  if (token) localStorage.setItem(ADMIN_PANEL_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_PANEL_TOKEN_KEY);
}

export async function apiJson(path, options = {}) {
  const token = options.omitAuth ? null : getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  return requestJson(path, {
    method: options.method || "GET",
    body: options.body,
    headers,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    authToken: token,
  });
}

export async function apiAdminPanelJson(path, options = {}) {
  const token = getAdminPanelToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  return requestJson(path, {
    method: options.method || "GET",
    body: options.body,
    headers,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    authToken: token,
  });
}

export async function apiDownload(path, filenameHint = "download.bin") {
  const token = getToken();
  const res = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameHint;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
