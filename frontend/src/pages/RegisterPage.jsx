import { useState } from "react";
import { apiJson } from "../api";
import BackendModeToggle from "../components/BackendModeToggle";
import { mapAuthRequestError } from "../utils/mapAuthRequestError";

export default function RegisterPage({ onSwitchLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiReady, setApiReady] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setDone(null);
    setSubmitting(true);
    try {
      const data = await apiJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: fullName.trim() || null,
        }),
      });
      setDone(data.message);
    } catch (ex) {
      setErr(mapAuthRequestError(ex));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-panel-below-nav">
      <div className="auth-card">
        <h1 className="auth-title">회원가입</h1>
        <p className="auth-hint">
          가입 후 이메일로 발송된 링크로 본인 확인을 하고, 관리자 승인 후
          이용할 수 있습니다.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <BackendModeToggle
            disabled={submitting}
            onReadyChange={setApiReady}
          />
          <label>
            이름 (선택)
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
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
            비밀번호 (8자 이상)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {err && <div className="auth-error">{err}</div>}
          {done && <div className="auth-success">{done}</div>}
          <button
            type="submit"
            className="auth-submit"
            disabled={submitting || !apiReady}
          >
            {submitting ? "처리 중…" : "가입 요청"}
          </button>
        </form>
        <button type="button" className="auth-link" onClick={onSwitchLogin}>
          로그인으로
        </button>
      </div>
    </div>
  );
}
