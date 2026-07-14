"use client";

import { ReactNode } from "react";
import { Boxes, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useModules } from "@/components/module-context";

export function ModuleGuard({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const { access, loading } = useModules();
  const { t } = useI18n();
  const enabled = access[moduleKey] === true;

  if (loading) return <main className="auth-loading"><LoaderCircle className="spin" size={28} /><strong>{t("guard.preparing")}</strong></main>;
  if (!enabled) return <main className="auth-loading auth-loading--denied" role="alert"><Boxes size={28}/><div><strong>{t("guard.moduleDisabled")}</strong><span>{t("guard.moduleDisabledDescription")}</span></div></main>;
  return children;
}

export function HomeModuleGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const preferenceOnly = user?.role === "student" && !user.classRepresentative && !user.preview;
  return <ModuleGuard moduleKey={preferenceOnly ? "classes.preferences" : "classes.rosters"}>{children}</ModuleGuard>;
}
