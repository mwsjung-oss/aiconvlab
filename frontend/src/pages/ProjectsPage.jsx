import { useEffect, useRef, useState } from "react";
import { apiJson } from "../api";

const BRIEF_INTRO_HINT =
  "제목과 본문을 직접 입력하거나, 제목과 본문이 있는 파일 또는 논문 주제와 Abstract가 있는 파일을 이 위치에 끌어다 놓으면 자동 입력이 됩니다.";

const BRIEF_DRAFT_KEY = "ailab_brief_draft";
const BRIEF_SUPPLEMENT_KEY = "ailab_brief_supplement_active";
const LAST_REGISTERED_GUIDE_KEY = "ailab_last_registered_brief_guide";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `**bold**` 만 처리 (가이드 본문용) */
function formatGuideLine(htmlSafeText) {
  let h = escapeHtml(htmlSafeText);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return h;
}

function buildAnalysisChatMessage(data) {
  const lr = data.lab_requirements || {};
  const meets = lr.meets_requirements
    ? "✅ **요건**을 비교적 잘 갖추었습니다."
    : "⚠️ AI 실습 과제로 제출하기 전에 아래 항목을 **보완**하는 것을 권장합니다.";
  const gaps = (lr.gaps || []).length
    ? lr.gaps.map((g) => `- ${g}`).join("\n")
    : "- (자동 분석에서 특별히 지적할 만한 항목이 없습니다.)";
  const summary = lr.summary_short || "";
  const tasks = (data.inferred_tasks || []).slice(0, 5).join(", ");

  const taskLine = tasks ? `추정 과제 유형: **${tasks}**` : "";
  return [
    "**프로젝트 브리프 분석 (자동)**",
    "",
    meets,
    "",
    "**간략 요약**",
    summary,
    taskLine,
    "",
    "**보완이 필요해 보이는 점**",
    gaps,
    "",
    "아래 입력란에 보완 내용을 보내 주시면 **제목** 또는 **본문**에 반영합니다.",
    "`제목: 새 제목` · `추가: 붙일 문단` · `본문:` 다음에 전체 본문을 적으면 통째로 교체합니다.",
  ].join("\n");
}

/** 실행·시스템 바이너리 등 (보안·실용상 제외) */
const BLOCKED_BRIEF_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".com",
  ".scr",
  ".msi",
  ".sys",
  ".drv",
  ".app",
  ".deb",
  ".rpm",
  ".apk",
  ".ipa",
]);

/** 서버에서만 추출 (Office/PDF 등) */
const SERVER_EXTRACT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xltx",
  ".xltm",
  ".ppt",
  ".pptx",
  ".ods",
  ".odt",
  ".rtf",
]);

/** 브라우저에서 UTF-8 텍스트로 먼저 읽기 시도 */
const CLIENT_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".log",
  ".xml",
  ".html",
  ".htm",
  ".xhtml",
  ".yaml",
  ".yml",
  ".css",
  ".scss",
  ".less",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".py",
  ".pyw",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".cxx",
  ".cs",
  ".sql",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".env",
  ".ini",
  ".cfg",
  ".toml",
  ".properties",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  ".svg",
]);

