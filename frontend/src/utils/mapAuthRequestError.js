/**
 * 로그인/가입 등 인증 API 실패 시 사용자-facing 메시지.
 * HTTP 404는 네트워크 실패와 구분해 Render·URL 설정 문제를 안내한다.
 */
export function mapAuthRequestError(ex) {
  const m = ex?.message || String(ex);
  const status = ex?.status;
  const netFail =
    /failed to fetch|networkerror|load failed|fetch|연결|aborted/i.test(m) ||
    ex?.name === "TypeError";
  if (status === 404 || m === "Not Found") {
    return (
      "API 주소에서 서비스를 찾을 수 없습니다(HTTP 404). " +
      "Render 대시보드에서 웹 서비스가 배포·기동 중인지 확인하고, " +
      "프론트 빌드(Cloudflare Pages 등)의 VITE_API_BASE_URL이 백엔드 공개 URL과 일치하는지 맞추세요."
    );
  }
  if (netFail) {
    return (
      "백엔드에 연결할 수 없습니다. 위에서 선택한 환경에 맞게 서버가 떠 있는지 확인하세요. " +
      "로컬: `npm run dev:stack` 또는 uvicorn. 연구실: 해당 서버·네트워크·CORS 설정."
    );
  }
  return m;
}
