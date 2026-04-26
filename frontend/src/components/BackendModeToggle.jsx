import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getBackendHint,
  getStoredBackendMode,
  setStoredBackendMode,
} from "../api/backendMode";
import {
  getAwsApiBaseWithOverride,
  setAwsApiBaseOverride,
} from "../services/config/publicEnv";
import { ensureRemoteBackendReachable } from "../api/devBackendBootstrap";
import {
  AI_PROVIDER_OPTIONS,
  readStoredAiProvider,
  writeStoredAiProvider,
} from "../api/aiProviderPref.js";

export default function BackendModeToggle({
  disabled = false,
  onReadyChange,
}) {
  const [mode, setMode] = useState(() => {
    const stored = getStoredBackendMode();
    if (!stored) return "render";
    if (stored === "local") return "render";
    if (stored === "aws") return "aws";
    return "render";
  });
  const [boot, setBoot] = useState(null);
  const userExplicitlyChoseRemote = useRef(false);
  const [endpointRevision, setEndpointRevision] = useState(0);
  const [awsUrlDraft, setAwsUrlDraft] = useState(() => getAwsApiBaseWithOverride());
  const [devFallbackNotice, setDevFallbackNotice] = useState(null);
  const [aiProvider, setAiProvider] = useState(() => readStoredAiProvider());

  useEffect(() => {
    setStoredBackendMode(mode);
    window.dispatchEvent(new CustomEvent("ailab-backend-mode-change", { detail: mode }));
  }, [mode]);

  useLayoutEffect(() => {
    const stored = getStoredBackendMode();
    if (stored === "aws") {
      userExplicitlyChoseRemote.current = true;
    }
  }, []);

  useEffect(() => {
    setAwsUrlDraft(getAwsApiBaseWithOverride());
  }, [mode, endpointRevision]);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    async function run() {
      onReadyChange?.(false);
      setBoot({ phase: "loading" });
      try {
        const kind = mode === "aws" ? "aws" : "render";
        const r = await ensureRemoteBackendReachable(kind, ac.signal);
        if (!cancelled) {
          if (
            import.meta.env.DEV &&
            !r.ok &&
            !userExplicitlyChoseRemote.current
          ) {
            setDevFallbackNotice(
              "저장된 원격 서버에 연결되지 않아 개발 모드에서 Cloud(Render)로 전환했습니다. 망·방화벽을 확인한 뒤 Render/AWS 를 다시 선택하세요."
            );
            setMode("render");
            return;
          }
          setBoot({ phase: "done", ...r });
          onReadyChange?.(r.ok);
        }
      } catch (e) {
        if (!cancelled) {
          setBoot({
            phase: "done",
            ok: false,
            message: String(e?.message || e),
          });
          onReadyChange?.(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [mode, onReadyChange, endpointRevision]);

  return (
    <div className="auth-backend-mode">
      <div className="auth-backend-mode-label">백엔드 연결 (Cloud · Render / AWS)</div>
      <div
        className="auth-backend-mode-sub"
        role="group"
        aria-label="Cloud API 종류"
      >
        <button
          type="button"
          className={
            mode === "render"
              ? "auth-backend-mode-btn auth-backend-mode-btn--sub auth-backend-mode-btn--active"
              : "auth-backend-mode-btn auth-backend-mode-btn--sub"
          }
          disabled={disabled}
          onClick={() => {
            setDevFallbackNotice(null);
            userExplicitlyChoseRemote.current = true;
            setMode("render");
          }}
        >
          Render
        </button>
        <button
          type="button"
          className={
            mode === "aws"
              ? "auth-backend-mode-btn auth-backend-mode-btn--sub auth-backend-mode-btn--active"
              : "auth-backend-mode-btn auth-backend-mode-btn--sub"
          }
          disabled={disabled}
          onClick={() => {
            setDevFallbackNotice(null);
            userExplicitlyChoseRemote.current = true;
            setMode("aws");
          }}
        >
          AWS
        </button>
      </div>
      <div className="auth-ai-agent-model">
        <div className="auth-ai-agent-model-label">AI Agent 모델</div>
        <select
          className="auth-ai-agent-model-select"
          value={aiProvider}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setAiProvider(v);
            writeStoredAiProvider(v);
          }}
          aria-label="AI Agent 백엔드"
        >
          {AI_PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="auth-backend-mode-hint">
        {getBackendHint(mode)} (연구실 IP 직접 URL 연결은 지원하지 않습니다.)
      </p>
      {mode === "aws" && (
        <div className="auth-backend-endpoint-row">
          <label className="auth-backend-endpoint-label" htmlFor="ailab-aws-api-base">
            AWS API 베이스 URL
          </label>
          <input
            id="ailab-aws-api-base"
            type="url"
            className="auth-backend-endpoint-input"
            placeholder="https://…"
            value={awsUrlDraft}
            disabled={disabled}
            onChange={(e) => setAwsUrlDraft(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn-secondary auth-backend-endpoint-save"
            disabled={disabled}
            onClick={() => {
              setAwsApiBaseOverride(awsUrlDraft.trim() || null);
              setDevFallbackNotice(null);
              userExplicitlyChoseRemote.current = true;
              setEndpointRevision((n) => n + 1);
            }}
          >
            저장 후 다시 확인
          </button>
        </div>
      )}
      {devFallbackNotice && (
        <p className="auth-backend-mode-status auth-backend-mode-status--pending">
          {devFallbackNotice}
        </p>
      )}
      {boot?.phase === "loading" && (
        <p className="auth-backend-mode-status auth-backend-mode-status--pending">
          준비 중… (백엔드 확인)
        </p>
      )}
      {boot?.phase === "done" && (
        <p
          className={
            boot.ok
              ? "auth-backend-mode-status auth-backend-mode-status--ok"
              : "auth-backend-mode-status auth-backend-mode-status--err"
          }
        >
          {boot.message}
        </p>
      )}
    </div>
  );
}
