import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiJson } from "../api";
import {
  AI_PROVIDER_OPTIONS,
  readStoredAiProvider,
  writeStoredAiProvider,
} from "../api/aiProviderPref.js";
import {
  getWorkflowStepSidebarMessage,
  WORKFLOW_STEPS,
} from "../workflowConfig.js";

/** 상단 메뉴 3번째 줄과 동일한 키 */
export const LAB_PRESET_KEYS = [
  "overview",
  "project",
  "data",
  "model",
  "insights",
];

const BASE_FOOTNOTE = `
- **OpenAI**: 서버에 \`OPENAI_API_KEY\`가 있으면 자연어·도구 호출이 풀가동됩니다. **로컬 모드**는 슬래시·키워드 중심입니다.
- **도구**: 데이터 목록·미리보기·학습·예측·실험 플랫폼(ml_*) 등을 대화로 요청할 수 있습니다.`;

/** Experiment 사이드바·동일 UI에서 보이는 패널 제목(툴팁과 일치) */
const AI_AGENT_PANEL_TITLE = "AI Agent";

const PENDING_TITLE_STORAGE_KEY = "ailab_pending_title";
const BRIEF_SUPPLEMENT_KEY = "ailab_brief_supplement_active";
const BRIEF_DRAFT_KEY = "ailab_brief_draft";

/** 프로젝트 제목 확인용 짧은 긍정 답변 (긴 문장은 일반 채팅으로 처리) */
function isAffirmativeTitleReply(s) {
  const x = s.trim();
  if (!x || x.length > 44) return false;
  if (/^아니|틀렸|아닙니다|다른\s*제목/i.test(x)) return false;
  if (/^(네|예|ㅇ|ㅇㅇ|yes|y|ok|okay)([\s!.?]*)$/i.test(x)) return true;
  if (/^(맞다|맞습니다|맞아요|맞아|그렇습니다|확인|좋아요)([\s!.?]*)$/i.test(x))
    return true;
  return false;
}

function isNegativeTitleReply(s) {
  return /^아니|틀렸|아닙니다|다른\s*제목|no\b/i.test(s.trim());
}

