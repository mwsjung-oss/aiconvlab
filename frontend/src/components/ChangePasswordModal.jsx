import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../api.js";

export default function ChangePasswordModal({ open, onClose }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const reset = useCallback(() => {
    setCurrentPw("");
    setNewPw("");
    setNewPw2("");
    setErr(null);
    setMsg(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  if (!open) return null;

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (newPw !== newPw2) {
      setErr("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPw === currentPw) {
      setErr("새 비밀번호는 기존 비밀번호와 달라야 합니다.");
      return;
    }
    setLoading(true);
    try {
      const r = await apiJson("/api/auth/change-password", {
        method: "POST",
        body: {
          current_password: currentPw,
          new_password: newPw,
        },
      });
      setMsg(r?.message || "비밀번호가 변경되었습니다.");
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="admin-panel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      onClick={onClose}
    >
      <div
        className="admin-panel-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-panel-modal-header">
          <h2 id="change-password-title" className="admin-panel-modal-title">
            비밀번호 변경
          </h2>
          <button type="button" className="admin-panel-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <form className="admin-panel-form" onSubmit={onSubmit}>
          <p className="hint">현재 비밀번호와 새 비밀번호(8자 이상)를 입력하세요.</p>
          {err && <div className="auth-error">{err}</div>}
          {msg && <div className="auth-success">{msg}</div>}
          <label>
            현재 비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
            />
          </label>
          <label>
            새 비밀번호
            <input
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              autoComplete="new-password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "처리 중…" : "변경"}
          </button>
        </form>
      </div>
    </div>
  );
}
