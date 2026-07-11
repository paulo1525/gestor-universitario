"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AuthUser = { email: string; role: "student" | "representative" | "admin" };
type AuthState = { user: AuthUser | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as { user?: AuthUser | null };
      setUser(response.ok ? result.user || null : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    setUser(null);
    window.location.assign("/login");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, result: await response.json() as { user?: AuthUser | null } }))
      .then(({ ok, result }) => setUser(ok ? result.user || null : null))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setUser(null); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
