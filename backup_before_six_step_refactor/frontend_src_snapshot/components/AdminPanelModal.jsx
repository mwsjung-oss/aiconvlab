import { useCallback, useEffect, useState } from "react";
import { postJson } from "../api/client";
import {
  apiAdminPanelJson,
  getAdminPanelToken,
  setAdminPanelToken,
} from "../api";
import { isPrivilegedRole } from "../roles.js";

export default function AdminPanelModal({ open, onClose }) {
  const [step, setStep] = useState("password"); // password | main
  const [password, setPassword] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const loadUsers = useCallback(async () => {
    const data = await apiAdminPanelJson("/api/admin-panel/users");
    setUsers(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (!open) {
      setStep("password");
      setPassword("");
      setErr(null);
      setMsg(null);
      return;
    }
    const t = getAdminPanelToken();
    if (t) {
      setStep("main");
      setLoading(true);
      loadUsers()
        .catch((e) => {
          setErr(e.message);
          setAdminPanelToken(null);
          setStep("password");
        })
        .finally(() => setLoading(false));
    } else {
      setStep("password");
    }
  }, [open, loadUsers]);

  async function handleLogin(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const body = await postJson("/api/admin-panel/login", { password });
      setAdminPanelToken(body.access_token);
      setPassword("");
      setStep("main");
      await loadUsers();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }

  async function approve(id) {
    setErr(null);
    setMsg(null);
    try {
      const r = await apiAdminPanelJson(`/api/admin-panel/users/${id}/approve`, {
        method: "POST",
      });
      setMsg(r.message);
      await loadUsers();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function withdraw(id) {
    if (!window.confirm("이 회원을 탈퇴(삭제) 처리합니다. 계속할까요?")) return;
    setErr(null);
    setMsg(null);
    try {
      const r = await apiAdminPanelJson(`/api/admin-panel/users/${id}`, {
        method: "DELETE",
      });
      setMsg(r.message);
      await loadUsers();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (newPw !== newPw2) {
      setErr("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    try {
      const r = await apiAdminPanelJson("/api/admin-panel/change-password", {
        method: "POST",
        body: JSON.stringify({
          old_password: oldPw,
          new_password: newPw,
        }),
      });
      setMsg(r.message);
      setOldPw("");
      setNewPw("");
      setNewPw2("");
    } catch (e) {
      setErr(e.message);
    }
  }

  function handleLogoutPanel() {
    setAdminPanelToken(null);
    setStep("password");
    setUsers([]);
    setMsg(null);
  }

  if (!open) return null;

  const pending = users.filter(
    (u) =>
      !isPrivilegedRole(u.role) &&
      u.is_email_verified &&
      !u.is_admin_approved
  );
  const joined = users.filter(
    (u) => !isPrivilegedRole(u.role) && u.is_admin_approved
  );

  return (
    <div
      className="admin-panel-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="admin-panel-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-panel-modal-header">
          <h2 className="admin-panel-modal-title">관리자</h2>
          <button
            type="button"
            className="admin-panel-close"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        {step === "password" && (
          <form className="admin-panel-form" onSubmit={handleLogin}>
            <p className="hint">관리자 패널 비밀번호를 입력하세요.</p>
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
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? "확인 중…" : "확인"}
            </button>
          </form>
        )}

        {step === "main" && (
          <div className="admin-panel-body">
            {err && <div className="auth-error">{err}</div>}
            {msg && <div className="auth-success">{msg}</div>}
            {loading && !users.length ? (
              <p className="hint">불러오는 중…</p>
            ) : (
              <>
                <section className="admin-panel-section">
                  <h3>승인 대기 (이메일 인증 완료)</h3>
                  {pending.length === 0 ? (
                    <p className="hint">대기 중인 신청이 없습니다.</p>
                  ) : (
                    <ul className="admin-panel-list">
                      {pending.map((u) => (
                        <li key={u.id}>
                          <span>
                            <strong>{u.email}</strong>
                            {u.full_name ? ` · ${u.full_name}` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => approve(u.id)}
                          >
                            승인
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="admin-panel-section">
                  <h3>가입 완료 회원 (탈퇴)</h3>
                  {joined.length === 0 ? (
                    <p className="hint">해당 회원이 없습니다.</p>
                  ) : (
                    <ul className="admin-panel-list">
                      {joined.map((u) => (
                        <li key={u.id}>
                          <span>
                            <strong>{u.email}</strong>
                            {u.full_name ? ` · ${u.full_name}` : ""}
                          </span>
                          <button
                            type="button"
                            className="admin-panel-btn-danger"
                            onClick={() => withdraw(u.id)}
                          >
                            탈퇴
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="admin-panel-section">
                  <h3>패널 비밀번호 변경</h3>
                  <form className="admin-panel-form" onSubmit={changePassword}>
                    <label>
                      기존 비밀번호
                      <input
                        type="password"
                        value={oldPw}
                        onChange={(e) => setOldPw(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      새 비밀번호 (8자 이상)
                      <input
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        minLength={8}
                        required
                      />
                    </label>
                    <label>
                      새 비밀번호 확인
                      <input
                        type="password"
                        value={newPw2}
                        onChange={(e) => setNewPw2(e.target.value)}
                        minLength={8}
                        required
                      />
                    </label>
                    <button type="submit" className="auth-submit">
                      비밀번호 변경
                    </button>
                  </form>
                </section>

                <div className="admin-panel-footer-actions">
                  <button type="button" onClick={() => loadUsers()}>
                    목록 새로고침
                  </button>
                  <button type="button" onClick={handleLogoutPanel}>
                    패널 로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
