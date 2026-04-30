import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiJson, getToken, setToken as persistToken } from "./api";

const AuthContext = createContext(null);

/** 네트워크 순간 끊김 등으로 /me 가 실패해도 401일 때만 세션을 지웁니다. */
async function fetchMeWithRetries() {
  const delaysMs = [0, 400, 800, 1200];
  let lastErr;
  for (let i = 0; i < delaysMs.length; i += 1) {
    if (delaysMs[i] > 0) {
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
    try {
      return await apiJson("/api/auth/me");
    } catch (e) {
      lastErr = e;
      if (e?.status === 401) throw e;
    }
  }
  throw lastErr;
}

function clearSession() {
  persistToken(null);
  return null;
}

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!getToken());

  const setToken = useCallback((t) => {
    persistToken(t);
    setTokenState(t);
    if (!t) {
      setUser(null);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMeWithRetries();
        if (!cancelled) setUser(me);
      } catch (e) {
        if (!cancelled) {
          if (e?.status === 401) {
            setTokenState(clearSession());
            setUser(null);
          } else {
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || user) return undefined;
    function onOnline() {
      (async () => {
        try {
          const me = await fetchMeWithRetries();
          setUser(me);
        } catch (e) {
          if (e?.status === 401) {
            setTokenState(clearSession());
            setUser(null);
          }
        }
      })();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [token, user]);

  const logout = useCallback(() => setToken(null), [setToken]);

  const refreshUser = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    try {
      const me = await fetchMeWithRetries();
      setUser(me);
    } catch (e) {
      if (e?.status === 401) {
        setTokenState(clearSession());
        setUser(null);
      }
      throw e;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, user, loading, setToken, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
