import { getApiTimeoutMs } from "../config/publicEnv";
import { getResolvedApiBase } from "../runtime/backendMode";

const DEFAULT_TIMEOUT_MS = getApiTimeoutMs();

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

function logApiFailure(
  url: string,
  status: number | undefined,
  message: string
): void {
  console.error("[API 요청 실패]", {
    url,
    status: status ?? "(응답 없음)",
    message,
  });
}

export function buildApiUrl(path: string): string {
  const trimmedPath = String(path ?? "").trim();
  if (!trimmedPath) {
    throw new Error(
      "API 경로가 비어 있습니다. base URL만 호출하지 말고 `/api/...` 등 명시적 endpoint를 사용하세요."
    );
  }
  if (!trimmedPath.startsWith("/")) return trimmedPath;
  path = trimmedPath;
  const base = getResolvedApiBase();
  if (!base) return path;
  const trimmedBase = base.replace(/\/+$/, "");
  const qIdx = path.indexOf("?");
  const hIdx = path.indexOf("#");
  const splitIdx =
    qIdx === -1
      ? hIdx
      : hIdx === -1
        ? qIdx
        : Math.min(qIdx, hIdx);
  const pathOnly = splitIdx === -1 ? path : path.slice(0, splitIdx);
  const suffix = splitIdx === -1 ? "" : path.slice(splitIdx);

  // base URL이 이미 /api 또는 /history로 끝나면 동일 prefix를 중복 결합하지 않습니다.
  if (/\/api$/i.test(trimmedBase) && /^\/api(?:\/|$)/i.test(pathOnly)) {
    return `${trimmedBase}${pathOnly.slice(4)}${suffix}`;
  }
  if (/\/history$/i.test(trimmedBase) && /^\/history(?:\/|$)/i.test(pathOnly)) {
    return `${trimmedBase}${pathOnly.slice(8)}${suffix}`;
  }
  return `${trimmedBase}${pathOnly}${suffix}`;
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

  let res: Response;
  try {
    res = await withTimeout(
      doFetch,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      controller
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      e instanceof TypeError ||
      /failed to fetch|networkerror|load failed/i.test(msg)
    ) {
      const friendly =
        "서버에 연결하지 못했습니다(Failed to fetch). " +
        "로컬 모드면 백엔드(uvicorn)가 켜져 있고 `npm run dev` 또는 `vite preview`로 " +
        "같은 주소·포트에서 프론트를 연 뒤 다시 시도하세요. " +
        "다른 도메인에 API만 둔 배포라면 빌드 시 VITE_API_BASE_URL 을 설정해야 합니다.";
      logApiFailure(url, undefined, friendly);
      throw new Error(friendly);
    }
    logApiFailure(url, undefined, msg);
    throw e;
  }

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
    logApiFailure(url, res.status, msg);
    const err = new Error(msg) as Error & {
      status?: number;
      responseBody?: unknown;
    };
    err.status = res.status;
    err.responseBody = data;
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

