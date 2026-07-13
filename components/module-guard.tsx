"use client";

import { ReactNode, useEffect, useState } from "react";
import { Boxes, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth-context";

type ModuleNode = { key: string; effectiveEnabled?: boolean; enabled?: boolean; submodules?: ModuleNode[] };

export function ModuleGuard({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/modules", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ modules?: ModuleNode[] }>;
      })
      .then(({ modules = [] }) => {
        const flattened = modules.flatMap((module) => [module, ...(module.submodules || [])]);
        const target = flattened.find((module) => module.key === moduleKey);
        setEnabled(target ? (target.effectiveEnabled ?? target.enabled !== false) : false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setEnabled(false);
      });
    return () => controller.abort();
  }, [moduleKey]);

  if (enabled === null) return <main className="auth-loading"><LoaderCircle className="spin" size={28} /><strong>A validar o módulo…</strong></main>;
  if (!enabled) return <main className="auth-loading auth-loading--denied" role="alert"><Boxes size={28}/><div><strong>Módulo temporariamente desativado.</strong><span>O administrador principal pode voltar a ativá-lo no painel administrativo.</span></div></main>;
  return children;
}

export function HomeModuleGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const preferenceOnly = user?.role === "student" && !user.classRepresentative && !user.preview;
  return <ModuleGuard moduleKey={preferenceOnly ? "classes.preferences" : "classes.rosters"}>{children}</ModuleGuard>;
}
