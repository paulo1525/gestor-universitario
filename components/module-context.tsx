"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-context";
import type { ResolvedModuleHomepage } from "@/lib/module-homepages";

export type ModuleNode = {
  key: string;
  enabled?: boolean;
  effectiveEnabled?: boolean;
  homepageEligible?: boolean;
  isHomepage?: boolean;
  submodules?: ModuleNode[];
};

type ModuleState = {
  modules: ModuleNode[];
  home: ResolvedModuleHomepage | null;
  access: Record<string, boolean>;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  synchronize: (modules: ModuleNode[], home?: ResolvedModuleHomepage | null) => void;
};

const ModuleContext = createContext<ModuleState | null>(null);

function moduleAccess(modules: ModuleNode[]): Record<string, boolean> {
  const nodes = modules.flatMap((module) => [module, ...(module.submodules || [])]);
  return Object.fromEntries(nodes.map((module) => [
    module.key,
    module.effectiveEnabled ?? module.enabled !== false,
  ]));
}

type ModulesPayload = { modules: ModuleNode[]; home: ResolvedModuleHomepage | null };

async function fetchModules(signal?: AbortSignal): Promise<ModulesPayload> {
  const response = await fetch("/api/modules", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) throw new Error();
  const data = await response.json() as { modules?: ModuleNode[]; home?: ResolvedModuleHomepage | null };
  return { modules: data.modules || [], home: data.home || null };
}

export function ModuleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [modules, setModules] = useState<ModuleNode[]>([]);
  const [home, setHome] = useState<ResolvedModuleHomepage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchModules(controller.signal)
      .then((payload) => { setModules(payload.modules); setHome(payload.home); setError(false); })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) { setModules([]); setHome(null); setError(true); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (authLoading || !user || !error) return;
    const controller = new AbortController();
    void fetchModules(controller.signal)
      .then((payload) => { setModules(payload.modules); setHome(payload.home); setError(false); })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) { setModules([]); setHome(null); setError(true); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [authLoading, error, user]);

  const synchronize = useCallback((nextModules: ModuleNode[], nextHome?: ResolvedModuleHomepage | null) => {
    setModules(nextModules);
    if (nextHome !== undefined) setHome(nextHome);
    setError(false);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchModules();
      setModules(payload.modules);
      setHome(payload.home);
      setError(false);
    } catch {
      setModules([]);
      setHome(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({
    modules,
    home,
    access: moduleAccess(modules),
    loading,
    error,
    refresh,
    synchronize,
  }), [error, home, loading, modules, refresh, synchronize]);

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>;
}

export function useModules(): ModuleState {
  const context = useContext(ModuleContext);
  if (!context) throw new Error("useModules deve ser usado dentro de ModuleProvider");
  return context;
}
