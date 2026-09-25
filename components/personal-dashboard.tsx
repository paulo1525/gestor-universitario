"use client";

import Link from "next/link";
import { AlertCircle, BookOpenCheck, BrainCircuit, CalendarDays, ChevronRight, ClipboardCheck, GraduationCap, Highlighter, Inbox, LayoutDashboard, Megaphone, RefreshCw, Star, Vote } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AppShell } from "@/components/app-shell";
import { SurfaceHeader } from "@/components/surface-header";
import { useAuth } from "@/components/auth-context";
import { useModules } from "@/components/module-context";
import { useI18n } from "@/components/i18n-context";
import { materialReaderHref } from "@/lib/material-reader";
import { UnitThumb } from "@/components/unit-thumb";
import { RecordSkeleton } from "@/components/record-list";
import styles from "@/components/personal-dashboard.module.css";

type Entry = { id: string; title: string; description: string; date: string | null; href: string; label: string; status: string; read: boolean };
type Reading = { id: string; title: string; unitCode: string; unitName: string; highlightCount: number };
type DashboardData = { events: Entry[]; announcements: Entry[]; polls: Entry[]; requests: Entry[]; materials: Entry[]; completedQuizAttempts: number; reading: Reading[]; highlightTotal: number };
type LearningModule = { id: string; title: string; unitCode: string; stepCount: number; exerciseCount: number; progress: { status: string; currentStepPosition: number } | null };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (root: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[]; return []; };
const text = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (typeof item[key] === "string" && item[key]) return String(item[key]); return ""; };
const number = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) { const value = Number(item[key]); if (item[key] !== null && item[key] !== undefined && Number.isFinite(value)) return value; } return null; };
const boolean = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (typeof item[key] === "boolean") return item[key] as boolean; return false; };

