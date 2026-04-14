import { useState } from "react";
import { apiJson } from "../api";

export default function KnowledgePage({ entries, onRefresh, templates = [], presets = [] }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("guide");
  const [err, setErr] = useState(null);

  async function createEntry(e) {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson("/api/portal/knowledge", {
        method: "POST",
        body: JSON.stringify({ title, content, category, tags: [] }),
      });
      setTitle("");
      setContent("");
      await onRefresh?.();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Knowledge Hub</h2>
        <p className="hint">실험 가이드, 데이터셋 설명, FAQ를 지식베이스로 관리합니다.</p>
        <form className="auth-form" onSubmit={createEntry}>
          <label>
            제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            분류
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="guide">guide</option>
              <option value="dataset">dataset</option>
              <option value="model">model</option>
              <option value="faq">faq</option>
            </select>
          </label>
          <label>
            내용
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} required />
          </label>
          {err && <div className="auth-error">{err}</div>}
          <button className="auth-submit" type="submit">등록</button>
        </form>
      </section>
      <section className="panel">
        <h3>문서 목록</h3>
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>새로고침</button>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>분류</th>
                <th>제목</th>
                <th>내용</th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((e) => (
                <tr key={e.id}>
                  <td>{e.category}</td>
                  <td>{e.title}</td>
                  <td>{e.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h3>Built-in Experiment Templates</h3>
        <ul>
          {templates.map((t) => (
            <li key={t.template_id}>
              <strong>{t.title}</strong> - {t.task_type}
            </li>
          ))}
        </ul>
        <h3 style={{ marginTop: 16 }}>Model Presets</h3>
        <ul>
          {presets.map((p) => (
            <li key={p.preset_id}>
              {p.name}: {(p.models || []).join(", ")}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

