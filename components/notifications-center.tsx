"use client";

import Link from "next/link";
import { SearchableMultiSelect } from "@/components/searchable-select";
import { Archive, ArchiveRestore, Bell, BellRing, BookOpen, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Inbox, Megaphone, RefreshCw, Save, Settings2, Vote } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { FilterBar, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { RecordSkeleton, recordHref, useHashRecord } from "@/components/record-list";
import list from "@/components/record-list.module.css";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { useI18n } from "@/components/i18n-context";
import styles from "@/components/notifications-center.module.css";
import { richTextPlainText } from "@/lib/announcement-content";
import { RichTextContent } from "@/components/rich-text-editor";
import { SubmitButton } from "@/components/form-actions";

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

function PreferencesPanel({ initial, units, saving, error, onSave }: { initial: Preferences; units: Unit[]; saving: boolean; error: string; onSave: (draft: Preferences) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);
  return <aside className={`panel ${styles.preferences}`}>
    <SurfaceHeader icon={<Settings2 />} title={t("notifications.preferences.title")} />
    <form onSubmit={event => { event.preventDefault(); if (!saving) onSave(draft); }}>
      <div className={styles.preferencesBody}>
        <fieldset className={styles.group} disabled={saving}>
          <legend>{t("notifications.preferences.categories")}</legend>
          <div className={styles.categories}>{categories.map(key => <label className={styles.check} key={key}><input type="checkbox" checked={draft.categories[key] !== false} onChange={event => setDraft(current => ({ ...current, categories: { ...current.categories, [key]: event.target.checked } }))} /><span>{t(categoryTranslationKeys[key])}</span></label>)}</div>
        </fieldset>
        <fieldset className={styles.group} disabled={saving}>
          <legend>{t("notifications.preferences.priority")}</legend>
          <label className={styles.check}><input type="checkbox" checked={draft.urgentOnly} onChange={event => setDraft(current => ({ ...current, urgentOnly: event.target.checked }))} /><span>{t("notifications.preferences.urgentOnly")}</span></label>
        </fieldset>
        {units.length > 0 && <fieldset className={styles.group} disabled={saving}>
          <legend>{t("notifications.preferences.units")}</legend>
          <SearchableMultiSelect label={t("notifications.preferences.units")} value={draft.unitIds} onChange={unitIds => setDraft(current => ({ ...current, unitIds }))} options={units.map(unit => ({ value: unit.id, label: `${unit.code ? `${unit.code} · ` : ""}${unit.name}`, disabled: saving }))} />
        </fieldset>}
        {error && <p className={styles.preferencesError} role="alert">{error}</p>}
      </div>
      <footer className={styles.preferencesFooter}><SubmitButton busy={saving}><Save aria-hidden="true" />{t(saving ? "notifications.preferences.saving" : "notifications.preferences.save")}</SubmitButton></footer>
    </form>
  </aside>;
}

export function NotificationsCenter() {
  const { locale, t } = useI18n(); const [items, setItems] = useState<Notification[]>([]), [preferences, setPreferences] = useState<Preferences>({ categories: Object.fromEntries(categories.map(key => [key, true])), urgentOnly: false, unitIds: [], email: false }), [units, setUnits] = useState<Unit[]>([]), [tab, setTab] = useState<"all" | "unread" | "archived">("all"), [category, setCategory] = useState("all"), [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(""), [saving, setSaving] = useState(false), [notice, setNotice] = useState<Notice>(null), [query, setQuery] = useState("");
  const [preferencesError, setPreferencesError] = useState("");
  const [openId, openNotification] = useHashRecord("notificacao");
  const load = useCallback(async (refresh = false) => { if (!refresh) setLoading(true); setError(""); try { const [feedResponse, prefResponse] = await Promise.all([fetch("/api/notifications?limit=100&includeArchived=true", { cache: "no-store" }), fetch("/api/notification-preferences", { cache: "no-store" })]), feedPayload = await feedResponse.json().catch(() => ({})) as unknown, prefPayload = await prefResponse.json().catch(() => ({})) as unknown; if (!feedResponse.ok) throw new Error(str(obj(feedPayload), "error", "message") || t("notifications.loadError")); const root = obj(feedPayload), raw = (Array.isArray(root.notifications) ? root.notifications : Array.isArray(root.items) ? root.items : Array.isArray(feedPayload) ? feedPayload : []) as unknown[]; setItems(raw.map(normaliseNotification)); if (prefResponse.ok) { const next = normalisePreferences(prefPayload); setPreferences(next.prefs); setUnits(next.units); } } catch (cause) { setError(cause instanceof Error ? cause.message : t("notifications.loadError")); } finally { setLoading(false); } }, [t]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  const unread = items.filter(item => !item.read && !item.archived).length;
  const priorityLabel = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("en");
    if (normalized === "urgent") return t("notifications.priority.urgent");
    if (normalized === "important") return t("notifications.priority.important");
    if (normalized === "normal") return t("notifications.priority.normal");
    return value;
  };
  const visible = useMemo(() => { const term = query.trim().toLocaleLowerCase(locale); return items.filter(item => (tab === "archived" ? item.archived : !item.archived) && (tab !== "unread" || !item.read) && (category === "all" || item.category === category) && (!term || [item.title, richTextPlainText(item.body), item.unitName].join(" ").toLocaleLowerCase(locale).includes(term))); }, [category, items, locale, query, tab]);
  const patch = async (updates: Array<Record<string, unknown>>, key: string, optimistic: (item: Notification) => Notification, action?: Record<string, unknown>) => { setBusy(key); const previous = items; setItems(current => current.map(optimistic)); try { const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(action ?? (updates.length === 1 ? updates[0] : { items: updates })) }); const payload = await response.json().catch(() => ({})) as unknown; if (!response.ok) throw new Error(str(obj(payload), "error", "message") || t("notifications.actionError")); window.dispatchEvent(new CustomEvent("notifications:changed")); if (key === "all") setNotice({ kind: "success", message: t("notifications.markAllSuccess") }); return true; } catch (cause) { setItems(previous); setNotice({ kind: "error", message: cause instanceof Error ? cause.message : t("notifications.actionError") }); return false; } finally { setBusy(""); } };
  const markRead = (item: Notification) => patch([{ sourceType: item.sourceType, sourceId: item.sourceId, read: true }], item.id, current => current.id === item.id ? { ...current, read: true } : current);
  const markAll = () => patch([], "all", item => item.archived ? item : { ...item, read: true }, { action: "mark_all_read" });
  const setArchived = async (item: Notification, archived: boolean) => {
    const updated = await patch([{ sourceType: item.sourceType, sourceId: item.sourceId, archived }], item.id, current => current.id === item.id ? { ...current, archived } : current);
    if (updated) setNotice({ kind: "success", message: t(archived ? "notifications.archivedSuccess" : "notifications.restoredSuccess") });
  };
  const savePreferences = async (draft: Preferences) => {
    if (saving) return;
    setSaving(true);
    setPreferencesError("");
    try {
      const response = await fetch("/api/notification-preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ announcements: draft.categories.announcements, calendar: draft.categories.calendar, polls: draft.categories.polls, requests: draft.categories.requests, materials: draft.categories.materials, email: draft.email, urgentOnly: draft.urgentOnly, unitIds: draft.unitIds }) });
      const payload = await response.json().catch(() => ({})) as unknown;
      if (!response.ok) throw new Error(str(obj(payload), "error", "message") || t("notifications.preferences.error"));
      setPreferences(draft);
      setNotice({ kind: "success", message: t("notifications.preferences.saved") });
      void load(true);
    } catch (cause) { setPreferencesError(cause instanceof Error ? cause.message : t("notifications.preferences.error")); }
    finally { setSaving(false); }
  };
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
  const categoryLabel = (value: string) => value in categoryTranslationKeys ? t(categoryTranslationKeys[value as keyof typeof categoryTranslationKeys]) : value;
  const openItem = openId ? items.find(item => item.id === openId) ?? null : null;
  // Opening a notification marks it as read.
  const openAndMarkRead = (item: Notification) => { openNotification(item.id); if (!item.read) void markRead(item); };
  return <AppShell active="notifications" breadcrumb="Notificações"><div className={styles.center}>{notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <SurfaceHeader standalone headingLevel="h1" icon={<BellRing />} eyebrow={t("notifications.eyebrow")} title={t("notifications.title")} />
    <div className={!openId ? styles.layout : styles.detailLayout}>
      {!openId ? <section className={`panel ${list.listPanel}`} aria-busy={loading}>
        <SurfaceHeader icon={<Bell />} title={t("notifications.title")} />
        <FilterBar label={t("notifications.filterState")} className={styles.filters}>
          <FilterSearch label={t("notifications.search")} value={query} onChange={setQuery} placeholder={t("notifications.search")} />
          <FilterSegmented label={t("notifications.stateLabel")} value={tab} onChange={setTab} options={[{ value: "all", label: t("notifications.tabs.all") }, { value: "unread", label: t("notifications.tabs.unread"), count: unread }, { value: "archived", label: t("notifications.tabs.archived") }]} />
          <FilterSelect label={t("notifications.filterCategory")} value={category} onChange={setCategory} options={[{ value: "all", label: t("notifications.categories.all") }, ...categories.map(key => ({ value: key, label: t(categoryTranslationKeys[key]) }))]} />
        </FilterBar>
        {loading ? <RecordSkeleton label={t("notifications.loading")} /> : error ? <div className={list.empty} role="alert"><Bell /><strong>{t("notifications.loadError")}</strong><button className={styles.retry} onClick={() => void load()} type="button"><RefreshCw size={13} /> {t("notifications.retry")}</button></div> : visible.length ? <ul className={list.rows}>{visible.map(item => <li className={`${list.row} ${styles.notification}`} key={item.id} data-tone={item.read ? undefined : "accent"} data-priority={item.priority}>
          <span className={list.statusDot} aria-hidden="true" />
          <div className={list.rowMain}>
            <h3><a className={`link-quiet ${list.titleLink}`} href={recordHref("notificacao", item.id)} onClick={event => { event.preventDefault(); openAndMarkRead(item); }}>{item.title || t("notifications.untitled")}{!item.read && <span className="sr-only"> ({t("notifications.unread")})</span>}</a></h3>
            <p className={list.rowMeta}>{[categoryLabel(item.category), item.unitName, formatDate(item.createdAt)].filter(Boolean).join(" · ")}</p>
          </div>
          <div className={list.rowEnd}>
            {item.priority && item.priority !== "normal" && <span className={list.statusPill} data-tone={item.priority === "urgent" ? "danger" : "accent"}>{priorityLabel(item.priority)}</span>}
            <button className={styles.archiveButton} type="button" disabled={Boolean(busy)} aria-label={`${t(item.archived ? "notifications.restore" : "notifications.archive")}: ${item.title || t("notifications.untitled")}`} title={t(item.archived ? "notifications.restore" : "notifications.archive")} onClick={() => void setArchived(item, !item.archived)}>{item.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}</button>
          </div>
        </li>)}</ul> : <div className={list.empty}><Bell /><strong>{query.trim() || category !== "all" ? t("notifications.noResults") : tab === "unread" ? t("notifications.emptyUnread") : tab === "archived" ? t("notifications.emptyArchived") : t("notifications.empty")}</strong></div>}
        <footer className={styles.listFooter}><button className="button button--secondary" type="button" disabled={loading || Boolean(busy)} aria-busy={busy === "all" || undefined} onClick={() => void markAll()}><CheckCheck aria-hidden="true" />{t("notifications.markAll")}</button></footer>
      </section> : <div className={styles.detail}>
        <button className={list.back} type="button" onClick={() => openNotification(null)}><ChevronLeft aria-hidden="true" />{t("notifications.back")}</button>
        <article className={`panel ${list.reading} ${styles.notification}`} aria-busy={loading} data-priority={openItem?.priority}>
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
            {openItem.body && <RichTextContent value={openItem.body} className={list.readingBody} />}
            <footer className={list.manageArea}>
              <div className={styles.detailActions}>
                <Link className={`button button--secondary ${styles.openSource}`} href={openItem.href}>{t("notifications.open")}<ChevronRight aria-hidden="true" /></Link>
                <button className="button button--ghost" type="button" disabled={Boolean(busy)} onClick={() => void setArchived(openItem, !openItem.archived)}>{openItem.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}{t(openItem.archived ? "notifications.restore" : "notifications.archive")}</button>
              </div>
            </footer>
          </>}
        </article>
      </div>}
      {!openId && (loading ? <aside className="panel"><RecordSkeleton label={t("notifications.loading")} rows={3} /></aside> : <PreferencesPanel initial={preferences} units={units} saving={saving} error={preferencesError} onSave={draft => void savePreferences(draft)} />)}
    </div>
  </div></AppShell>;
}
