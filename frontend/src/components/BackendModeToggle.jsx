import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getBackendHint,
  getStoredBackendMode,
  setStoredBackendMode,
} from "../api/backendMode";
import {
  getAwsApiBaseWithOverride,
  getLabApiBaseWithOverride,
  setAwsApiBaseOverride,
  setLabApiBaseOverride,
} from "../services/config/publicEnv";
import {
  ensureLocalBackendReady,
  ensureRemoteBackendReachable,
} from "../api/devBackendBootstrap";
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
    if (!stored || stored === "local") return "render";
    return stored;
  });
  const [boot, setBoot] = useState(null);
  /** 이번 세션에서 사용자가 ‘원격 서버’ 또는 하위 항목을 직접 눌렀을 때만 true */
  const userExplicitlyChoseRemote = useRef(false);
  /** 연구실·AWS URL 저장 시 헬스 재검사 */
  const [endpointRevision, setEndpointRevision] = useState(0);
  const [labUrlDraft, setLabUrlDraft] = useState(() => getLabApiBaseWithOverride());
  const [awsUrlDraft, setAwsUrlDraft] = useState(() => getAwsApiBaseWithOverride());
  const [devFallbackNotice, setDevFallbackNotice] = useState(null);
  const [aiProvider, setAiProvider] = useState(() => readStoredAiProvider());

  useEffect(() => {
    setStoredBackendMode(mode);
    window.dispatchEvent(new CustomEvent("ailab-backend-mode-change", { detail: mode }));
  }, [mode]);

  useLayoutEffect(() => {
    const stored = getStoredBackendMode();
    if (stored === "lab" || stored === "aws") {
      userExplicitlyChoseRemote.current = true;
    }
  }, []);

  useEffect(() => {
    setLabUrlDraft(getLabApiBaseWithOverride());
  }, [mode, endpointRevision]);

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
        if (mode === "local") {
          const r = await ensureLocalBackendReady(ac.signal);
          if (!cancelled) {
            setBoot({ phase: "done", ...r });
            onReadyChange?.(r.ok);
          }
        } else {
          const kind = mode === "lab" ? "lab" : mode === "render" ? "render" : "aws";
          const r = await ensureRemoteBackendReachable(kind, ac.signal);
          if (!cancelled) {
            if (
              import.meta.env.DEV &&
              !r.ok &&
              !userExplicitlyChoseRemote.current
            ) {
              setDevFallbackNotice(
                "저장된 원격 서버에 연결되지 않아 개발 모드에서 Cloud(Render)로 전환했습니다. VPN·망을 확인한 뒤 필요하면 아래에서 서버를 다시 선택하세요."
              );
              setMode("render");
              return;
            }
            setBoot({ phase: "done", ...r });
            onReadyChange?.(r.ok);
          }
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
      <div className="auth-backend-mode-label">백엔드 연결</div>
      <div className="auth-backend-mode-buttons" role="group" aria-label="백엔드 선택">
        <button
          type="button"
          className={
            mode === "lab"
              ? "auth-backend-mode-btn auth-backend-mode-btn--active"
              : "auth-backend-mode-btn"
          }
          disabled={disabled}
          onClick={() => {
            setDevFallbackNotice(null);
            userExplicitlyChoseRemote.current = true;
            setMode("lab");
          }}
        >
          연구실 서버
        </button>
        <button
          type="button"
          className={
            mode === "render" || mode === "aws"
              ? "auth-backend-mode-btn auth-backend-mode-btn--active"
              : "auth-backend-mode-btn"
          }
          disabled={disabled}
          onClick={() => {
            setDevFallbackNotice(null);
            userExplicitlyChoseRemote.current = true;
            setMode((prev) => (prev === "aws" || prev === "render" ? prev : "render"));
          }}
          aria-expanded={mode === "render" || mode === "aws"}
          aria-controls="auth-backend-cloud-sub"
        >
          Cloud
        </button>
      </div>
      {(mode === "render" || mode === "aws") && (
        <div
          id="auth-backend-cloud-sub"
          className="auth-backend-mode-sub"
          role="group"
          aria-label="Cloud 종류"
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
      )}
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
      <p className="auth-backend-mode-hint">{getBackendHint(mode)}</p>
      {mode === "lab" && (
        <div className="auth-backend-endpoint-row">
          <label className="auth-backend-endpoint-label" htmlFor="ailab-lab-api-base">
            연구실 API 베이스 URL
          </label>
          <input
            id="ailab-lab-api-base"
            type="url"
            className="auth-backend-endpoint-input"
            placeholder="예: http://192.168.0.10:8000 또는 Tailscale URL"
            value={labUrlDraft}
            disabled={disabled}
            onChange={(e) => setLabUrlDraft(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn-secondary auth-backend-endpoint-save"
            disabled={disabled}
            onClick={() => {
              setLabApiBaseOverride(labUrlDraft.trim() || null);
              setDevFallbackNotice(null);
              userExplicitlyChoseRemote.current = true;
              setEndpointRevision((n) => n + 1);
            }}
          >
            저장 후 다시 확인
          </button>
        </div>
      )}
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
