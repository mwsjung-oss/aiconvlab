import { useEffect } from "react";
import {
  getBackendHint,
  getStoredBackendMode,
  setStoredBackendMode,
} from "../api/backendMode";
import { ensureRemoteBackendReachable } from "../api/devBackendBootstrap";
import {
  AI_PROVIDER_OPTIONS,
  readStoredAiProvider,
  writeStoredAiProvider,
} from "../api/aiProviderPref.js";

/**
 * 레거시 다중 백엔드 토글을 제거하고 단일 운영 URL(AWS Elastic Beanstalk 권장) 연결 상태만 표시합니다.
 */
export default function BackendModeToggle({ disabled = false, onReadyChange }) {
  const mode = getStoredBackendMode() ?? "cloud";

  useEffect(() => {
    setStoredBackendMode(mode === "local" ? "local" : "cloud");
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function probe() {
      onReadyChange?.(false);
      try {
        const kind = mode === "local" ? "render" : "aws";
        const r = await ensureRemoteBackendReachable(kind, ac.signal);
        if (!cancelled) onReadyChange?.(r.ok);
      } catch {
        if (!cancelled) onReadyChange?.(false);
      }
    }
    probe();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [mode, onReadyChange]);

  return (
    <div className="auth-backend-mode">
      <div className="auth-backend-mode-label">
        APS Backend (단일 운영 URL · Elastic Beanstalk)
      </div>
      <div className="auth-ai-agent-model">
        <div className="auth-ai-agent-model-label">AI Agent 모델</div>
        <select
          className="auth-ai-agent-model-select"
          value={readStoredAiProvider()}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
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
      <p className="auth-backend-mode-status auth-backend-mode-status--pending">
        Primary SPA 는 AWS Amplify 에서 빌드됩니다. 롤백·레거시 Cloudflare 참고는
        docs/aws-cutover-runbook.md 및 docs/cloudflare-render-retirement.md 입니다.
      </p>
    </div>
  );
}
