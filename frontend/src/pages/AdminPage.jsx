import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "../api";
import { isPrivilegedRole } from "../roles.js";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [filterUserId, setFilterUserId] = useState("");
  const filterRef = useRef(filterUserId);
  filterRef.current = filterUserId;
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");
  const [editingAnnId, setEditingAnnId] = useState(null);
  const [annSaving, setAnnSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    const data = await apiJson("/api/admin/users");
    setUsers(Array.isArray(data) ? data : []);
  }, []);

  const loadActivities = useCallback(async () => {
    const id = filterRef.current.trim();
    const q =
      id === "" ? "" : `?user_id=${encodeURIComponent(id)}`;
    const data = await apiJson(`/api/admin/activities${q}`);
    setActivities(Array.isArray(data) ? data : []);
  }, []);

  const loadAnnouncements = useCallback(async () => {
    const data = await apiJson("/api/admin/announcements");
    setAnnouncements(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    setErr(null);
    setLoading(true);
    Promise.all([loadUsers(), loadActivities(), loadAnnouncements()])
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [loadUsers, loadActivities, loadAnnouncements]);

  async function approve(id) {
    setErr(null);
    try {
      await apiJson(`/api/admin/users/${id}/approve`, { method: "POST" });
      await loadUsers();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function suspend(id) {
    setErr(null);
    try {
      await apiJson(`/api/admin/users/${id}/suspend`, { method: "POST" });
      await loadUsers();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function activate(id) {
    setErr(null);
    try {
      await apiJson(`/api/admin/users/${id}/activate`, { method: "POST" });
      await loadUsers();
    } catch (e) {
      setErr(e.message);
    }
  }

  function resetAnnForm() {
    setAnnTitle("");
    setAnnContent("");
    setEditingAnnId(null);
  }

  async function saveAnnouncement(e) {
    e.preventDefault();
    setErr(null);
    const title = annTitle.trim();
    if (!title) {
      setErr("공지 제목을 입력하세요.");
      return;
    }
    setAnnSaving(true);
    try {
      if (editingAnnId != null) {
        await apiJson(`/api/admin/announcements/${editingAnnId}`, {
          method: "PATCH",
          body: JSON.stringify({ title, content: annContent }),
        });
      } else {
        await apiJson("/api/admin/announcements", {
          method: "POST",
          body: JSON.stringify({ title, content: annContent }),
        });
      }
      resetAnnForm();
      await loadAnnouncements();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setAnnSaving(false);
    }
  }

  function startEditAnn(row) {
    setEditingAnnId(row.id);
    setAnnTitle(row.title || "");
    setAnnContent(row.content || "");
  }

  async function deleteAnn(id) {
    if (!window.confirm("이 공지를 삭제할까요?")) return;
    setErr(null);
    try {
      await apiJson(`/api/admin/announcements/${id}`, { method: "DELETE" });
      if (editingAnnId === id) resetAnnForm();
      await loadAnnouncements();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (loading && !users.length) {
    return <div className="admin-page">불러오는 중…</div>;
  }

  return (
    <div className="admin-page">
      <h2 className="page-title">관리자</h2>
      {err && <div className="auth-error">{err}</div>}

      <section className="admin-section">
        <h3>홈 공지</h3>
        <p className="hint admin-hint-block">
          홈 화면 오른쪽 &quot;공지&quot; 목록에 표시됩니다. 등록·수정·삭제 후 홈에서 자동으로 갱신됩니다(최대 약 15초).
        </p>
        <form className="admin-announce-form" onSubmit={saveAnnouncement}>
          <div className="admin-announce-form-row">
            <label>
              제목
              <input
                type="text"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="공지 제목"
                maxLength={255}
                required
              />
            </label>
          </div>
          <label>
            본문 (선택)
            <textarea
              value={annContent}
              onChange={(e) => setAnnContent(e.target.value)}
              placeholder="추가 설명이 있으면 입력"
              rows={3}
            />
          </label>
          <div className="admin-announce-actions">
            <button type="submit" className="btn" disabled={annSaving}>
              {editingAnnId != null ? "저장" : "등록"}
            </button>
            {editingAnnId != null && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetAnnForm}
              >
                취소
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadAnnouncements()}
            >
              목록 새로고침
            </button>
          </div>
        </form>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-announce">
            <thead>
              <tr>
                <th className="admin-col-id">ID</th>
                <th>제목</th>
                <th>본문</th>
                <th>등록 시각 (UTC)</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.title}</td>
                  <td className="admin-announce-body">{a.content || "—"}</td>
                  <td className="admin-mono">{a.created_at}</td>
                  <td className="admin-actions">
                    <button type="button" onClick={() => startEditAnn(a)}>
                      수정
                    </button>
                    <button type="button" onClick={() => deleteAnn(a.id)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h3>회원 목록</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>이메일</th>
                <th>이름</th>
                <th>역할</th>
                <th>이메일 인증</th>
                <th>승인</th>
                <th>활성</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.email}</td>
                  <td>{u.full_name ?? "—"}</td>
                  <td>{u.role}</td>
                  <td>{u.is_email_verified ? "예" : "아니오"}</td>
                  <td>{u.is_admin_approved ? "예" : "아니오"}</td>
                  <td>{u.is_active ? "예" : "정지"}</td>
                  <td className="admin-actions">
                    {!isPrivilegedRole(u.role) && (
                      <>
                        {!u.is_admin_approved && (
                          <button
                            type="button"
                            onClick={() => approve(u.id)}
                          >
                            승인
                          </button>
                        )}
                        {u.is_active ? (
                          <button
                            type="button"
                            onClick={() => suspend(u.id)}
                          >
                            정지
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => activate(u.id)}
                          >
                            정지 해제
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section">
        <h3>접속·작업 이력</h3>
        <div className="admin-filters">
          <label>
            사용자 ID 필터
            <input
              type="text"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              placeholder="비우면 전체"
            />
          </label>
          <button type="button" onClick={() => loadActivities()}>
            새로고침
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table-activities">
            <thead>
              <tr>
                <th>시각 (UTC)</th>
                <th>사용자 ID</th>
                <th>동작</th>
                <th>상세</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>{a.created_at}</td>
                  <td>{a.user_id ?? "—"}</td>
                  <td>{a.action}</td>
                  <td className="admin-detail">{a.detail ?? "—"}</td>
                  <td>{a.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
