"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BarChart3, BookOpen, ClipboardList, FileText, LoaderCircle, Megaphone, TrendingUp, Users, Vote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import styles from "@/components/community-suite.module.css";
import { adminDataLabel } from "@/lib/i18n-admin";

type Dashboard = {
  metrics: { activeAnnouncements: number; openRequests: number; pendingMaterials: number; activePolls: number };
  engagement: Array<{ label: string; value: number; total?: number }>;
  recent: Array<{ id: string; title: string; description?: string; type: string; href?: string; createdAt?: string }>;
  units: Array<{ id: string; name: string; code?: string; issues: number; events: number }>;
};

type DashboardFallbacks = { module: string; activity: string; unit: string };

function normalize(raw: Record<string, unknown>, fallbacks: DashboardFallbacks): Dashboard {
  const metrics = (raw.metrics ?? {}) as Record<string, unknown>;
  const engagement = (raw.engagement ?? raw.moduleEngagement ?? []) as Array<Record<string, unknown>>;
  const recent = (raw.recent ?? raw.recentActivity ?? []) as Array<Record<string, unknown>>;
  const units = (raw.units ?? raw.unitOverview ?? []) as Array<Record<string, unknown>>;
  return {
    metrics: {
      activeAnnouncements: Number(metrics.activeAnnouncements ?? metrics.active_announcements ?? 0),
      openRequests: Number(metrics.openRequests ?? metrics.open_requests ?? 0),
      pendingMaterials: Number(metrics.pendingMaterials ?? metrics.pending_materials ?? 0),
      activePolls: Number(metrics.activePolls ?? metrics.active_polls ?? 0),
    },
    engagement: engagement.map((item) => ({
      label: String(item.label ?? item.name ?? fallbacks.module),
      value: Number(item.value ?? item.count ?? 0),
      total: item.total == null ? undefined : Number(item.total),
    })),
    recent: recent.map((item) => ({
      id: String(item.id),
      title: String(item.title ?? fallbacks.activity),
      description: item.description ? String(item.description) : undefined,
      type: String(item.type ?? "activity"),
      href: item.href ? String(item.href) : undefined,
      createdAt: item.createdAt ? String(item.createdAt) : undefined,
    })),
    units: units.map((item) => ({
      id: String(item.id),
      name: String(item.name ?? fallbacks.unit),
      code: item.code ? String(item.code) : undefined,
      issues: Number(item.issues ?? item.openRequests ?? 0),
      events: Number(item.events ?? item.upcomingEvents ?? 0),
    })),
  };
}

function icon(type: string) {
  if (type.includes("poll")) return <Vote />;
  if (type.includes("material") || type.includes("document")) return <FileText />;
  if (type.includes("announcement")) return <Megaphone />;
  return <ClipboardList />;
}

