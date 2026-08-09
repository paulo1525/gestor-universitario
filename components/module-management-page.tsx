"use client";

import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminPage, AdminPageHeader } from "@/components/admin-ui";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { ModuleManagement } from "@/components/module-management";

export function ModuleManagementPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user?.testMode && user?.email.toLowerCase() !== "up202507850@up.pt") return <main className="auth-loading"><ShieldCheck size={28}/><strong>{t("admin.modulesPage.accessDenied")}</strong></main>;
  return <AppShell active="modules" breadcrumb={t("admin.modulesPage.breadcrumb")}><AdminPage>
    <AdminPageHeader eyebrow={t("admin.modulesPage.eyebrow")} title={t("admin.modulesPage.title")} description={t("admin.modulesPage.description")} />
    <ModuleManagement />
  </AdminPage></AppShell>;
}
