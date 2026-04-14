import { useEffect, useRef, useState } from "react";
import {
  getBackendHint,
  getStoredBackendMode,
  setStoredBackendMode,
} from "../api/backendMode";
import {
  ensureLabBackendReachable,
  ensureLocalBackendReady,
} from "../api/devBackendBootstrap";

export default function BackendModeToggle({
  disabled = false,
  onReadyChange,
}) {
  const [mode, setMode] = useState(() => getStoredBackendMode() || "local");
  const [boot, setBoot] = useState(null);
  /** 이번 세션에서 사용자가 ‘연구실 서버’ 버튼을 직접 눌렀을 때만 true (저장값으로 lab이 열린 경우는 false) */
  const userExplicitlyChoseLab = useRef(false);
  const [devFallbackNotice, setDevFallbackNotice] = useState(null);

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
          const r = await ensureLabBackendReachable(ac.signal);
          if (!cancelled) {
            if (
              import.meta.env.DEV &&
              !r.ok &&
              !userExplicitlyChoseLab.current
            ) {
              setDevFallbackNotice(
                "저장된 ‘연구실 서버’에 연결되지 않아 개발 모드에서 로컬로 전환했습니다. VPN·망을 확인한 뒤 필요하면 아래에서 ‘연구실 서버’를 다시 선택하세요."
              );
              setMode("local");
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
            mode === "local"
              ? "auth-backend-mode-btn auth-backend-mode-btn--active"
              : "auth-backend-mode-btn"
          }
          disabled={disabled}
          onClick={() => {
            setDevFallbackNotice(null);
            userExplicitlyChoseLab.current = false;
            setMode("local");
          }}
        >
          이 PC (로컬)
        </button>
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
            userExplicitlyChoseLab.current = true;
            setMode("lab");
          }}
        >
          연구실 서버
        </button>
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