// Dates arrive as ISO strings or as epoch milliseconds.
function dateValue(item: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
    if (typeof value === "string" && value) return /^\d{10,}$/.test(value) ? new Date(Number(value)).toISOString() : value;
  }
  return null;
}
function entries(items: unknown[], kind: "event" | "announcement" | "poll" | "request" | "material"): Entry[] {
  return items.map((raw, index) => { const item = object(raw), id = text(item, "id", "notificationId") || String(index); const fallback = kind === "event" ? "/calendario" : kind === "announcement" ? "/avisos" : kind === "poll" ? "/inqueritos" : kind === "request" ? "/pedidos" : "/materiais"; return {
    id, title: text(item, "title", "subject", "name", "label"), description: text(item, "description", "excerpt", "content", "summary", "unitName", "curricularUnitName"), date: dateValue(item, "startsAt", "startAt", "publishedAt", "createdAt", "updatedAt", "endsAt", "deadline"),
    href: text(item, "href", "url") || (kind === "material" && id ? `/materiais?material=${encodeURIComponent(id)}` : fallback), label: text(item, "unitCode", "unitName", "type", "priority", "category"), status: text(item, "status", "state"), read: boolean(item, "read", "isRead") || Boolean(item.readAt),
  }; });
}
function normalise(payload: unknown): DashboardData { const root = object(payload), dashboard = object(root.dashboard), source = Object.keys(dashboard).length ? dashboard : root, summary = object(source.summary); return {
  events: entries(array(source, "upcomingEvents", "events", "calendarEvents"), "event"), announcements: entries(array(source, "urgentAnnouncements", "recentAnnouncements", "announcements", "notices"), "announcement"), polls: entries(array(source, "activePolls", "polls", "surveys"), "poll"), requests: entries(array(source, "recentRequests", "requests", "tickets"), "request"), materials: entries(array(source, "favoriteMaterials", "favouriteMaterials", "favorites", "materials"), "material"), completedQuizAttempts: number(summary, "completedQuizAttempts", "completedTests") ?? number(source, "completedQuizAttempts", "completedTests") ?? 0,
  reading: array(source, "recentReading").map((raw) => { const item = object(raw); return { id: text(item, "id"), title: text(item, "title"), unitCode: text(item, "unitCode"), unitName: text(item, "unitName"), highlightCount: number(item, "highlightCount") ?? 0 }; }).filter((item) => item.id),
  highlightTotal: number(source, "highlightTotal") ?? 0,
}; }
function parsedDate(value: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function formatDate(value: string | null, locale: string, withTime = false) { const date = parsedDate(value); if (!date) return null; return new Intl.DateTimeFormat(locale, withTime ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" }).format(date); }
function formatDateParts(value: string | null, locale: string) { const date = parsedDate(value); if (!date) return { day: "—", month: "" }; const parts = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).formatToParts(date); return { day: parts.find(part => part.type === "day")?.value || "—", month: parts.find(part => part.type === "month")?.value || "" }; }

export function PersonalDashboard() {
  const { user } = useAuth(), { locale, t } = useI18n(); const [data, setData] = useState<DashboardData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/dashboard/personal", { cache: "no-store" }), payload = await response.json().catch(() => ({})) as unknown; if (!response.ok) throw new Error(text(object(payload), "error", "message") || t("personalDashboard.loadError")); setData(normalise(payload)); } catch (cause) { setError(cause instanceof Error ? cause.message : t("personalDashboard.loadError")); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || "";
  // Cards and panels follow the modules: a disabled module disappears from the dashboard.
  const { access, loading: modulesLoading } = useModules();
  const on = (key: string) => access[key] === true;
  const summaries = [
    { module: "calendar.events", href: "/calendario", icon: CalendarDays, label: t("personalDashboard.summary.events"), value: data?.events.length || 0, help: t("personalDashboard.summary.eventsHelp"), tone: "gold" }, { module: "polls.voting", href: "/inqueritos", icon: ClipboardCheck, label: t("personalDashboard.summary.polls"), value: data?.polls.length || 0, help: t("personalDashboard.summary.pollsHelp"), tone: "gold" }, { module: "materials.library", href: "/materiais", icon: Highlighter, label: t("personalDashboard.summary.materials"), value: data?.highlightTotal || 0, help: t("personalDashboard.summary.materialsHelp"), tone: "gold" }, { module: "quizzes.practice", href: "/testes", icon: BrainCircuit, label: t("personalDashboard.summary.quizzes"), value: data?.completedQuizAttempts || 0, help: t("personalDashboard.summary.quizzesHelp"), tone: "gold" },
  ].filter((summary) => on(summary.module));
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
      <SurfaceHeader className={styles.panelHeader} title={title} headingId={titleId} actions={<Link className={styles.viewAll} href={href}>{t("personalDashboard.viewAll")}<ChevronRight aria-hidden="true" /></Link>} />
      {items.length ? <div className={styles.list}>{items.slice(0, kind === "event" ? 5 : 4).map(item => {
        const date = formatDate(item.date, locale, kind !== "material");
        const { day, month } = formatDateParts(item.date, locale);
        return <Link href={item.href} key={`${kind}-${item.id}`} className={`${styles.item} ${kind === "event" ? "" : styles.plainItem} ${kind === "announcement" && !item.read ? styles.unread : ""}`}>
          {kind === "event" && <time className={styles.dateBox} dateTime={item.date || undefined}><strong>{day}</strong><small>{month}</small></time>}
          <span className={styles.itemCopy}><strong>{item.title || t("personalDashboard.untitled")}</strong>{item.description && <p>{item.description}</p>}{kind === "event" ? item.label && <small>{priorityLabel(item.label)}</small> : date && <small>{date}</small>}</span>
          <span className={styles.itemMeta}>{item.label && <span className={styles.badge} data-tone={kind === "request" ? "blue" : kind === "poll" ? "green" : undefined}>{priorityLabel(item.label)}</span>}<ChevronRight aria-hidden="true" /></span>
        </Link>;
      })}</div> : <div className={styles.empty} role="status">
        <span className={styles.stateIcon} aria-hidden="true"><Icon /></span>
        <strong>{t(`personalDashboard.empty.${kind}`)}</strong>
      </div>}
    </section>;
  };
  return <AppShell active="overview" breadcrumb="Dashboard"><div className={styles.dashboard}>
    <header className={styles.heading}><div className={styles.headingCopy}><span className={styles.headingIcon}><LayoutDashboard /></span><div><span className="eyebrow">{t("personalDashboard.eyebrow")}</span><h1>{firstName ? t("personalDashboard.greeting", { name: firstName }) : t("personalDashboard.title")}</h1></div></div></header>
    {loading || modulesLoading ? <div className={styles.panel}><RecordSkeleton label={t("personalDashboard.loading")} rows={4} /></div> : error ? <div className={`${styles.panel} ${styles.error}`} role="alert"><AlertCircle /><strong>{t("personalDashboard.loadError")}</strong><span>{error}</span><button className={styles.retry} type="button" onClick={() => void load()}><RefreshCw size={13} /> {t("personalDashboard.retry")}</button></div> : data && <>{summaries.length > 0 && <section className={styles.summaryGrid} style={{ "--summary-columns": summaries.length } as CSSProperties} aria-label={t("personalDashboard.eyebrow")}>{summaries.map(({ href, icon: Icon, label, value, help, tone }) => <Link href={href} className={styles.summaryCard} key={href} aria-label={`${label}: ${value}`}><span className={styles.summaryIcon} data-tone={tone} aria-hidden="true"><Icon /></span><span className={styles.summaryCopy}><span>{label}</span><strong>{value}</strong><small>{help}</small></span><ChevronRight className={styles.summaryArrow} aria-hidden="true" /></Link>)}</section>}<div className={styles.contentGrid}>
{(on("materials.library") || on("quizzes.learning")) && <StudyPanel reading={on("materials.library") ? data.reading : []} materials={on("materials.library")} learning={on("quizzes.learning")} />}{on("calendar.events") && listPanel(t("personalDashboard.events.title"), t("personalDashboard.events.subtitle"), "/calendario", CalendarDays, data.events, "event")}
{on("announcements.feed") && listPanel(t("personalDashboard.announcements.title"), t("personalDashboard.announcements.subtitle"), "/avisos", Megaphone, data.announcements, "announcement")}{on("polls.voting") && listPanel(t("personalDashboard.polls.title"), t("personalDashboard.polls.subtitle"), "/inqueritos", Vote, data.polls, "poll")}
{on("requests.submission") && listPanel(t("personalDashboard.requests.title"), t("personalDashboard.requests.subtitle"), "/pedidos", Inbox, data.requests, "request")}{on("materials.library") && listPanel(t("personalDashboard.materials.title"), t("personalDashboard.materials.subtitle"), "/materiais", Star, data.materials, "material")}
</div></>}
  </div></AppShell>;
}

function storedPage(id: string) {
  try { return Number(window.localStorage.getItem(`gu-pdf-page:${id}`)) || 0; } catch { return 0; }
}

/** What the student was studying: PDFs with highlights and interactive paths in progress. */
function StudyPanel({ reading, materials, learning }: { reading: Reading[]; materials: boolean; learning: boolean }) {
  const { t } = useI18n();
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!learning) return;
    const controller = new AbortController();
    fetch("/api/learning-modules", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? (await response.json() as { modules?: LearningModule[] }).modules ?? [] : [])
      .then((items) => setModules(items.filter((item) => item.progress?.status === "active").slice(0, 2)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [learning]);
  useEffect(() => { void Promise.resolve().then(() => setPages(Object.fromEntries(reading.map((item) => [item.id, storedPage(item.id)])))); }, [reading]);
  const hasContent = reading.length > 0 || modules.length > 0;
  return <section className={styles.panel} data-kind="study" aria-labelledby="dashboard-study-title">
    <SurfaceHeader className={styles.panelHeader} title={t("personalDashboard.study.title")} headingId="dashboard-study-title" actions={materials ? <Link className={styles.viewAll} href="/materiais">{t("personalDashboard.study.materials")}<ChevronRight aria-hidden="true" /></Link> : undefined} />
    {hasContent ? <div className={styles.list}>
      {reading.map((item) => <div className={styles.studyItem} key={item.id}>
        <UnitThumb code={item.unitCode} name={item.unitName} />
        <span className={styles.itemCopy}><strong>{item.title}</strong><small>{[item.unitCode, item.highlightCount === 1 ? t("personalDashboard.study.highlightsOne") : t("personalDashboard.study.highlights", { count: item.highlightCount }), pages[item.id] > 1 ? t("personalDashboard.study.page", { page: pages[item.id] }) : ""].filter(Boolean).join(" · ")}</small></span>
        <a className="button button--secondary button--compact" href={materialReaderHref(item.id)} target="_blank" rel="noopener">{t("personalDashboard.study.continue")}</a>
      </div>)}
      {modules.map((module) => {
        const done = Math.max(0, (module.progress?.currentStepPosition ?? 1) - 1), percent = module.stepCount ? Math.round((done / module.stepCount) * 100) : 0;
        return <div className={styles.studyItem} key={module.id}>
          <span className={styles.itemIcon} aria-hidden="true"><GraduationCap /></span>
          <span className={styles.itemCopy}><strong>{module.title}</strong><small>{[t("personalDashboard.study.path"), module.unitCode, t("personalDashboard.study.cycles", { done: Math.floor(done / 2), total: module.exerciseCount })].filter(Boolean).join(" · ")}</small><span className={styles.progress} aria-label={`${percent}%`}><span style={{ width: `${percent}%` }} /></span></span>
          <Link className="button button--secondary button--compact" href="/testes/aprender/">{t("personalDashboard.study.resume")}</Link>
        </div>;
      })}
    </div> : <div className={styles.empty} role="status"><span className={styles.stateIcon} aria-hidden="true"><BookOpenCheck /></span><strong>{t("personalDashboard.study.empty")}</strong></div>}
  </section>;
}
