"use client";

import { Boxes, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { ModuleManagement } from "@/components/module-management";

export function ModuleManagementPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user?.testMode && user?.email.toLowerCase() !== "up202507850@up.pt") return <main className="auth-loading"><ShieldCheck size={28}/><strong>{t("admin.modulesPage.accessDenied")}</strong></main>;
  return <AppShell active="modules" breadcrumb={t("admin.modulesPage.breadcrumb")}>
    <header className="page-heading"><div><span className="eyebrow">{t("admin.modulesPage.eyebrow")}</span><h1>{t("admin.modulesPage.title")}</h1><p>{t("admin.modulesPage.description")}</p></div><span className="page-heading__icon"><Boxes/></span></header>
    <ModuleManagement />
  </AppShell>;
}