function presetWelcomeAndChips(labPreset) {
  const p = LAB_PRESET_KEYS.includes(labPreset) ? labPreset : "overview";
  const common = {
    overview: {
      title: "AI Agent — 전체 흐름",
      welcome: `**프로젝트 등록 → 데이터 검증 → 모델·실험 → 결과 해설**까지 한 곳에서 대화로 진행합니다.

- 단계별 메뉴(프로젝트 정의 / 데이터 검증 / 모델·실험 / 결과 해설)를 바꿔가며 같은 AI Agent를 쓸 수 있습니다.
- 프로젝트 내용을 구체화하고, CSV를 올린 뒤 **미리보기·품질 점검**, **학습(dry_run 포함)·예측**, **지표 해석**을 질의응답 형태로 이어가세요.${BASE_FOOTNOTE}`,
      chips: [
        { label: "전체 로드맵", text: "이 실습을 처음부터 끝까지 어떤 순서로 진행하면 좋은지 짧게 로드맵을 짜줘." },
        { label: "데이터셋 목록", text: "워크스페이스의 CSV 데이터셋 목록을 보여줘." },
        { label: "모델 목록", text: "저장된 학습 모델 목록과 model_id를 알려줘." },
        { label: "최근 이력", text: "최근 실험·학습 이력을 요약해줘." },
      ],
    },
    project: {
      title: "AI 실습 — 프로젝트 정의",
      welcome: `**연구 목표·범위·데이터 가설**을 대화로 다듬습니다. 포털 **Projects**에 옮길 수 있는 문장이나 불릿으로 정리해 달라고 해도 됩니다.

- 논문·과제 브리프가 있으면 \`project_analyze\` 도구로 요약·추천을 받을 수 있습니다.
- 위 **실습 절차** 메뉴의 「프로젝트」와 함께 쓰면 좋습니다.${BASE_FOOTNOTE}`,
      chips: [
        { label: "목표 한 페이지", text: "내가 말하는 주제를 바탕으로 연구 목표·데이터·평가지표를 한 페이지 초안으로 정리해줘." },
        { label: "가설·리스크", text: "이 프로젝트에서 검증할 가설과 데이터·윤리 리스크를 나열해줘." },
        { label: "보고용 요약", text: "교수/팀 보고용으로 프로젝트를 5문장 이내로 요약해줘." },
      ],
    },
    data: {
      title: "AI 실습 — 데이터 검증",
      welcome: `업로드한 **CSV를 검증**하고, **결측·분포·타깃 후보** 등 보완점을 추천받습니다.

- \`preview_dataset\`·\`list_datasets\`로 열·샘플을 확인한 뒤, 필요하면 전처리 우선순위를 물어보세요.
- **데이터 업로드 / 미리보기** 화면과 병행해도 됩니다.${BASE_FOOTNOTE}`,
      chips: [
        { label: "첫 파일 미리보기", text: "워크스페이스 CSV 중 첫 번째 파일 이름을 알려주고, 그 파일로 preview_dataset 해줘." },
        { label: "품질 체크", text: "지금 미리본 데이터에서 결측·이상값·클래스 불균형을 점검할 때 주의할 열을 추천해줘." },
        { label: "타깃 후보", text: "분류 과제라면 타깃으로 쓸 만한 열 후보와 이유를 제안해줘." },
      ],
    },
    model: {
      title: "AI 실습 — 모델·실험",
      welcome: `**학습·예측·스윕·실험 비교**를 대화로 진행합니다.

- 처음에는 \`train_model\`의 **dry_run**으로 설정을 검증한 뒤 실제 학습을 요청하세요.
- **ml_*** 도구로 Run 비교·계보·스윕 등 실험 플랫폼 기능을 호출할 수 있습니다.${BASE_FOOTNOTE}`,
      chips: [
        { label: "학습 dry_run", text: "내가 쓸 CSV 파일명과 타깃 열을 물어본 뒤, 분류·random_forest로 train_model dry_run=true로 검증해줘." },
        { label: "잡 목록", text: "비동기 잡(학습/예측) 목록을 보여줘." },
        { label: "Run 비교", text: "내가 두 model_id를 주면 ml_compare_runs로 비교해줘." },
      ],
    },
    insights: {
      title: "AI 실습 — 결과 해설",
      welcome: `**지표·그래프·예측 산출**을 질의응답으로 해석합니다.

- \`history_summary\`로 최근 Run을 보고, 수치의 의미·한계·다음 실험 제안을 물어보세요.
- 리더보드·벤치마크는 \`ml_list_benchmarks\` / \`ml_get_leaderboard\`로 조회할 수 있습니다.${BASE_FOOTNOTE}`,
      chips: [
        { label: "최근 이력", text: "최근 실험·학습 이력을 요약하고, 가장 최근 모델의 지표를 쉬운 말로 설명해줘." },
        { label: "지표 질문", text: "검증 accuracy와 F1 중 무엇을 먼저 봐야 할지 이 데이터에는 왜 그런지 설명해줘." },
        { label: "다음 실험", text: "지표를 개선하려면 다음에 바꿔볼 하이퍼파라미터나 데이터 작업을 추천해줘." },
      ],
    },
  };
  return common[p];
}

/** Phase 2: 실험 플랫폼 도구로 데이터가 바뀌면 대시보드 새로고침 */
const ML_TOOLS_REFRESH = new Set([
  "ml_submit_sweep",
  "ml_set_registry_stage",
  "ml_tag_best",
  "ml_submit_leaderboard",
  "ml_log_llm_evaluation",
]);

function shouldRefreshAfterTools(tools) {
  return tools.some((t) => {
    const r = t.result;
    if (!r || r.ok === false) return false;
    if (["train_model", "predict_batch"].includes(t.name)) {
      return !r.dry_run;
    }
    if (ML_TOOLS_REFRESH.has(t.name)) return true;
    return false;
  });
}

