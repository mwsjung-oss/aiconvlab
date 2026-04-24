/**
 * useKernel — 백엔드 /api/kernel/* 래퍼 훅
 *
 * 제공 메서드:
 *   status            { ready, busy, lastError, kernelId }
 *   start()           커널 보장(없으면 생성)
 *   execute(code, activityId?, cellId?)  코드 실행 → outputs[]
 *   interrupt()       현재 실행 중 인터럽트
 *   shutdown()        커널 종료
 *   loadFile(name)    업로드된 CSV 를 커널에 df 로 로드 + head 반환
 *
 * 모든 실패는 throw 하지 않고 {ok:false, error} 를 돌려준다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { requestJson } from "../../../services/api/client";

async function safePost(path, body) {
  try {
    const res = await requestJson(path, {
      method: "POST",
      body: body || {},
    });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function safeGet(path) {
  try {
    const res = await requestJson(path, { method: "GET" });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export function useKernel({ autoStart = true } = {}) {
  const [status, setStatus] = useState({
    ready: false,
    busy: false,
    kernelId: null,
    lastError: null,
    startupMsg: null,
  });
  const startingRef = useRef(false);

  const start = useCallback(async () => {
    if (status.ready || startingRef.current) return { ok: true };
    startingRef.current = true;
    setStatus((s) => ({ ...s, busy: true, lastError: null }));
    const r = await safePost("/api/kernel/start", {});
    startingRef.current = false;
    if (r.ok) {
      setStatus((s) => ({
        ...s,
        ready: true,
        busy: false,
        kernelId: r.data?.kernel_id || null,
        startupMsg: r.data?.message || null,
        lastError: null,
      }));
    } else {
      setStatus((s) => ({
        ...s,
        ready: false,
        busy: false,
        lastError: r.error,
      }));
    }
    return r;
  }, [status.ready]);

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [autoStart, start]);

  const execute = useCallback(async (code, opts = {}) => {
    setStatus((s) => ({ ...s, busy: true, lastError: null }));
    const r = await safePost("/api/kernel/execute", {
      code,
      activity_id: opts.activityId || null,
      cell_id: opts.cellId || null,
    });
    if (r.ok) {
      setStatus((s) => ({ ...s, busy: false }));
      return { ok: true, ...r.data };
    }
    setStatus((s) => ({ ...s, busy: false, lastError: r.error }));
    return { ok: false, error: r.error };
  }, []);

  const interrupt = useCallback(async () => {
    const r = await safePost("/api/kernel/interrupt", {});
    return r;
  }, []);

  const shutdown = useCallback(async () => {
    const r = await safePost("/api/kernel/shutdown", {});
    setStatus({
      ready: false,
      busy: false,
      kernelId: null,
      lastError: null,
      startupMsg: null,
    });
    return r;
  }, []);

  const loadFile = useCallback(async (filename) => {
    setStatus((s) => ({ ...s, busy: true, lastError: null }));
    const r = await safePost("/api/kernel/load_file", { filename });
    setStatus((s) => ({ ...s, busy: false }));
    return r;
  }, []);

  const refreshStatus = useCallback(async () => {
    const r = await safeGet("/api/kernel/status");
    if (r.ok) {
      setStatus((s) => ({
        ...s,
        ready: Boolean(r.data?.ready),
        kernelId: r.data?.kernel_id || s.kernelId,
        busy: Boolean(r.data?.busy),
      }));
    }
    return r;
  }, []);

  return {
    status,
    start,
    execute,
    interrupt,
    shutdown,
    loadFile,
    refreshStatus,
  };
}
