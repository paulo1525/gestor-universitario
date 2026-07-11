"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type FontScale = "small" | "normal" | "large";
export type AuthUser = { email: string; fullName: string; role: "student" | "representative" | "admin"; fontScale: FontScale };
type AuthState = { user: AuthUser | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; setFontScale: (fontScale: FontScale) => Promise<void> };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const applyFontScale = useCallback((fontScale: FontScale) => { document.documentElement.dataset.fontScale = fontScale; }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as { user?: AuthUser | null };
      const nextUser = response.ok ? result.user || null : null; setUser(nextUser); if (nextUser) applyFontScale(nextUser.fontScale);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyFontScale]);

  const setFontScale = useCallback(async (fontScale: FontScale) => {
    const previous = user?.fontScale || "normal"; applyFontScale(fontScale); setUser((current) => current ? { ...current, fontScale } : current);
    try { const response = await fetch("/api/auth/accessibility", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ fontScale }) }); if (!response.ok) throw new Error(); }
    catch { applyFontScale(previous); setUser((current) => current ? { ...current, fontScale: previous } : current); }
  }, [applyFontScale, user?.fontScale]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
    setUser(null);
    window.location.assign("/login");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ ok: response.ok, result: await response.json() as { user?: AuthUser | null } }))
      .then(({ ok, result }) => { const nextUser = ok ? result.user || null : null; setUser(nextUser); if (nextUser) applyFontScale(nextUser.fontScale); })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setUser(null); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [applyFontScale]);
  const value = useMemo(() => ({ user, loading, refresh, logout, setFontScale }), [user, loading, refresh, logout, setFontScale]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
