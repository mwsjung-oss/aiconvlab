import { useState } from "react";
import { apiJson } from "../api";
import BackendModeToggle from "../components/BackendModeToggle";
import { useAuth } from "../AuthContext";

export default function LoginPage({ onSwitchRegister }) {
  const { setToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const data = await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setToken(data.access_token);
    } catch (ex) {
      const m = ex?.message || String(ex);
      const netFail =
        /failed to fetch|networkerror|load failed|fetch|연결|aborted/i.test(m) ||
        ex?.name === "TypeError";
      if (m === "Not Found" || netFail) {
        setErr(
          "백엔드에 연결할 수 없습니다. 위에서 선택한 환경에 맞게 서버가 떠 있는지 확인하세요. 로컬: `npm run dev:stack` 또는 uvicorn. 연구실: 해당 서버·네트워크·CORS 설정."
        );
      } else {
        setErr(m);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-panel-below-nav">
      <div className="auth-card auth-card--compact">
        <form className="auth-form" onSubmit={submit}>
          <BackendModeToggle
            disabled={submitting}
            onReadyChange={setApiReady}
          />
          <label>
            이메일
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {err && <div className="auth-error">{err}</div>}
          <button
            type="submit"
            className="auth-submit"
            disabled={submitting || !apiReady}
          >
            {submitting ? "처리 중…" : "로그인"}
          </button>
        </form>
        <button
          type="button"
          className="auth-link"
          onClick={onSwitchRegister}
        >
          회원가입
        </button>
        <p className="auth-hint auth-hint-below-register">
          회원 가입은 이메일 인증 및 관리자 승인을 통해 가입됩니다.
        </p>
      </div>
    </div>
  );
}
