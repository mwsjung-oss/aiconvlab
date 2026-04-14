import { getResolvedApiBase } from "./backendMode";

const DEFAULT_TIMEOUT_MS =
  Number(import.meta.env.VITE_API_TIMEOUT_MS || "") || 20000;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  signal?: AbortSignal;
  authToken?: string | null;
}

export interface ApiErrorShape {
  detail?: unknown;
  message?: unknown;
}

export function buildApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  const base = getResolvedApiBase();
  return base ? `${base}${path}` : path;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      controller.abort();
      reject(new Error("요청 시간이 초과되었습니다."));
    }, timeoutMs);
    promise
      .then((v) => {
        clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

export async function requestJson<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const method: HttpMethod = options.method || "GET";
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }
  const signal = controller.signal;

  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };

  let body = options.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (!isFormData && body != null && typeof body === "object") {
    headers["Content-Type"] =
      headers["Content-Type"] || "application/json";
    body = JSON.stringify(body);
  }

  if (options.authToken) {
    headers["Authorization"] = `Bearer ${options.authToken}`;
  }

  const url = buildApiUrl(path);

  const doFetch = fetch(url, {
    method,
    body,
    headers,
    signal,
  });

  const res = await withTimeout(
    doFetch,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    controller
  );

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text || res.statusText };
  }

  if (!res.ok) {
    const shape = data as ApiErrorShape;
    const detail = shape?.detail ?? shape?.message ?? res.statusText;
    const msg =
      typeof detail === "string" ? detail : JSON.stringify(detail);
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return data as T;
}

export async function getJson<T = any>(
  path: string,
  options: Omit<RequestOptions, "method" | "body"> = {}
): Promise<T> {
  return requestJson<T>(path, { ...options, method: "GET" });
}

export async function postJson<T = any>(
  path: string,
  body?: any,
  options: Omit<RequestOptions, "method" | "body"> = {}
): Promise<T> {
  return requestJson<T>(path, { ...options, method: "POST", body });
}

export async function uploadForm<T = any>(
  path: string,
  formData: FormData,
  options: Omit<RequestOptions, "method" | "body" | "headers"> = {}
): Promise<T> {
  return requestJson<T>(path, {
    ...options,
    method: "POST",
    body: formData,
  });
}

export async function uploadFile<T = any>(
  path: string,
  fieldName: string,
  file: File,
  extraFields: Record<string, string> = {},
  options: Omit<RequestOptions, "method" | "body" | "headers"> = {}
): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file);
  Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));
  return uploadForm<T>(path, formData, options);
}

export const apiClient = {
  requestJson,
  getJson,
  postJson,
  uploadForm,
  uploadFile,
};

