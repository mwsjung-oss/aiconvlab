/**
 * API 클라이언트 진입점 (레거시/경로 호환).
 * 구현은 `client.ts`를 사용합니다.
 */
export {
  apiClient,
  buildApiUrl,
  getJson,
  postJson,
  requestJson,
  uploadFile,
  uploadForm,
} from "./api/client";