export function CommunityAdminDashboard() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const raw = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(raw.error || t("admin.dashboard.loadError"));
      setData(normalize(raw, {
        module: t("admin.dashboard.fallbackModule"),
        activity: t("admin.dashboard.fallbackActivity"),
        unit: t("admin.dashboard.fallbackUnit"),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("admin.dashboard.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  return <AuthGuard requireAdmin><ModuleGuard moduleKey="dashboard.analytics"><AppShell active="dashboard" breadcrumb={t("admin.dashboard.breadcrumb")}>
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}><span className={styles.heroIcon}><BarChart3 /></span><div><span className="eyebrow">{t("admin.dashboard.eyebrow")}</span><h1>{t("admin.dashboard.title")}</h1><p>{t("admin.dashboard.description")}</p></div></div>
        <div className={styles.heroActions}><button className="button button--secondary" type="button" onClick={() => void load()} disabled={loading}><TrendingUp />{t("admin.dashboard.refresh")}</button></div>
      </header>
      {error && <AppToast kind="error" message={error} duration={0} onDismiss={() => setError("")} />}
      {loading ? <section className={styles.panel}><div className={styles.state}><LoaderCircle className={styles.spin} /><strong>{t("admin.dashboard.calculating")}</strong></div></section> : data && <>
        <section className={styles.statsGrid} aria-label={t("admin.dashboard.mainIndicators")}>
          <Stat icon={<Megaphone />} value={data.metrics.activeAnnouncements} label={t("admin.dashboard.activeAnnouncements")} locale={locale} />
          <Stat icon={<ClipboardList />} value={data.metrics.openRequests} label={t("admin.dashboard.openRequests")} locale={locale} />
          <Stat icon={<FileText />} value={data.metrics.pendingMaterials} label={t("admin.dashboard.pendingMaterials")} locale={locale} />
          <Stat icon={<Vote />} value={data.metrics.activePolls} label={t("admin.dashboard.activePolls")} locale={locale} />
        </section>
        <div className={styles.dashboardGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>{t("admin.dashboard.byModule")}</h2><p>{t("admin.dashboard.byModuleDescription")}</p></div></div>
            {data.engagement.length ? <div className={styles.progressList}>{data.engagement.map((item) => {
              const percent = item.total ? Math.min(100, Math.round(item.value / item.total * 100)) : Math.min(100, item.value);
              const label = adminDataLabel(locale, "engagement", item.label) || item.label;
              return <div className={styles.progressLine} key={item.label}><div><strong>{label}</strong><span>{item.value.toLocaleString(locale === "en" ? "en-GB" : "pt-PT")}</span></div><div className={styles.progressTrack}><span style={{ width: `${percent}%` }} /></div></div>;
            })}</div> : <div className={styles.state}><TrendingUp /><strong>{t("admin.dashboard.noEngagement")}</strong></div>}
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>{t("admin.dashboard.recent")}</h2><p>{t("admin.dashboard.recentDescription")}</p></div></div>
            {data.recent.length ? <div className={styles.sectionBody}>{data.recent.map((item) => {
              const content = <><span className={styles.listIcon}>{icon(item.type)}</span><span><strong>{item.title}</strong><small>{item.description ?? item.createdAt ?? ""}</small></span>{item.href && <ArrowRight />}</>;
              return item.href ? <Link className={styles.listItem} href={item.href} key={item.id}>{content}</Link> : <div className={styles.listItem} key={item.id}>{content}</div>;
            })}</div> : <div className={styles.state}><ClipboardList /><strong>{t("admin.dashboard.noRecent")}</strong></div>}
          </section>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>{t("admin.dashboard.byUnit")}</h2><p>{t("admin.dashboard.byUnitDescription")}</p></div><Link className="button button--secondary button--compact" href="/unidades-curriculares"><BookOpen />{t("admin.dashboard.viewCatalog")}</Link></div>
          {data.units.length ? <div className={styles.grid}>{data.units.map((item) => <Link className={styles.card} href={`/unidades-curriculares/${encodeURIComponent(item.id)}`} key={item.id}><span className={styles.unitCode}>{item.code ?? "UC"}</span><h3>{item.name}</h3><div className={styles.metrics}><div className={styles.metric}><span>{t("admin.dashboard.requests")}</span><strong>{item.issues}</strong></div><div className={styles.metric}><span>{t("admin.dashboard.upcomingEvents")}</span><strong>{item.events}</strong></div></div><span className={styles.linkHint}>{t("admin.dashboard.openUnit")} <ArrowRight /></span></Link>)}</div> : <div className={styles.state}><Users /><strong>{t("admin.dashboard.noUnits")}</strong></div>}
        </section>
      </>}
    </div>
  </AppShell></ModuleGuard></AuthGuard>;
}

function Stat({ icon, value, label, locale }: { icon: React.ReactNode; value: number; label: string; locale: "pt-PT" | "en" }) {
  return <article className={styles.statCard}><span className={styles.statIcon}>{icon}</span><span><strong>{value.toLocaleString(locale === "en" ? "en-GB" : "pt-PT")}</strong><small>{label}</small></span></article>;
}
