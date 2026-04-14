import { useState } from "react";
import { apiJson } from "../api";

export default function ProjectsPage({
  projects,
  onRefresh,
  studentProjects = [],
  templates = [],
  reportTemplates = [],
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState(null);
  const [briefErr, setBriefErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const [briefMode, setBriefMode] = useState("project");
  const [briefTitle, setBriefTitle] = useState("");
  const [briefContent, setBriefContent] = useState("");
  const [projectNameOverride, setProjectNameOverride] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  async function createProject(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await apiJson("/api/portal/projects", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      setName("");
      setDescription("");
      setMsg("프로젝트가 생성되었습니다.");
      await onRefresh?.();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
      r.readAsText(file, "UTF-8");
    });
  }

  async function onDropBriefFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBriefErr(null);
    try {
      const text = await readTextFile(f);
      setBriefContent((prev) => (prev ? `${prev}\n\n${text}` : text));
      setMsg(`파일 로드: ${f.name}`);
    } catch (ex) {
      setBriefErr(ex.message);
    }
  }

  async function runAnalyze() {
    setBriefErr(null);
    setMsg(null);
    setAnalysis(null);
    if (!briefTitle.trim() || !briefContent.trim()) {
      setBriefErr("제목과 본문(또는 Abstract)을 입력하세요.");
      return;
    }
    setAnalyzeLoading(true);
    try {
      const data = await apiJson("/api/portal/projects/analyze", {
        method: "POST",
        body: JSON.stringify({
          source_type: briefMode,
          title: briefTitle.trim(),
          content: briefContent,
        }),
      });
      if (!data.ok) {
        setBriefErr(data.error || "분석 실패");
        return;
      }
      setAnalysis(data);
      setMsg("분석이 완료되었습니다. 아래 추천을 확인한 뒤 등록하세요.");
    } catch (ex) {
      setBriefErr(ex.message);
    } finally {
      setAnalyzeLoading(false);
    }
  }

  async function runRegisterFromBrief() {
    setBriefErr(null);
    setMsg(null);
    if (!briefTitle.trim() || !briefContent.trim()) {
      setBriefErr("제목과 본문을 입력하세요.");
      return;
    }
    setRegisterLoading(true);
    try {
      await apiJson("/api/portal/projects/register-from-brief", {
        method: "POST",
        body: JSON.stringify({
          source_type: briefMode,
          title: briefTitle.trim(),
          content: briefContent,
          project_name: projectNameOverride.trim() || null,
        }),
      });
      setMsg("프로젝트가 자동 등록되었습니다.");
      setBriefTitle("");
      setBriefContent("");
      setProjectNameOverride("");
      setAnalysis(null);
      await onRefresh?.();
    } catch (ex) {
      setBriefErr(ex.message);
    } finally {
      setRegisterLoading(false);
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Projects</h2>
        <p className="hint">
          프로젝트 제목·내용 또는 논문 제목·Abstract 를 입력(또는 .txt 업로드)하면 자동으로 과제 유형,
          권장 데이터셋, 추천 AI 모델, 수행 시 고려사항을 제안하고 프로젝트로 등록할 수 있습니다.
        </p>

        <div className="projects-smart-layout" style={{ display: "grid", gap: 16 }}>
          <div>
            <h3 style={{ marginTop: 0 }}>① 지능형 등록</h3>
            <div style={{ marginBottom: 8 }}>
              <label className="hint">유형 </label>
              <select
                value={briefMode}
                onChange={(e) => setBriefMode(e.target.value)}
              >
                <option value="project">프로젝트 개요 (제목 + 내용)</option>
                <option value="paper">논문 (제목 + Abstract)</option>
              </select>
            </div>
            <label>
              제목
              <input
                value={briefTitle}
                onChange={(e) => setBriefTitle(e.target.value)}
                placeholder={
                  briefMode === "paper"
                    ? "논문 영문/국문 제목"
                    : "프로젝트 제목"
                }
                style={{ width: "100%" }}
              />
            </label>
            <label>
              본문 {briefMode === "paper" ? "(Abstract)" : "(배경·목표·데이터 설명 등)"}
              <textarea
                rows={10}
                value={briefContent}
                onChange={(e) => setBriefContent(e.target.value)}
                style={{ width: "100%", fontFamily: "inherit" }}
                placeholder="텍스트를 붙여 넣거나, 아래에서 .txt 파일을 선택하세요."
              />
            </label>
            <div style={{ marginTop: 8 }}>
              <label className="hint">텍스트 파일 업로드 (.txt) </label>
              <input type="file" accept=".txt,text/plain" onChange={onDropBriefFile} />
            </div>
            <label>
              프로젝트 이름 (선택, 비우면 제목 사용)
              <input
                value={projectNameOverride}
                onChange={(e) => setProjectNameOverride(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
            {briefErr && <div className="auth-error">{briefErr}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                className="auth-submit"
                disabled={analyzeLoading}
                onClick={runAnalyze}
              >
                {analyzeLoading ? "분석 중…" : "분석만 하기 (미리보기)"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={registerLoading}
                onClick={runRegisterFromBrief}
              >
                {registerLoading ? "등록 중…" : "분석 후 프로젝트 자동 등록"}
              </button>
            </div>
          </div>

          {analysis && analysis.ok && (
            <div className="panel" style={{ background: "var(--panel-2, #f8f9fb)" }}>
              <h4 style={{ marginTop: 0 }}>추천 결과</h4>
              <p className="hint">
                추정 과제: <strong>{(analysis.inferred_tasks || []).join(", ")}</strong>
              </p>
              <h5>데이터셋 제안</h5>
              <ul>
                {(analysis.recommended_datasets || []).map((d, i) => (
                  <li key={i}>
                    <strong>{d.name}</strong> ({d.role}) — {d.schema_hint}
                    {d.notes ? <span className="hint"> · {d.notes}</span> : null}
                  </li>
                ))}
              </ul>
              <h5>추천 모델 (플랫폼 지원)</h5>
              <ul>
                {(analysis.recommended_models || []).map((m, i) => (
                  <li key={i}>
                    <code>{m.model_type}</code> — {m.rationale}
                  </li>
                ))}
              </ul>
              <h5>수행 시 고려사항</h5>
              <ul>
                {(analysis.considerations || []).slice(0, 12).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {analysis.keywords_matched?.length > 0 && (
                <p className="hint">
                  매칭 키워드: {analysis.keywords_matched.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>수동 등록 (간단)</h3>
        <p className="hint">제목·설명만으로 빠르게 프로젝트를 만듭니다. (source_type: manual)</p>
        <form className="auth-form" onSubmit={createProject}>
          <label>
            프로젝트 이름
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            설명
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {err && <div className="auth-error">{err}</div>}
          {msg && <div className="hint" style={{ color: "var(--ok, #0a0)" }}>{msg}</div>}
          <button className="auth-submit" type="submit">
            프로젝트 생성
          </button>
        </form>
      </section>

      <section className="panel">
        <h3>2026 Spring Student Project Registry</h3>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>학생</th>
                <th>주제</th>
                <th>도메인</th>
                <th>Task</th>
                <th>모델 후보</th>
              </tr>
            </thead>
            <tbody>
              {studentProjects.map((sp) => (
                <tr key={sp.id}>
                  <td>{sp.student_name}</td>
                  <td>{sp.title_kr}</td>
                  <td>{sp.domain}</td>
                  <td>{(sp.task_types || []).join(", ")}</td>
                  <td>{(sp.model_candidates || []).slice(0, 4).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>프로젝트 목록</h3>
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
          새로고침
        </button>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>이름</th>
                <th>유형</th>
                <th>자동 추천 요약</th>
                <th>설명 일부</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {(projects || []).map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.source_type || "-"}</td>
                  <td style={{ maxWidth: 280, fontSize: 13 }}>
                    {p.intelligence?.inferred_tasks?.length
                      ? `과제: ${p.intelligence.inferred_tasks.join(", ")} / 모델: ${(p.intelligence.recommended_models || []).map((x) => x.model_type).slice(0, 3).join(", ")}`
                      : "—"}
                  </td>
                  <td style={{ maxWidth: 220, fontSize: 12 }} className="hint">
                    {(p.description || "").slice(0, 120)}
                    {(p.description || "").length > 120 ? "…" : ""}
                  </td>
                  <td>{p.owner_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Experiment / Report Templates</h3>
        <div className="hint">학생 프로젝트별 권장 템플릿</div>
        <ul>
          {templates.map((t) => (
            <li key={t.template_id}>
              <strong>{t.title}</strong> ({t.task_type}) - {t.model_family}
            </li>
          ))}
        </ul>
        <div className="hint" style={{ marginTop: 12 }}>
          Report Templates
        </div>
        <ul>
          {reportTemplates.map((r) => (
            <li key={r.template_id}>{r.name}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
