import { useEffect, useRef, useState } from "react";
import {
  getBackendHint,
  getStoredBackendMode,
  setStoredBackendMode,
} from "../api/backendMode";
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
    if (!stored || stored === "local") return "aws";
    return stored;
  });
  const [boot, setBoot] = useState(null);
  /** 이번 세션에서 사용자가 ‘원격 서버’ 또는 하위 항목을 직접 눌렀을 때만 true */
  const userExplicitlyChoseRemote = useRef(false);
  const [devFallbackNotice, setDevFallbackNotice] = useState(null);
  const [aiProvider, setAiProvider] = useState(() => readStoredAiProvider());

  useEffect(() => {
    setStoredBackendMode(mode);
    window.dispatchEvent(new CustomEvent("ailab-backend-mode-change", { detail: mode }));
  }, [mode]);

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
          const kind = mode === "lab" ? "lab" : "aws";
          const r = await ensureRemoteBackendReachable(kind, ac.signal);
          if (!cancelled) {
            if (
              import.meta.env.DEV &&
              !r.ok &&
              !userExplicitlyChoseRemote.current
            ) {
              setDevFallbackNotice(
                "저장된 원격 서버에 연결되지 않아 개발 모드에서 Cloud(AWS)로 전환했습니다. VPN·망을 확인한 뒤 필요하면 아래에서 서버를 다시 선택하세요."
              );
              setMode("aws");
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
  }, [mode, onReadyChange]);

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
            mode === "aws"
              ? "auth-backend-mode-btn auth-backend-mode-btn--active"
              : "auth-backend-mode-btn"
          }
          disabled={disabled}
          onClick={() => {
            setDevFallbackNotice(null);
            userExplicitlyChoseRemote.current = true;
            setMode("aws");
          }}
        >
          Cloud (AWS)
        </button>
      </div>
      <div className="auth-chatbot-model">
        <div className="auth-chatbot-model-label">Chatbot 모델</div>
        <select
          className="auth-chatbot-model-select"
          value={aiProvider}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setAiProvider(v);
            writeStoredAiProvider(v);
          }}
          aria-label="Chatbot AI 백엔드"
        >
          {AI_PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="auth-backend-mode-hint">{getBackendHint(mode)}</p>
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