export default function AiChatPage({
  onAfterTool,
  labPreset = "overview",
  variant = "full",
  workflowStep = null,
  workflowChatResetSeq = 0,
}) {
  const isSidebar = variant === "sidebar";
  const isWorkbench = variant === "workbench";
  const useSidebarRules = isSidebar || isWorkbench;
  const cfg = useMemo(() => presetWelcomeAndChips(labPreset), [labPreset]);
  const stepDef = useMemo(
    () =>
      WORKFLOW_STEPS.find((s) => s.id === (workflowStep || "step1")) ||
      WORKFLOW_STEPS[0],
    [workflowStep]
  );
  const [messages, setMessages] = useState(() => {
    if (variant === "sidebar" || variant === "workbench") {
      const step = workflowStep || "step1";
      return [
        {
          role: "assistant",
          content: getWorkflowStepSidebarMessage(step),
        },
      ];
    }
    return [
      { role: "assistant", content: presetWelcomeAndChips(labPreset).welcome },
    ];
  });
  function clearConversation() {
    const tip = getWorkflowStepSidebarMessage(workflowStep || "step1");
    setMessages([{ role: "assistant", content: tip }]);
    setErr(null);
    if (threadRef.current) threadRef.current.scrollTop = 0;
  }
  function scrollToBriefPanel() {
    document
      .querySelector(".projects-brief-compose")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [aiProvider, setAiProvider] = useState(readStoredAiProvider);
  const [providerMeta, setProviderMeta] = useState(null);
  const threadRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!useSidebarRules || !workflowStep) return;
    const tip = getWorkflowStepSidebarMessage(workflowStep);
    setMessages([{ role: "assistant", content: tip }]);
    // 단계 전환 직후 바로 첫 줄부터 보이도록 스크롤을 맨 위로 강제한다.
    if (threadRef.current) threadRef.current.scrollTop = 0;
  }, [useSidebarRules, workflowStep, workflowChatResetSeq]);

  useEffect(() => {
    writeStoredAiProvider(aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    const sync = () => setAiProvider(readStoredAiProvider());
    window.addEventListener("ailab-ai-provider-change", sync);
    return () => window.removeEventListener("ailab-ai-provider-change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await apiJson("/api/ai/providers");
        if (!cancelled) setProviderMeta(d);
      } catch {
        if (!cancelled) setProviderMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (useSidebarRules && threadRef.current) {
      const t = threadRef.current;
      t.scrollTo({ top: t.scrollHeight, behavior: "smooth" });
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [useSidebarRules]);

  const scrollToTop = useCallback(() => {
    const t = threadRef.current;
    if (!t) return;
    // 진행 중인 smooth 스크롤을 확실히 취소하기 위해 scrollTop을 직접 설정하고,
    // 레이아웃이 늦게 확정되는 경우(폰트 로딩·컨테이너 flex 계산)를 대비해
    // 다음 프레임과 짧은 지연 후에도 한 번 더 보정한다.
    t.scrollTop = 0;
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        if (threadRef.current) threadRef.current.scrollTop = 0;
      });
      window.setTimeout(() => {
        if (threadRef.current) threadRef.current.scrollTop = 0;
      }, 60);
      window.setTimeout(() => {
        if (threadRef.current) threadRef.current.scrollTop = 0;
      }, 240);
    }
  }, []);

  // 단계 기본 안내만 떠 있는 상태(사용자 입력 전)에서는 첫 줄이 보이도록
  // 스레드 스크롤을 맨 위로 둔다. 이후 사용자 메시지가 추가되면 자동으로
  // 맨 아래로 스크롤되는 기존 동작을 유지한다. useLayoutEffect로 레이아웃
  // 커밋 직후에 실행하여 기본 scrollToBottom smooth 애니메이션에 덮이지 않도록 한다.
  useLayoutEffect(() => {
    const hasUserMessage = messages.some((m) => m.role === "user");
    if (!hasUserMessage && !loading) {
      scrollToTop();
      return;
    }
    scrollToBottom();
  }, [messages, loading, scrollToBottom, scrollToTop]);

  // 컨테이너 폭·높이가 변할 때(사이드바 리사이즈, 폰트 로딩 후 리플로, 창 크기 변경)
  // 아직 사용자 입력이 없다면 스크롤을 맨 위로 재고정한다. 현재 렌더의 messages를
  // ref 로 추적해 ResizeObserver 콜백에서 최신값을 조회한다.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const t = threadRef.current;
    if (!t || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const hasUser = messagesRef.current.some((m) => m.role === "user");
      if (hasUser) return;
      if (threadRef.current) threadRef.current.scrollTop = 0;
    });
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!useSidebarRules) return;
    function onInject(e) {
      const c = e.detail?.content;
      if (typeof c !== "string" || !c.trim()) return;
      setMessages((prev) => [...prev, { role: "assistant", content: c }]);
    }
    window.addEventListener("ailab-inject-assistant", onInject);
    return () => window.removeEventListener("ailab-inject-assistant", onInject);
  }, [useSidebarRules]);

  /**
   * Phase 2a · Contextual AI Assist 훅:
   * 외부(중앙 스테이지의 컨텍스트 지원 바)에서 `ailab-ai-chat-insert-text`
   * 이벤트로 추천 질문 텍스트를 주입할 수 있다.
   *   - detail.text: 입력창에 채울 프롬프트(필수)
   *   - detail.submit: true면 즉시 전송(선택, 기본 false)
   *   - detail.preset: 선택적 프리셋 요청(현 AiChatPage는 상위에서 key로 갱신하므로
   *     이 이벤트에서는 text만 처리하고 preset은 상위가 별도 핸들링)
   */
  useEffect(() => {
    function onInsertText(e) {
      const text = e.detail?.text;
      if (typeof text !== "string" || !text.trim()) return;
      setInput(text);
      requestAnimationFrame(() => {
        const el = document.querySelector(".ai-chat-input");
        if (el && typeof el.focus === "function") el.focus();
      });
    }
    window.addEventListener("ailab-ai-chat-insert-text", onInsertText);
    return () =>
      window.removeEventListener("ailab-ai-chat-insert-text", onInsertText);
  }, []);

  const runChatFromMessages = useCallback(
    async (nextMessages) => {
      setErr(null);
      setLoading(true);
      try {
        const payload = {
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          provider: aiProvider,
        };
        const res = await apiJson("/api/ai/chat", {
          method: "POST",
          body: JSON.stringify(payload),
          timeoutMs: 180000,
        });
        const reply = res.reply || "(응답 없음)";
        const mode = res.mode || "?";
        const tools = res.tool_results || [];
        const assistantBody = `${reply}\n\n— 모드: **${mode}**`;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantBody,
            toolResults: tools,
            rawMode: mode,
          },
        ]);
        if (shouldRefreshAfterTools(tools) && onAfterTool) {
          onAfterTool();
        }
      } catch (e) {
        setErr(e.message || String(e));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `오류: ${e.message || e}`,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [aiProvider, onAfterTool]
  );

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    if (useSidebarRules) {
      if (sessionStorage.getItem(BRIEF_SUPPLEMENT_KEY) === "1") {
        let draft = null;
        try {
          const dr = sessionStorage.getItem(BRIEF_DRAFT_KEY);
          draft = dr ? JSON.parse(dr) : null;
        } catch {
          draft = null;
        }
        if (
          draft &&
          typeof draft.title === "string" &&
          typeof draft.content === "string"
        ) {
          setInput("");
          setErr(null);
          setLoading(true);
          try {
            const res = await apiJson("/api/portal/projects/refine-brief", {
              method: "POST",
              body: JSON.stringify({
                title: draft.title,
                content: draft.content,
                user_message: text,
              }),
              timeoutMs: 120000,
            });
            if (res.ok && res.title != null && res.content != null) {
              try {
                sessionStorage.setItem(
                  BRIEF_DRAFT_KEY,
                  JSON.stringify({ title: res.title, content: res.content })
                );
              } catch {
                /* ignore */
              }
              window.dispatchEvent(
                new CustomEvent("ailab-brief-applied", {
                  detail: { title: res.title, content: res.content },
                })
              );
              setMessages((prev) => [
                ...prev,
                { role: "user", content: text },
                {
                  role: "assistant",
                  content: res.assistant_reply || "반영했습니다.",
                },
              ]);
            }
          } catch (e) {
            const em = e?.message || String(e);
            setErr(em);
            setMessages((prev) => [
              ...prev,
              { role: "user", content: text },
              { role: "assistant", content: `오류: ${em}` },
            ]);
          } finally {
            setLoading(false);
          }
          return;
        }
      }

      const raw = sessionStorage.getItem(PENDING_TITLE_STORAGE_KEY);
      if (raw) {
        let pending = null;
        try {
          pending = JSON.parse(raw);
        } catch {
          sessionStorage.removeItem(PENDING_TITLE_STORAGE_KEY);
        }
        if (pending?.title) {
          if (isNegativeTitleReply(text)) {
            sessionStorage.removeItem(PENDING_TITLE_STORAGE_KEY);
          } else if (isAffirmativeTitleReply(text)) {
            setInput("");
            sessionStorage.removeItem(PENDING_TITLE_STORAGE_KEY);
            window.dispatchEvent(
              new CustomEvent("ailab-project-title-confirmed", {
                detail: { title: pending.title },
              })
            );
            setMessages((prev) => [
              ...prev,
              { role: "user", content: text },
              {
                role: "assistant",
                content:
                  "알겠습니다. 왼쪽 **프로젝트** 폼의 **제목** 칸에 반영했습니다.",
              },
            ]);
            return;
          }
        }
      }
    }

    setInput("");
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    await runChatFromMessages(next);
  }

  function sendQuick(presetText) {
    if (!presetText?.trim() || loading) return;
    const next = [...messages, { role: "user", content: presetText.trim() }];
    setMessages(next);
    runChatFromMessages(next);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section
      className={
        isWorkbench
          ? "ai-chat-page ai-chat-page--workbench panel"
          : isSidebar
            ? "ai-chat-page ai-chat-page--sidebar panel"
            : "ai-chat-page panel"
      }
    >
      <div
        className={
          isWorkbench
            ? "ai-chat-header ai-chat-header--sidebar ai-chat-header--workbench"
            : isSidebar
              ? "ai-chat-header ai-chat-header--sidebar"
              : "ai-chat-header"
        }
      >
        {!isWorkbench && (
          <div className="ai-chat-header-titles">
            <h2
              className="ai-chat-title-h2"
              style={{ margin: 0 }}
              title={useSidebarRules ? AI_AGENT_PANEL_TITLE : undefined}
            >
              {isSidebar ? AI_AGENT_PANEL_TITLE : cfg.title}
            </h2>
            {!isSidebar && (
              <p className="hint ai-chat-phase-hint">
                상단 <strong>AI 실습</strong> 메뉴에서 단계를 바꾸면 이 화면 안내가
                바뀝니다. 대화형으로 프로젝트·데이터·모델·결과를 함께 다듬을 수
                있습니다.
              </p>
            )}
          </div>
        )}
        {!isWorkbench && (
          <div className="ai-chat-provider-box">
            <label className="ai-chat-provider-label">
              모델
              <select
                className="ai-chat-provider-select"
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                disabled={loading}
              >
                {AI_PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      {providerMeta && !isSidebar && !isWorkbench && (
        <p className="hint ai-chat-provider-hint" aria-live="polite">
          OpenAI: {providerMeta.openai_configured ? "키 있음" : "키 없음"} · Gemini:{" "}
          {providerMeta.gemini_configured ? "키 있음" : "키 없음"} · Ollama:{" "}
          {providerMeta.ollama_reachable
            ? `연결됨 (${providerMeta.ollama_models?.length ?? 0} 모델)`
            : "미연결 (Ollama 기동·모델 pull 필요)"}
        </p>
      )}
      {!isSidebar && !isWorkbench && (
        <p className="hint">
          자연어로 질문하거나, 로컬 모드에서 <code>/help</code> 로 명령 목록을 확인하세요.
        </p>
      )}
      {(!isSidebar || isWorkbench) && (
        <div className="ai-chat-quick-chips" aria-label="빠른 질문">
          {cfg.chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className="ai-chat-chip"
              disabled={loading}
              onClick={() => sendQuick(c.text)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {err && <div className="auth-error">{err}</div>}

      <div ref={threadRef} className="ai-chat-thread" aria-label="대화 내역">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`ai-chat-msg ai-chat-msg--${m.role}`}
          >
            <div className="ai-chat-msg-role">
              {m.role === "user" ? "나" : "AI"}
            </div>
            <div className="ai-chat-msg-body">
              {m.role === "assistant" ? (
                <div
                  className="ai-chat-markdown"
                  dangerouslySetInnerHTML={{
                    __html: formatAssistantHtml(m.content),
                  }}
                />
              ) : (
                <pre className="ai-chat-user-pre">{m.content}</pre>
              )}
              {m.toolResults?.length > 0 && (
                <AiChatToolResults tools={m.toolResults} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-chat-msg ai-chat-msg--assistant">
            <div className="ai-chat-msg-role">AI</div>
            <div className="ai-chat-msg-body muted">응답 생성 중…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {isWorkbench && (
        <div className="ai-chat-workbench-toolbar" aria-label="대화 도구">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={clearConversation}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            title="파일·CSV는 데이터 업로드 단계나 왼쪽 워크스페이스 목록에서 추가합니다."
            onClick={scrollToBriefPanel}
          >
            Attach
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            title="프로젝트 브리프 패널로 이동해 분석을 실행합니다."
            onClick={scrollToBriefPanel}
          >
            Analyze
          </button>
        </div>
      )}
      <div className="ai-chat-input-row">
        <textarea
          className="ai-chat-input"
          rows={isWorkbench ? 2 : isSidebar ? 2 : 3}
          placeholder="메시지를 입력… (Enter 전송, Shift+Enter 줄바꿈)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          className="auth-submit ai-chat-send"
          disabled={loading}
          onClick={send}
          title="보내기"
          aria-label="보내기"
        >
          Send
        </button>
      </div>
    </section>
  );
}

function AiChatToolResults({ tools }) {
  return (
    <div className="ai-chat-tool-results">
      {tools.map((t, j) => (
        <ToolResultCard key={j} name={t.name} result={t.result} />
      ))}
    </div>
  );
}

function ToolResultCard({ name, result }) {
  if (name === "train_model" && result && typeof result === "object") {
    return (
      <div className="ai-chat-tool-card ai-chat-tool-card--train">
        <div className="ai-chat-tool-card-title">
          학습 {result.dry_run ? "(드라이 런)" : ""}
        </div>
        {result.dry_run && result.would_run && (
          <p className="ai-chat-tool-dry-hint">
            실행 전 검증입니다. 동의하면 같은 설정으로 실제 학습을 요청하세요.
          </p>
        )}
        {result.ok && result.model_id && !result.dry_run && (
          <>
            <div className="ai-chat-tool-row">
              <span className="ai-chat-tool-label">model_id</span>
              <code className="ai-chat-tool-code">{result.model_id}</code>
              <button
                type="button"
                className="btn btn-secondary ai-chat-copy"
                onClick={() => copyToClipboard(result.model_id)}
              >
                복사
              </button>
            </div>
            {result.metrics != null && (
              <pre className="ai-chat-tool-metrics">
                {JSON.stringify(result.metrics, null, 2)}
              </pre>
            )}
          </>
        )}
        {result.dry_run && result.would_run && (
          <pre className="ai-chat-tool-metrics">
            {JSON.stringify(result.would_run, null, 2)}
          </pre>
        )}
        {result.ok === false && (
          <pre className="ai-chat-tool-err">{JSON.stringify(result, null, 2)}</pre>
        )}
        {result.ok && !result.model_id && !result.dry_run && (
          <pre className="ai-chat-tool-fallback">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  if (name === "predict_batch" && result && typeof result === "object") {
    return (
      <div className="ai-chat-tool-card ai-chat-tool-card--predict">
        <div className="ai-chat-tool-card-title">
          배치 예측 {result.dry_run ? "(드라이 런)" : ""}
        </div>
        {result.dry_run && result.would_predict && (
          <p className="ai-chat-tool-dry-hint">
            실행 전 검증입니다. 동의하면 같은 설정으로 실제 예측을 요청하세요.
          </p>
        )}
        {result.ok && !result.dry_run && (
          <>
            {result.output_file != null && (
              <div className="ai-chat-tool-row">
                <span className="ai-chat-tool-label">출력</span>
                <code className="ai-chat-tool-code">{String(result.output_file)}</code>
              </div>
            )}
            {result.rows != null && (
              <p className="ai-chat-tool-meta">예측 행 수: {result.rows}</p>
            )}
            {result.preview != null && result.preview.length > 0 && (
              <pre className="ai-chat-tool-metrics">
                {JSON.stringify(result.preview, null, 2)}
              </pre>
            )}
          </>
        )}
        {result.dry_run && result.would_predict && (
          <pre className="ai-chat-tool-metrics">
            {JSON.stringify(result.would_predict, null, 2)}
          </pre>
        )}
        {result.ok === false && (
          <pre className="ai-chat-tool-err">{JSON.stringify(result, null, 2)}</pre>
        )}
      </div>
    );
  }

  return (
    <details className="ai-chat-tools">
      <summary>도구: {name}</summary>
      <pre className="ai-chat-tool-pre">
        {JSON.stringify(result, null, 2).slice(0, 8000)}
      </pre>
    </details>
  );
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard?.writeText(String(text)).catch(() => {});
}

function formatAssistantHtml(text) {
  if (!text) return "";
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\n/g, "<br/>");
  return h;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
