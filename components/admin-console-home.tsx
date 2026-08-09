"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AdminMetric, AdminMetricGrid, AdminNavigationItem, AdminNavigationList, AdminPage, AdminPageHeader, AdminSection, AdminSectionGrid } from "@/components/admin-ui";
import { AppShell } from "@/components/app-shell";
import { useI18n } from "@/components/i18n-context";

type AdminSnapshot = {
  users: number;
  pendingUsers: number;
  maintenance: boolean;
};

export function AdminConsoleHome() {
  const { locale, t } = useI18n();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    try {
      const [usersResponse, settingsResponse] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/settings", { cache: "no-store" }),
      ]);
      if (!usersResponse.ok || !settingsResponse.ok) return;
      const usersData = await usersResponse.json() as { users?: Array<{ status?: string }> };
      const settingsData = await settingsResponse.json() as { maintenanceMode?: boolean };
      const users = usersData.users ?? [];
      setSnapshot({
        users: users.length,
        pendingUsers: users.filter((user) => user.status === "pending").length,
        maintenance: Boolean(settingsData.maintenanceMode),
      });
    } catch {
      // A consola continua totalmente navegável se um resumo não estiver disponível.
    } finally {
      setLoading(false);
    }
  }, []);

  // O efeito inicia I/O; as atualizações de estado ocorrem apenas após a resposta.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSnapshot();
  }, [loadSnapshot]);

  const numberLocale = locale === "en" ? "en-GB" : "pt-PT";

  return <AppShell active="admin" breadcrumb={t("admin.home.breadcrumb")}>
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("admin.home.eyebrow")}
        title={t("admin.home.title")}
        description={t("admin.home.description")}
      />

      <AdminMetricGrid label={t("admin.home.statusLabel")}>
        <AdminMetric
          icon={<Users />}
          label={t("admin.home.users")}
          value={snapshot?.users.toLocaleString(numberLocale) ?? "—"}
          detail={snapshot ? t("admin.home.usersDetail") : t("admin.home.summaryUnavailable")}
          loading={loading}
          loadingLabel={t("admin.home.loading")}
        />
        <AdminMetric
          icon={<ClipboardCheck />}
          label={t("admin.home.pending")}
          value={snapshot?.pendingUsers.toLocaleString(numberLocale) ?? "—"}
          detail={!snapshot ? t("admin.home.summaryUnavailable") : snapshot.pendingUsers ? t("admin.home.pendingDetail") : t("admin.home.noPending")}
          tone={!snapshot ? "neutral" : snapshot.pendingUsers ? "warning" : "success"}
          loading={loading}
          loadingLabel={t("admin.home.loading")}
        />
        <AdminMetric
          icon={snapshot?.maintenance ? <Settings /> : <CheckCircle2 />}
          label={t("admin.home.publicAccess")}
          value={!snapshot ? "—" : snapshot.maintenance ? t("admin.home.maintenance") : t("admin.home.available")}
          detail={!snapshot ? t("admin.home.summaryUnavailable") : snapshot.maintenance ? t("admin.home.maintenanceDetail") : t("admin.home.availableDetail")}
          tone={!snapshot ? "neutral" : snapshot.maintenance ? "warning" : "success"}
          loading={loading}
          loadingLabel={t("admin.home.loading")}
        />
      </AdminMetricGrid>

      <AdminSectionGrid>
        <AdminSection
          icon={<BookOpen />}
          title={t("admin.home.academicContent")}
          description={t("admin.home.academicContentDescription")}
        >
          <AdminNavigationList label={t("admin.home.academicContent")}>
            <AdminNavigationItem
              href="/admin/unidades-curriculares"
              icon={<BookOpen />}
              title={t("admin.home.curricularUnits")}
              description={t("admin.home.curricularUnitsDescription")}
            />
            <AdminNavigationItem
              href="/admin/testes"
              icon={<ClipboardCheck />}
              title={t("admin.home.quizzes")}
              description={t("admin.home.quizzesDescription")}
            />
          </AdminNavigationList>
        </AdminSection>

        <AdminSection
          icon={<Users />}
          title={t("admin.home.peopleAccess")}
          description={t("admin.home.peopleAccessDescription")}
        >
          <AdminNavigationList label={t("admin.home.peopleAccess")}>
            <AdminNavigationItem
              href="/admin/utilizadores"
              icon={<Users />}
              title={t("admin.home.userManagement")}
              description={t("admin.home.userManagementDescription")}
              meta={snapshot?.pendingUsers ? t(snapshot.pendingUsers === 1 ? "admin.home.pendingMetaOne" : "admin.home.pendingMetaMany", { count: snapshot.pendingUsers }) : undefined}
            />
          </AdminNavigationList>
        </AdminSection>

        <AdminSection
          icon={<Activity />}
          title={t("admin.home.monitoring")}
          description={t("admin.home.monitoringDescription")}
        >
          <AdminNavigationList label={t("admin.home.monitoring")}>
            <AdminNavigationItem
              href="/admin/dashboard"
              icon={<Activity />}
              title={t("admin.home.indicators")}
              description={t("admin.home.indicatorsDescription")}
            />
            <AdminNavigationItem
              href="/admin/historico"
              icon={<ShieldCheck />}
              title={t("admin.home.activityLog")}
              description={t("admin.home.activityLogDescription")}
            />
          </AdminNavigationList>
        </AdminSection>

        <AdminSection
          icon={<Settings />}
          title={t("admin.home.platform")}
          description={t("admin.home.platformDescription")}
        >
          <AdminNavigationList label={t("admin.home.platform")}>
            <AdminNavigationItem
              href="/admin/configuracao"
              icon={<Settings />}
              title={t("admin.home.configuration")}
              description={t("admin.home.configurationDescription")}
            />
            <AdminNavigationItem
              href="/admin/modulos"
              icon={<Boxes />}
              title={t("admin.home.modules")}
              description={t("admin.home.modulesDescription")}
            />
          </AdminNavigationList>
        </AdminSection>
      </AdminSectionGrid>
    </AdminPage>
  </AppShell>;
}
