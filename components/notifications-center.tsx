"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, Bell, BellRing, BookOpen, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, Inbox, Megaphone, RefreshCw, Save, Settings2, Vote } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { useFloatingAction } from "@/components/floating-actions";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";
import list from "@/components/record-list.module.css";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/notifications-center.module.css";

const FLOATING_MARK_ALL_ICON = <CheckCheck aria-hidden="true" />;
const FLOATING_ARCHIVE_ICON = <Archive aria-hidden="true" />;
const FLOATING_RESTORE_ICON = <ArchiveRestore aria-hidden="true" />;

type Notification = { id: string; sourceType: string; sourceId: string; title: string; body: string; category: string; priority: string; unitId: string; unitName: string; createdAt: string | null; read: boolean; archived: boolean; href: string };
type Preferences = { categories: Record<string, boolean>; urgentOnly: boolean; unitIds: string[]; email: boolean };
type Unit = { id: string; name: string; code: string };
type Notice = { kind: ToastKind; message: string } | null;
const categories = ["announcements", "calendar", "materials", "polls", "requests"] as const;
const categoryTranslationKeys = { announcements: "notifications.categories.announcements", calendar: "notifications.categories.calendar", materials: "notifications.categories.materials", polls: "notifications.categories.polls", requests: "notifications.categories.requests" } as const;
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (typeof item[key] === "string" && item[key]) return String(item[key]); return ""; };
const bool = (item: Record<string, unknown>, ...keys: string[]) => { for (const key of keys) if (typeof item[key] === "boolean") return item[key] as boolean; return false; };
const cat = (value: string) => ({ announcement: "announcements", announcements: "announcements", event: "calendar", calendar_event: "calendar", material: "materials", poll: "polls", survey: "polls", request: "requests", ticket: "requests" }[value] || value || "announcements");
function normaliseNotification(raw: unknown, index: number): Notification { const item = obj(raw), sourceType = str(item, "sourceType", "type"), sourceId = str(item, "sourceId") || str(item, "id", "notificationId") || String(index), category = cat(str(item, "category") || sourceType); return { id: str(item, "id", "notificationId") || `${sourceType}:${sourceId}`, sourceType, sourceId, title: str(item, "title", "subject"), body: str(item, "body", "message", "description", "excerpt"), category, priority: str(item, "priority"), unitId: str(item, "unitId", "curricularUnitId"), unitName: str(item, "unitName", "curricularUnitName", "unitCode"), createdAt: str(item, "createdAt", "occurredAt", "publishedAt", "timestamp") || null, read: bool(item, "read", "isRead") || Boolean(item.readAt), archived: bool(item, "archived", "isArchived") || Boolean(item.archivedAt), href: str(item, "href", "url") || ({ announcements: "/avisos", calendar: "/calendario", materials: "/materiais", polls: "/inqueritos", requests: "/pedidos" }[category] || "/") }; }
function normalisePreferences(payload: unknown) { const root = obj(payload), source = obj(root.preferences || root), categorySource = obj(source.categories), enabled = Array.isArray(source.enabledCategories) ? source.enabledCategories.map(String) : null; const prefs: Preferences = { categories: Object.fromEntries(categories.map(key => [key, enabled ? enabled.includes(key) : typeof source[key] === "boolean" ? source[key] : categorySource[key] !== false])), urgentOnly: bool(source, "urgentOnly", "onlyUrgent"), unitIds: (Array.isArray(source.unitIds) ? source.unitIds : Array.isArray(source.curricularUnitIds) ? source.curricularUnitIds : []).map(String), email: bool(source, "email") }; const rawUnits = (Array.isArray(root.units) ? root.units : Array.isArray(root.curricularUnits) ? root.curricularUnits : []) as unknown[]; return { prefs, units: rawUnits.map(raw => { const item = obj(raw); return { id: str(item, "id"), name: str(item, "name"), code: str(item, "code", "acronym") }; }).filter(item => item.id) }; }

