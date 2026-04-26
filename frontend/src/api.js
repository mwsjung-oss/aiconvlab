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
  const requestUrl = buildApiUrl(path);
  let res;
  try {
    res = await fetch(requestUrl, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[API 요청 실패]", {
      url: requestUrl,
      status: "(응답 없음)",
      message,
    });
    throw e;
  }
  if (!res.ok) {
    const text = await res.text();
    const message = text || res.statusText;
    console.error("[API 요청 실패]", {
      url: requestUrl,
      status: res.status,
      message,
    });
    throw new Error(message);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filenameHint;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
