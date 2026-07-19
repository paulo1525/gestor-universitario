"use client";

import Link from "next/link";
import { AlertCircle, Bell, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, FileHeart, Inbox, LayoutDashboard, LoaderCircle, Megaphone, RefreshCw, Star, Users, Vote } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/personal-dashboard.module.css";

type Entry = { id: string; title: string; description: string; date: string | null; href: string; label: string; status: string; read: boolean };
type DashboardData = { events: Entry[]; announcements: Entry[]; polls: Entry[]; requests: Entry[]; materials: Entry[]; unread: number; classId: number | null; classLabel: string; preferenceLabel: string };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (root: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[]; return []; };
const text = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (typeof item[key] === "string" && item[key]) return String(item[key]); return ""; };
const number = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) { const value = Number(item[key]); if (item[key] !== null && item[key] !== undefined && Number.isFinite(value)) return value; } return null; };
const boolean = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (typeof item[key] === "boolean") return item[key] as boolean; return false; };

function entries(items: unknown[], kind: "event" | "announcement" | "poll" | "request" | "material"): Entry[] {
  return items.map((raw, index) => { const item = object(raw), id = text(item, "id", "notificationId") || String(index); const fallback = kind === "event" ? "/calendario" : kind === "announcement" ? "/avisos" : kind === "poll" ? "/inqueritos" : kind === "request" ? "/pedidos" : "/materiais"; return {
    id, title: text(item, "title", "subject", "name", "label"), description: text(item, "description", "excerpt", "content", "summary", "unitName", "curricularUnitName"), date: text(item, "startsAt", "startAt", "publishedAt", "createdAt", "updatedAt", "endsAt", "deadline") || null,
    href: text(item, "href", "url") || (kind === "material" && id ? `/materiais?material=${encodeURIComponent(id)}` : fallback), label: text(item, "unitCode", "unitName", "type", "priority", "category"), status: text(item, "status", "state"), read: boolean(item, "read", "isRead") || Boolean(item.readAt),
  }; });
}
function normalise(payload: unknown): DashboardData { const root = object(payload), dashboard = object(root.dashboard), source = Object.keys(dashboard).length ? dashboard : root, summary = object(source.summary), classInfo = object(source.classInfo || source.classSummary || source.class || source.turma), preferences = object(source.preferences || source.classPreferences), classId = number(classInfo, "id", "classId", "number") ?? number(source, "classId", "representedClass"); return {
  events: entries(array(source, "upcomingEvents", "events", "calendarEvents"), "event"), announcements: entries(array(source, "urgentAnnouncements", "recentAnnouncements", "announcements", "notices"), "announcement"), polls: entries(array(source, "activePolls", "polls", "surveys"), "poll"), requests: entries(array(source, "recentRequests", "requests", "tickets"), "request"), materials: entries(array(source, "favoriteMaterials", "favouriteMaterials", "favorites", "materials"), "material"), unread: number(summary, "unreadNotifications", "unreadCount") ?? number(source, "unreadNotifications", "unreadCount", "notificationsUnread") ?? 0, classId, classLabel: text(classInfo, "name", "label", "status"), preferenceLabel: text(preferences, "summary", "label", "status"),
}; }
function parsedDate(value: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function formatDate(value: string | null, locale: string, withTime = false) { const date = parsedDate(value); if (!date) return null; return new Intl.DateTimeFormat(locale, withTime ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" }).format(date); }
function formatDateParts(value: string | null, locale: string) { const date = parsedDate(value); if (!date) return { day: "—", month: "" }; const parts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).formatToParts(date); return { day: parts.find(part => part.type === "day")?.value || "—", month: parts.find(part => part.type === "month")?.value || "" }; }

export function PersonalDashboard() {
  const { user } = useAuth(), { locale, t } = useI18n(); const [data, setData] = useState<DashboardData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/dashboard/personal", { cache: "no-store" }), payload = await response.json().catch(() => ({})) as unknown; if (!response.ok) throw new Error(text(object(payload), "error", "message") || t("personalDashboard.loadError")); setData(normalise(payload)); } catch (cause) { setError(cause instanceof Error ? cause.message : t("personalDashboard.loadError")); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || "", actionCount = (data?.polls.length || 0) + (data?.requests.filter(item => !["closed", "resolved", "concluido", "concluído"].includes(item.status.toLocaleLowerCase())).length || 0);
  const summaries = [
    { href: "/calendario", icon: CalendarDays, label: t("personalDashboard.summary.events"), value: data?.events.length || 0, help: t("personalDashboard.summary.eventsHelp"), tone: "blue" }, { href: "/notificacoes", icon: Bell, label: t("personalDashboard.summary.unread"), value: data?.unread || 0, help: t("personalDashboard.summary.unreadHelp"), tone: "gold" }, { href: "/inqueritos", icon: ClipboardCheck, label: t("personalDashboard.summary.actions"), value: actionCount, help: t("personalDashboard.summary.actionsHelp"), tone: "green" }, { href: "/materiais", icon: FileHeart, label: t("personalDashboard.summary.favorites"), value: data?.materials.length || 0, help: t("personalDashboard.summary.favoritesHelp"), tone: "violet" },
  ];
  const priorityLabel = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("en");
    if (normalized === "urgent") return t("notifications.priority.urgent");
    if (normalized === "important") return t("notifications.priority.important");
    if (normalized === "normal") return t("notifications.priority.normal");
    return value;
  };
  const listPanel = (title: string, subtitle: string, href: string, Icon: typeof CalendarDays, items: Entry[], kind: "event" | "announcement" | "poll" | "request" | "material") => {
    const titleId = `dashboard-${kind}-title`;
    return <section className={styles.panel} data-kind={kind} aria-labelledby={titleId}>
      <header className={styles.panelBar}>
        <div className={styles.panelTitle}>
          <span className={styles.panelIcon} aria-hidden="true"><Icon /></span>
          <div><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div>
        </div>
        <Link className={styles.viewAll} href={href}>{t("personalDashboard.viewAll")}<ChevronRight aria-hidden="true" /></Link>
      </header>
      {items.length ? <div className={styles.list}>{items.slice(0, kind === "event" ? 5 : 4).map(item => {
        const date = formatDate(item.date, locale, kind !== "material");
        const { day, month } = formatDateParts(item.date, locale);
        const ItemIcon = kind === "announcement" ? Megaphone : kind === "poll" ? Vote : kind === "request" ? Inbox : BookOpen;
        return <Link href={item.href} key={`${kind}-${item.id}`} className={`${styles.item} ${kind === "material" ? styles.materialItem : ""} ${kind === "announcement" && !item.read ? styles.unread : ""}`}>
          {kind === "event" ? <time className={styles.dateBox} dateTime={item.date || undefined}><strong>{day}</strong><small>{month}</small></time> : <span className={styles.itemIcon} aria-hidden="true"><ItemIcon /></span>}
          <span className={styles.itemCopy}><strong>{item.title || t("personalDashboard.untitled")}</strong>{item.description && <p>{item.description}</p>}{kind === "event" ? item.label && <small>{priorityLabel(item.label)}</small> : date && <small>{date}</small>}</span>
          <span className={styles.itemMeta}>{item.label && <span className={styles.badge} data-tone={kind === "request" ? "blue" : kind === "poll" ? "green" : undefined}>{priorityLabel(item.label)}</span>}{kind === "material" ? <Star className={styles.favorite} aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</span>
        </Link>;
      })}</div> : <div className={styles.empty} role="status">
        <span className={styles.stateIcon} aria-hidden="true"><Icon /></span>
        <strong>{t(`personalDashboard.empty.${kind}`)}</strong>
      </div>}
    </section>;
  };
  return <AppShell active="overview" breadcrumb="Dashboard"><div className={styles.dashboard}>
    <header className={styles.heading}><div className={styles.headingCopy}><span className={styles.headingIcon}><LayoutDashboard /></span><div><span className="eyebrow">{t("personalDashboard.eyebrow")}</span><h1>{firstName ? t("personalDashboard.greeting", { name: firstName }) : t("personalDashboard.title")}</h1><p>{t("personalDashboard.description")}</p></div></div><div className={styles.headingActions}><Link className="button button--secondary" href="/notificacoes"><Bell />{t("personalDashboard.notifications")}</Link><Link className="button button--primary" href="/calendario"><CalendarDays />{t("personalDashboard.calendar")}</Link></div></header>
    {loading ? <div className={`${styles.panel} ${styles.loading}`} aria-live="polite"><LoaderCircle className={styles.spinner} /><strong>{t("personalDashboard.loading")}</strong></div> : error ? <div className={`${styles.panel} ${styles.error}`} role="alert"><AlertCircle /><strong>{t("personalDashboard.loadError")}</strong><span>{error}</span><button className={styles.retry} type="button" onClick={() => void load()}><RefreshCw size={13} /> {t("personalDashboard.retry")}</button></div> : data && <><section className={styles.summaryGrid} aria-label={t("personalDashboard.eyebrow")}>{summaries.map(({ href, icon: Icon, label, value, help, tone }) => <Link href={href} className={styles.summaryCard} key={href} aria-label={`${label}: ${value}`}><span className={styles.summaryIcon} data-tone={tone} aria-hidden="true"><Icon /></span><span className={styles.summaryCopy}><span>{label}</span><strong>{value}</strong><small>{help}</small></span><ChevronRight className={styles.summaryArrow} aria-hidden="true" /></Link>)}</section><div className={styles.contentGrid}><div className={styles.column}>{listPanel(t("personalDashboard.events.title"), t("personalDashboard.events.subtitle"), "/calendario", CalendarDays, data.events, "event")}{listPanel(t("personalDashboard.announcements.title"), t("personalDashboard.announcements.subtitle"), "/avisos", Megaphone, data.announcements, "announcement")}{listPanel(t("personalDashboard.polls.title"), t("personalDashboard.polls.subtitle"), "/inqueritos", Vote, data.polls, "poll")}</div><aside className={styles.column}><section className={styles.panel} aria-labelledby="dashboard-class-title"><header className={styles.panelBar}><div className={styles.panelTitle}><span className={styles.panelIcon} aria-hidden="true"><Users /></span><div><h2 id="dashboard-class-title">{t("personalDashboard.class.title")}</h2><p>{t("personalDashboard.class.subtitle")}</p></div></div></header><div className={styles.cohortBody}><div className={styles.classMain}><span className={styles.classNumber}>{data.classId ?? "—"}</span><span className={styles.classCopy}><strong>{data.classId ? t("personalDashboard.class.number", { number: data.classId }) : t("personalDashboard.class.unassigned")}</strong><span>{data.classLabel || data.preferenceLabel || t("personalDashboard.class.help")}</span></span></div><div className={styles.classActions}><Link href={data.classId ? `/turmas/${data.classId}` : "/turmas"}><Users aria-hidden="true" />{t("personalDashboard.class.open")}</Link><Link href="/turmas"><ClipboardCheck aria-hidden="true" />{t("personalDashboard.class.preferences")}</Link></div></div></section>{listPanel(t("personalDashboard.requests.title"), t("personalDashboard.requests.subtitle"), "/pedidos", Inbox, data.requests, "request")}{listPanel(t("personalDashboard.materials.title"), t("personalDashboard.materials.subtitle"), "/materiais", Star, data.materials, "material")}</aside></div></>}
  </div></AppShell>;
}