function CategoryIcon({ category }: { category: string }) {
  if (category === "calendar") return <CalendarDays />;
  if (category === "materials") return <BookOpen />;
  if (category === "polls") return <Vote />;
  if (category === "requests") return <Inbox />;
  return <Megaphone />;
}

export function NotificationsCenter() {
  const { locale, t } = useI18n(); const [items, setItems] = useState<Notification[]>([]), [preferences, setPreferences] = useState<Preferences>({ categories: Object.fromEntries(categories.map(key => [key, true])), urgentOnly: false, unitIds: [], email: false }), [units, setUnits] = useState<Unit[]>([]), [tab, setTab] = useState<"all" | "unread" | "archived">("all"), [category, setCategory] = useState("all"), [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(""), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [notice, setNotice] = useState<Notice>(null), [query, setQuery] = useState("");
  const [openId, openNotification] = useHashRecord("notificacao");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [feedResponse, prefResponse] = await Promise.all([fetch("/api/notifications?limit=100&includeArchived=true", { cache: "no-store" }), fetch("/api/notification-preferences", { cache: "no-store" })]), feedPayload = await feedResponse.json().catch(() => ({})) as unknown, prefPayload = await prefResponse.json().catch(() => ({})) as unknown; if (!feedResponse.ok) throw new Error(str(obj(feedPayload), "error", "message") || t("notifications.loadError")); const root = obj(feedPayload), raw = (Array.isArray(root.notifications) ? root.notifications : Array.isArray(root.items) ? root.items : Array.isArray(feedPayload) ? feedPayload : []) as unknown[]; setItems(raw.map(normaliseNotification)); if (prefResponse.ok) { const next = normalisePreferences(prefPayload); setPreferences(next.prefs); setUnits(next.units); } } catch (cause) { setError(cause instanceof Error ? cause.message : t("notifications.loadError")); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const unread = items.filter(item => !item.read && !item.archived).length;
  const priorityLabel = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("en");
    if (normalized === "urgent") return t("notifications.priority.urgent");
    if (normalized === "important") return t("notifications.priority.important");
    if (normalized === "normal") return t("notifications.priority.normal");
    return value;
  };
  const visible = useMemo(() => { const term = query.trim().toLocaleLowerCase(locale); return items.filter(item => (tab === "archived" ? item.archived : !item.archived) && (tab !== "unread" || !item.read) && (category === "all" || item.category === category) && (!term || [item.title, item.body, item.unitName].join(" ").toLocaleLowerCase(locale).includes(term))); }, [category, items, locale, query, tab]);
  const patch = async (updates: Array<Record<string, unknown>>, key: string, optimistic: (item: Notification) => Notification) => { setBusy(key); const previous = items; setItems(current => current.map(optimistic)); try { const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(updates.length === 1 ? updates[0] : { items: updates }) }); const payload = await response.json().catch(() => ({})) as unknown; if (!response.ok) throw new Error(str(obj(payload), "error", "message") || t("notifications.actionError")); window.dispatchEvent(new CustomEvent("notifications:changed")); } catch (cause) { setItems(previous); setNotice({ kind: "error", message: cause instanceof Error ? cause.message : t("notifications.actionError") }); } finally { setBusy(""); } };
  const markRead = (item: Notification) => patch([{ sourceType: item.sourceType, sourceId: item.sourceId, read: true }], item.id, current => current.id === item.id ? { ...current, read: true } : current);
  const markAll = () => { const targets = items.filter(item => !item.read && !item.archived); return targets.length ? patch(targets.map(item => ({ sourceType: item.sourceType, sourceId: item.sourceId, read: true })), "all", item => item.archived ? item : { ...item, read: true }) : Promise.resolve(); };
  const setArchived = (item: Notification, archived: boolean) => patch([{ sourceType: item.sourceType, sourceId: item.sourceId, archived }], item.id, current => current.id === item.id ? { ...current, archived } : current);
  const savePreferences = async () => { setSaving(true); setSaved(false); try { const response = await fetch("/api/notification-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ announcements: preferences.categories.announcements, calendar: preferences.categories.calendar, polls: preferences.categories.polls, requests: preferences.categories.requests, materials: preferences.categories.materials, email: preferences.email, urgentOnly: preferences.urgentOnly, unitIds: preferences.unitIds }) }); const payload = await response.json().catch(() => ({})) as unknown; if (!response.ok) throw new Error(str(obj(payload), "error", "message") || t("notifications.preferences.error")); setSaved(true); window.setTimeout(() => setSaved(false), 2500); } catch (cause) { setNotice({ kind: "error", message: cause instanceof Error ? cause.message : t("notifications.preferences.error") }); } finally { setSaving(false); } };
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
  const categoryLabel = (value: string) => value in categoryTranslationKeys ? t(categoryTranslationKeys[value as keyof typeof categoryTranslationKeys]) : value;
  const openItem = openId ? items.find(item => item.id === openId) ?? null : null;
  // Opening a notification marks it as read.
  const openAndMarkRead = (item: Notification) => { openNotification(item.id); if (!item.read) void markRead(item); };
  useFloatingAction(!openId && unread > 0 && !busy ? { id: "mark-all-read", label: t("notifications.markAll"), icon: FLOATING_MARK_ALL_ICON, onClick: () => void markAll() } : null);
  const archivable = openItem && !busy ? openItem : null;
  useFloatingAction(archivable ? { id: "archive-notification", label: t(archivable.archived ? "notifications.restore" : "notifications.archive"), icon: archivable.archived ? FLOATING_RESTORE_ICON : FLOATING_ARCHIVE_ICON, onClick: () => void setArchived(archivable, !archivable.archived) } : null);
  return <AppShell active="notifications" breadcrumb="Notificações"><div className={styles.center}>{notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <SurfaceHeader standalone headingLevel="h1" icon={<BellRing />} eyebrow={t("notifications.eyebrow")} title={t("notifications.title")} />
    <div className={styles.layout}>
      {!openId ? <section className={`panel ${list.listPanel}`} aria-busy={loading}>
        <FilterBar label={t("notifications.filterState")}>
          <FilterSearch label={t("notifications.search")} value={query} onChange={setQuery} placeholder={t("notifications.search")} />
          <FilterSegmented label={t("notifications.stateLabel")} value={tab} onChange={setTab} options={[{ value: "all", label: t("notifications.tabs.all") }, { value: "unread", label: t("notifications.tabs.unread"), count: unread }, { value: "archived", label: t("notifications.tabs.archived") }]} />
          <FilterSelect label={t("notifications.filterCategory")} value={category} onChange={setCategory} options={[{ value: "all", label: t("notifications.categories.all") }, ...categories.map(key => ({ value: key, label: t(categoryTranslationKeys[key]) }))]} />
        </FilterBar>
        {loading ? <RecordSkeleton label={t("notifications.loading")} /> : error ? <div className={list.empty} role="alert"><Bell /><strong>{t("notifications.loadError")}</strong><button className={styles.retry} onClick={() => void load()} type="button"><RefreshCw size={13} /> {t("notifications.retry")}</button></div> : visible.length ? <ul className={list.rows}>{visible.map(item => <li className={list.row} key={item.id} data-tone={item.read ? undefined : "accent"}>
          <span className={list.statusDot} aria-hidden="true" />
          <div className={list.rowMain}>
            <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("notificacao", item.id)} onClick={event => { event.preventDefault(); openAndMarkRead(item); }}>{item.title || t("notifications.untitled")}{!item.read && <span className="sr-only"> ({t("notifications.unread")})</span>}</a></h3>
            <p className={list.rowMeta}>{[categoryLabel(item.category), item.unitName, formatDate(item.createdAt)].filter(Boolean).join(" · ")}</p>
          </div>
          {item.priority && item.priority !== "normal" ? <span className={list.statusPill} data-tone={item.priority === "urgent" ? "danger" : "accent"}>{priorityLabel(item.priority)}</span> : <span />}
        </li>)}</ul> : <div className={list.empty}><Bell /><strong>{tab === "unread" ? t("notifications.emptyUnread") : tab === "archived" ? t("notifications.emptyArchived") : t("notifications.empty")}</strong></div>}
      </section> : <div className={styles.detail}>
        <button className={list.back} type="button" onClick={() => openNotification(null)}><ChevronLeft aria-hidden="true" />{t("notifications.back")}</button>
        <article className={`panel ${list.reading}`} aria-busy={loading}>
          {loading ? <RecordSkeleton label={t("notifications.loading")} rows={2} /> : !openItem ? <div className={list.empty}><Bell /><strong>{t("notifications.empty")}</strong></div> : <>
            <header className={list.byline}>
              <span className={list.iconChip} aria-hidden="true"><CategoryIcon category={openItem.category} /></span>
              <div>
                <p className={list.bylineName}>{categoryLabel(openItem.category)}</p>
                <p className={list.bylineMeta}>{[openItem.unitName, formatDate(openItem.createdAt)].filter(Boolean).join(" · ")}</p>
              </div>
              {openItem.priority && openItem.priority !== "normal" && <span className={list.statusPill} data-tone={openItem.priority === "urgent" ? "danger" : "accent"}>{priorityLabel(openItem.priority)}</span>}
              {openItem.archived && <span className={list.statusPill}>{t("notifications.tabs.archived")}</span>}
            </header>
            <h2 className={list.readingTitle}>{openItem.title || t("notifications.untitled")}</h2>
            <span className={list.readingRule} aria-hidden="true" />
            {openItem.body && <p className={list.readingBody}>{openItem.body}</p>}
            <footer className={list.manageArea}>
              <Link className={`button button--secondary button--compact ${styles.openSource}`} href={openItem.href}>{t("notifications.open")}<ChevronRight aria-hidden="true" /></Link>
            </footer>
          </>}
        </article>
      </div>}
      <aside className={`${styles.panel} ${styles.preferences}`}><SurfaceHeader icon={<Settings2 />} title={t("notifications.preferences.title")} /><form onSubmit={event => { event.preventDefault(); void savePreferences(); }}><div className={styles.group}><strong>{t("notifications.preferences.categories")}</strong>{categories.map(key => <label className={styles.check} key={key}><input type="checkbox" checked={preferences.categories[key] !== false} onChange={event => setPreferences(current => ({ ...current, categories: { ...current.categories, [key]: event.target.checked } }))} /><span>{t(categoryTranslationKeys[key])}</span></label>)}</div><div className={styles.group}><strong>{t("notifications.preferences.priority")}</strong><label className={styles.check}><input type="checkbox" checked={preferences.urgentOnly} onChange={event => setPreferences(current => ({ ...current, urgentOnly: event.target.checked }))} /><span>{t("notifications.preferences.urgentOnly")}</span></label></div>{units.length > 0 && <div className={styles.group}><strong>{t("notifications.preferences.units")}</strong><select className={styles.unitSelect} multiple value={preferences.unitIds} onChange={event => setPreferences(current => ({ ...current, unitIds: Array.from(event.target.selectedOptions, option => option.value) }))}>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.code ? `${unit.code} · ` : ""}{unit.name}</option>)}</select></div>}<button className={styles.save} type="submit" disabled={saving}><Save />{saving ? t("notifications.preferences.saving") : t("notifications.preferences.save")}</button>{saved && <span className={styles.saved}><Check />{t("notifications.preferences.saved")}</span>}</form></aside>
    </div>
  </div></AppShell>;
}
