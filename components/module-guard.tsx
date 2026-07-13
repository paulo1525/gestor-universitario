"use client";

import { ReactNode } from "react";
import { Boxes, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { useModules } from "@/components/module-context";

export function ModuleGuard({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { access, loading } = useModules();
  const enabled = access[moduleKey] === true;

  if (loading) return <main className="auth-loading"><LoaderCircle className="spin" size={28} /><strong>A preparar a aplicação…</strong></main>;
  if (!enabled) return <main className="auth-loading auth-loading--denied" role="alert"><Boxes size={28}/><div><strong>Módulo temporariamente desativado.</strong><span>O administrador principal pode voltar a ativá-lo no painel administrativo.</span></div></main>;
  return children;
}

export function HomeModuleGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const preferenceOnly = user?.role === "student" && !user.classRepresentative && !user.preview;
  return <ModuleGuard moduleKey={preferenceOnly ? "classes.preferences" : "classes.rosters"}>{children}</ModuleGuard>;
}
