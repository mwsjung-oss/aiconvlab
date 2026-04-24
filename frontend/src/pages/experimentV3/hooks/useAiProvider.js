/**
 * useAiProvider — V3 AI Provider 선택 상태
 * --------------------------------------------------------------
 * - OpenAI / Gemini 를 사용자가 고를 수 있게 한다.
 * - 선택값은 localStorage (`ailab_ai_provider`) 에 저장되어
 *   다른 페이지(AiChatPage 등)와도 공유된다.
 * - 마운트 시 `GET /api/chat/health` 를 한 번 호출해 각 provider 의
 *   서버 키 설정 여부(`openai_configured`, `gemini_configured`) 를
 *   함께 제공한다. 사용자가 키 미설정 provider 를 고르면 UI 에서
 *   노란 경고 점을 보여 줄 수 있도록 한다.
 */
import { useCallback, useEffect, useState } from "react";
import { apiJson } from "../../../api.js";
import {
  AI_PROVIDER_STORAGE_KEY,
  readStoredAiProvider,
  writeStoredAiProvider,
} from "../../../api/aiProviderPref.js";

const SUPPORTED = ["openai", "gemini"];

function normalize(v) {
  if (typeof v !== "string") return "openai";
  const k = v.trim().toLowerCase();
  return SUPPORTED.includes(k) ? k : "openai";
}

export function useAiProvider() {
  const [provider, setProviderState] = useState(() =>
    normalize(readStoredAiProvider())
  );
  const [health, setHealth] = useState({
    loading: true,
    openai: false,
    gemini: false,
    error: null,
    checkedAt: null,
  });

  const refreshHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, loading: true, error: null }));
    try {
      const j = await apiJson("/api/chat/health", {
        method: "GET",
        omitAuth: true,
      });
      setHealth({
        loading: false,
        openai: !!j?.openai_configured,
        gemini: !!j?.gemini_configured,
        error: null,
        checkedAt: Date.now(),
      });
    } catch (e) {
      setHealth((h) => ({
        ...h,
        loading: false,
        error: e?.message || String(e),
      }));
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const setProvider = useCallback((v) => {
    const next = normalize(v);
    writeStoredAiProvider(next);
    setProviderState(next);
  }, []);

  useEffect(() => {
    const onChange = (e) => {
      const next = normalize(e?.detail);
      setProviderState((prev) => (prev === next ? prev : next));
    };
    const onStorage = (e) => {
      if (e.key === AI_PROVIDER_STORAGE_KEY) {
        setProviderState(normalize(e.newValue));
      }
    };
    window.addEventListener("ailab-ai-provider-change", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ailab-ai-provider-change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isConfigured =
    (provider === "openai" && health.openai) ||
    (provider === "gemini" && health.gemini);

  return {
    provider,
    setProvider,
    health,
    refreshHealth,
    isConfigured,
    supported: SUPPORTED,
  };
}