function fileExtension(name) {
  const i = (name || "").lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

export default function ProjectsPage({
  onRefresh,
  currentProjectId,
  onProjectActivated,
  autoStartToken = 0,
}) {
  const [briefErr, setBriefErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const [briefTitle, setBriefTitle] = useState("");
  const [briefContent, setBriefContent] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [briefDragging, setBriefDragging] = useState(false);
  const briefDragDepth = useRef(0);
  const briefTitleInputRef = useRef(null);

  const [dataGuideOpen, setDataGuideOpen] = useState(false);
  const [dataGuideLoading, setDataGuideLoading] = useState(false);
  const [dataGuidePayload, setDataGuidePayload] = useState(null);
  const [dataGuideErr, setDataGuideErr] = useState(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        BRIEF_DRAFT_KEY,
        JSON.stringify({ title: briefTitle, content: briefContent })
      );
    } catch {
      /* ignore */
    }
  }, [briefTitle, briefContent]);

  useEffect(() => {
    function onBriefApplied(e) {
      const d = e.detail;
      if (d?.title != null) setBriefTitle(String(d.title));
      if (d?.content != null) setBriefContent(String(d.content));
    }
    window.addEventListener("ailab-brief-applied", onBriefApplied);
    return () => window.removeEventListener("ailab-brief-applied", onBriefApplied);
  }, []);

  useEffect(() => {
    if (!autoStartToken) return;
    setBriefErr(null);
    setAnalysis(null);
    setBriefTitle("");
    setBriefContent("");
    setMsg("신규 프로젝트 등록을 시작합니다. 제목과 본문을 입력해 주세요.");
    try {
      sessionStorage.removeItem(BRIEF_SUPPLEMENT_KEY);
      sessionStorage.removeItem(BRIEF_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    queueMicrotask(() => {
      briefTitleInputRef.current?.focus();
    });
  }, [autoStartToken]);

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
      r.readAsText(file, "UTF-8");
    });
  }

  function isBlockedBriefFile(file) {
    return BLOCKED_BRIEF_EXTENSIONS.has(fileExtension(file?.name));
  }

  function isAcceptableBriefFile(file) {
    if (!file?.name) return false;
    return !isBlockedBriefFile(file);
  }

  function preferClientTextRead(file) {
    const mime = (file.type || "").toLowerCase();
    if (mime.startsWith("text/")) return true;
    if (
      mime === "application/json" ||
      mime === "application/xml" ||
      mime === "application/javascript" ||
      mime.includes("javascript")
    ) {
      return true;
    }
    if (mime.endsWith("+json") || mime.endsWith("+xml")) return true;
    const ext = fileExtension(file.name);
    if (!ext) return true;
    return CLIENT_TEXT_EXTENSIONS.has(ext);
  }

  function appendExtractedText(text, filename) {
    setBriefContent((prev) => {
      const next = prev ? `${prev}\n\n${text}` : text;
      queueMicrotask(() => void applySuggestedTitle(next, filename));
      return next;
    });
    setMsg(`파일 로드: ${filename}`);
  }

  async function applySuggestedTitle(fullContent, filenameHint) {
    const body = (fullContent || "").trim();
    if (!body) return;
    try {
      const data = await apiJson("/api/portal/projects/suggest-title", {
        method: "POST",
        body: JSON.stringify({ content: body }),
        timeoutMs: 60000,
      });
      if (!data?.ok || !String(data.title || "").trim()) return;
      const conf = data.confidence || "low";
      const t = String(data.title).trim();
      if (conf === "high" || conf === "medium") {
        setBriefTitle((prev) => (prev.trim() ? prev : t));
        const short = t.length > 60 ? `${t.slice(0, 60)}…` : t;
        setMsg(`파일 로드: ${filenameHint} · 제목 자동 입력: ${short}`);
        return;
      }
      sessionStorage.setItem(
        "ailab_pending_title",
        JSON.stringify({ title: t })
      );
      const safe = t.replace(/\*/g, "＊");
      window.dispatchEvent(
        new CustomEvent("ailab-inject-assistant", {
          detail: {
            content: `파일에서 추출한 **제목 후보**는 아래와 같습니다.\n\n**${safe}**\n\n이 제목이 프로젝트 또는 논문 제목이 맞다면, 아래 입력란에 **맞다**, **예**, **네**처럼 답해 주시면 제목 칸에 반영합니다. 직접 다른 제목을 쓰려면 상단 **제목** 칸에 입력하셔도 됩니다.`,
          },
        })
      );
      const hint = t.length > 36 ? `${t.slice(0, 36)}…` : t;
      setMsg(
        `파일 로드: ${filenameHint} · 제목 후보 「${hint}」— AI Agent에서 확인하거나 제목 칸에 직접 입력하세요.`
      );
    } catch (ex) {
      const m = ex?.message || String(ex);
      if (/연결|Failed to fetch|fetch|네트워크|시간이 초과/i.test(m)) {
        setBriefErr(m);
      }
    }
  }

  useEffect(() => {
    function onTitleConfirmed(e) {
      const title = e.detail?.title;
      if (typeof title === "string" && title.trim()) {
        setBriefTitle(title.trim());
        setMsg("제목을 반영했습니다.");
      }
    }
    window.addEventListener("ailab-project-title-confirmed", onTitleConfirmed);
    return () =>
      window.removeEventListener("ailab-project-title-confirmed", onTitleConfirmed);
  }, []);

  async function extractBriefTextViaApi(file) {
    const fd = new FormData();
    fd.append("file", file);
    return apiJson("/api/portal/projects/extract-file-text", {
      method: "POST",
      body: fd,
      timeoutMs: 120000,
    });
  }

  async function ingestBriefFile(file) {
    if (!file) return;
    if (isBlockedBriefFile(file)) {
      setBriefErr("이 파일 형식은 보안상 끌어다 놓을 수 없습니다.");
      return;
    }
    setBriefErr(null);
    const ext = fileExtension(file.name);
    const serverFirst = SERVER_EXTRACT_EXTENSIONS.has(ext);

    if (serverFirst) {
      try {
        const data = await extractBriefTextViaApi(file);
        if (!data?.ok || typeof data.text !== "string") {
          setBriefErr(data?.error || "파일에서 텍스트를 추출하지 못했습니다.");
          return;
        }
        appendExtractedText(data.text, file.name);
      } catch (ex) {
        setBriefErr(ex.message || String(ex));
      }
      return;
    }

    if (preferClientTextRead(file)) {
      try {
        const text = await readTextFile(file);
        if (text.trim() !== "" || file.size === 0) {
          appendExtractedText(text, file.name);
          return;
        }
      } catch {
        /* 서버로 재시도 */
      }
    }

    try {
      const data = await extractBriefTextViaApi(file);
      if (!data?.ok || typeof data.text !== "string") {
        setBriefErr(data?.error || "파일에서 텍스트를 추출하지 못했습니다.");
        return;
      }
      appendExtractedText(data.text, file.name);
    } catch (ex) {
      setBriefErr(ex.message || String(ex));
    }
  }

  function handleBriefDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function handleBriefDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    briefDragDepth.current += 1;
    setBriefDragging(true);
  }

  function handleBriefDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    briefDragDepth.current -= 1;
    if (briefDragDepth.current <= 0) {
      briefDragDepth.current = 0;
      setBriefDragging(false);
    }
  }

  function handleBriefDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    briefDragDepth.current = 0;
    setBriefDragging(false);
    const list = e.dataTransfer?.files;
    if (!list?.length) return;
    const file = Array.from(list).find(isAcceptableBriefFile);
    if (!file) {
      setBriefErr("끌어다 놓을 수 없는 파일 형식입니다.");
      return;
    }
    void ingestBriefFile(file);
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
          source_type: "project",
          title: briefTitle.trim(),
          content: briefContent,
        }),
      });
      if (!data.ok) {
        setBriefErr(data.error || "분석 실패");
        return;
      }
      setAnalysis(data);
      setMsg(
        "분석이 완료되었습니다. 오른쪽 AI Agent에 요약·보완 안내가 표시됩니다. 필요하면 메시지로 수정을 요청하세요."
      );
      try {
        sessionStorage.setItem(BRIEF_SUPPLEMENT_KEY, "1");
        sessionStorage.setItem(
          BRIEF_DRAFT_KEY,
          JSON.stringify({
            title: briefTitle.trim(),
            content: briefContent,
          })
        );
      } catch {
        /* ignore */
      }
      window.dispatchEvent(
        new CustomEvent("ailab-inject-assistant", {
          detail: { content: buildAnalysisChatMessage(data) },
        })
      );
    } catch (ex) {
      setBriefErr(ex.message);
    } finally {
      setAnalyzeLoading(false);
    }
  }

  function clearBrief() {
    setBriefTitle("");
    setBriefContent("");
    setAnalysis(null);
    setBriefErr(null);
    setMsg(null);
    try {
      sessionStorage.removeItem(BRIEF_SUPPLEMENT_KEY);
      sessionStorage.removeItem(BRIEF_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  function getGuidePayload() {
    const t = briefTitle.trim();
    const c = briefContent.trim();
    if (t && c) {
      return {
        title: t,
        content: c,
        analysis: analysis?.ok ? analysis : null,
      };
    }
    try {
      const raw = sessionStorage.getItem(LAST_REGISTERED_GUIDE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s?.title && s?.content) {
        return {
          title: String(s.title),
          content: String(s.content),
          analysis: s.analysis?.ok ? s.analysis : null,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  async function openDataPrepGuide() {
    setDataGuideErr(null);
    const payload = getGuidePayload();
    if (!payload) {
      setBriefErr(
        "데이터 가이드를 보려면 제목·본문을 채우거나, 먼저 프로젝트 자동 등록을 완료하세요."
      );
      return;
    }
    setDataGuideLoading(true);
    setDataGuidePayload(null);
    setDataGuideOpen(true);
    try {
      const data = await apiJson("/api/portal/projects/data-prep-guide", {
        method: "POST",
        body: JSON.stringify({
          source_type: "project",
          title: payload.title,
          content: payload.content,
          analysis: payload.analysis,
        }),
        timeoutMs: 60000,
      });
      if (!data.ok) {
        setDataGuideErr(data.error || "가이드를 불러오지 못했습니다.");
        return;
      }
      setDataGuidePayload(data);
    } catch (ex) {
      setDataGuideErr(ex.message || String(ex));
    } finally {
      setDataGuideLoading(false);
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
      try {
        sessionStorage.setItem(
          LAST_REGISTERED_GUIDE_KEY,
          JSON.stringify({
            title: briefTitle.trim(),
            content: briefContent,
            analysis: analysis?.ok ? analysis : null,
          })
        );
      } catch {
        /* ignore */
      }
      const created = await apiJson("/api/portal/projects/register-from-brief", {
        method: "POST",
        body: JSON.stringify({
          source_type: "project",
          title: briefTitle.trim(),
          content: briefContent,
          project_name: null,
        }),
      });
      const createdId =
        created?.id ??
        created?.project_id ??
        created?.project?.id ??
        null;
      const createdName =
        created?.name ??
        created?.project_name ??
        created?.project?.name ??
        (createdId != null ? `프로젝트 ${createdId}` : "");
      if (createdId != null) {
        await onProjectActivated?.({ id: createdId, name: createdName });
      }
      setMsg(
        `프로젝트가 자동 등록되었습니다.${createdName ? ` (현재 프로젝트: ${createdName})` : ""}`
      );
      setBriefTitle("");
      setBriefContent("");
      setAnalysis(null);
      try {
        sessionStorage.removeItem(BRIEF_SUPPLEMENT_KEY);
        sessionStorage.removeItem(BRIEF_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      await onRefresh?.();
      // 목록 재동기화 과정에서 선택값이 덮여도, 방금 등록한 프로젝트를 다시 활성화합니다.
      if (createdId != null) {
        await onProjectActivated?.({ id: createdId, name: createdName });
      }
    } catch (ex) {
      setBriefErr(ex.message);
    } finally {
      setRegisterLoading(false);
    }
  }

  return (
    <div className="projects-page-compact">
      <section className="panel projects-smart-panel">
        {currentProjectId ? (
          <p className="hint" style={{ marginTop: 0 }}>
            선택된 프로젝트 ID: <strong>{currentProjectId}</strong> (이후 단계 실행/평가/리포트에 연계)
          </p>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            아직 활성 프로젝트가 없습니다. “프로젝트 자동 등록” 후 단계 2~6이 해당 프로젝트에 연결됩니다.
          </p>
        )}
        <div className="projects-brief-compose">
          <label className="projects-brief-field" htmlFor="brief-title">
            제목
            <div className="projects-brief-title-wrap">
              <input
                ref={briefTitleInputRef}
                id="brief-title"
                type="text"
                value={briefTitle}
                onChange={(e) => setBriefTitle(e.target.value)}
                placeholder="프로젝트 제목"
              />
            </div>
          </label>

          <label className="projects-brief-field" htmlFor="brief-content">
            본문 (배경·목표·데이터 설명 등)
            <div
              className={
                briefDragging
                  ? "projects-brief-body-wrap projects-brief-body-wrap--drag"
                  : "projects-brief-body-wrap"
              }
              onDragEnter={handleBriefDragEnter}
              onDragLeave={handleBriefDragLeave}
              onDragOver={handleBriefDragOver}
              onDrop={handleBriefDrop}
            >
              <textarea
                id="brief-content"
                rows={8}
                value={briefContent}
                onChange={(e) => setBriefContent(e.target.value)}
                placeholder={BRIEF_INTRO_HINT}
              />
            </div>
          </label>

          {briefErr && <div className="auth-error">{briefErr}</div>}
          {msg && (
            <div className="hint projects-brief-msg" style={{ color: "var(--ok, #15803d)" }}>
              {msg}
            </div>
          )}

          <div className="projects-brief-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={analyzeLoading || registerLoading}
              onClick={clearBrief}
            >
              Clear
            </button>
            <button
              type="button"
              className="auth-submit"
              disabled={analyzeLoading}
              onClick={runAnalyze}
            >
              {analyzeLoading ? "분석 중…" : "분석 하기"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={registerLoading}
              onClick={runRegisterFromBrief}
            >
              {registerLoading ? "등록 중…" : "프로젝트 자동 등록"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={registerLoading || analyzeLoading || dataGuideLoading}
              onClick={openDataPrepGuide}
            >
              데이터 준비 가이드
            </button>
          </div>
        </div>

        {analysis && analysis.ok && (
          <div className="panel projects-analysis-panel" style={{ color: "#111827" }}>
            <h4 className="projects-analysis-heading">추천 결과</h4>
            <p className="hint" style={{ color: "#374151" }}>
              추정 과제: <strong>{(analysis.inferred_tasks || []).join(", ")}</strong>
            </p>
            <h5>데이터셋 제안</h5>
            <ul>
              {(analysis.recommended_datasets || []).map((d, i) => (
                <li key={i}>
                  <strong>{d.name}</strong> ({d.role}) — {d.schema_hint}
                  {d.notes ? <span className="hint" style={{ color: "#374151" }}> · {d.notes}</span> : null}
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
              <p className="hint" style={{ color: "#374151" }}>
                매칭 키워드: {analysis.keywords_matched.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      {dataGuideOpen && (
        <div
          className="projects-data-guide-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDataGuideOpen(false);
          }}
        >
          <div
            className="projects-data-guide-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-guide-title"
            onClick={(e) => e.stopPropagation()}
            style={{ color: "#111827" }}
          >
            <h3 id="data-guide-title">데이터 준비 가이드</h3>
            {dataGuideLoading && (
              <p className="hint" style={{ margin: "0.5rem 0", color: "#374151" }}>
                분석 브리프를 바탕으로 요건을 정리하는 중…
              </p>
            )}
            {dataGuideErr && (
              <div className="auth-error" style={{ marginBottom: "0.5rem" }}>
                {dataGuideErr}
              </div>
            )}
            {dataGuidePayload && dataGuidePayload.ok && (
              <>
                <p
                  className="projects-data-guide-intro"
                  dangerouslySetInnerHTML={{
                    __html: formatGuideLine(dataGuidePayload.intro || ""),
                  }}
                />
                {dataGuidePayload.model_hint && (
                  <p className="hint" style={{ margin: "0 0 0.5rem", color: "#374151" }}>
                    참고 모델(플랫폼): <code>{dataGuidePayload.model_hint}</code>
                  </p>
                )}
                {(dataGuidePayload.sections || []).map((sec, i) => (
                  <div key={i} className="projects-data-guide-section">
                    <h4>{sec.heading}</h4>
                    <ul>
                      {(sec.items || []).map((line, j) => (
                        <li
                          key={j}
                          dangerouslySetInnerHTML={{
                            __html: formatGuideLine(line),
                          }}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
                {(dataGuidePayload.checklist || []).length > 0 && (
                  <div className="projects-data-guide-checklist">
                    <h4>준비 체크리스트</h4>
                    <ul style={{ margin: 0, paddingLeft: "1.15rem" }}>
                      {dataGuidePayload.checklist.map((line, k) => (
                        <li
                          key={k}
                          dangerouslySetInnerHTML={{
                            __html: formatGuideLine(line),
                          }}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <div className="projects-data-guide-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setDataGuideOpen(false);
                  setDataGuideErr(null);
                  setDataGuidePayload(null);
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
