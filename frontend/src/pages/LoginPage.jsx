import { useState } from "react";
import { apiJson } from "../api";
import BackendModeToggle from "../components/BackendModeToggle";
import { useAuth } from "../AuthContext";
import { mapAuthRequestError } from "../utils/mapAuthRequestError";

/** 로그인 API: POST /api/auth/login, Content-Type application/json, { email, password } */
function formatLoginFailureMessage(ex) {
  const status = ex?.status;
  const body = ex?.responseBody;
  if (status !== undefined && status !== null) {
    const bodyText =
      body === undefined || body === null
        ? "(본문 없음)"
        : typeof body === "string"
          ? body
          : JSON.stringify(body, null, 2);
    return `HTTP ${status}\n${bodyText}`;
  }
  return mapAuthRequestError(ex);
}

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
        headers: { "Content-Type": "application/json" },
        body: { email: email.trim(), password },
      });
      setToken(data.access_token);
    } catch (ex) {
      const status = ex?.status;
      const responseBody =
        ex?.responseBody !== undefined ? ex.responseBody : null;
      if (status !== undefined && status !== null) {
        console.error("[LOGIN 실패]", {
          statusCode: status,
          responseBody,
        });
      } else {
        console.error("[LOGIN 실패]", {
          statusCode: "(응답 없음)",
          responseBody: null,
          message: ex?.message || String(ex),
        });
      }
      setErr(formatLoginFailureMessage(ex));
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
          {err && (
            <div className="auth-error" style={{ whiteSpace: "pre-wrap" }}>
              {err}
            </div>
          )}
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
