"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Bold, ChevronLeft, Italic, Link2, List, ListOrdered, Megaphone, MessageCircle, Pencil, RotateCcw, Search, Underline } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AnnouncementComments, initials } from "@/components/announcement-comments";
import { AppToast, ToastKind } from "@/components/app-toast";
import { Pagination } from "@/components/pagination";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { AuthGuard } from "@/components/auth-guard";
import { FilterBar, FilterSearch, FilterSegmented, FilterSelect } from "@/components/filter-bar";
import { useFloatingAction } from "@/components/floating-actions";
import { CancelButton, FormActions, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { SurfaceHeader } from "@/components/surface-header";
import { announcementDisplayHtml, announcementPlainText } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import styles from "@/components/announcements-board.module.css";

type Priority = "normal" | "important" | "urgent";
type AnnouncementStatus = "active" | "scheduled" | "expired" | "archived";
type ApiAnnouncementStatus = AnnouncementStatus | "published";

type ApiAnnouncement = {
  id: string | number;
  title: string;
  body?: string;
  content?: string;
  priority?: Priority;
  isCritical?: boolean;
  is_critical?: number;
  status?: ApiAnnouncementStatus;
  author?: { fullName?: string; full_name?: string; commissionPosition?: string; commission_position?: string };
  authorName?: string;
  author_name?: string;
  authorPosition?: string;
  author_position?: string;
  authorPositionLabel?: string;
  author_position_label?: string;
  authorId?: string;
  authorEmail?: string;
  authorStudentNumber?: string;
  commissionPosition?: string;
  commission_position?: string;
  publishedAt?: string | number;
  published_at?: string | number;
  createdAt?: string | number;
  created_at?: string | number;
  expiresAt?: string | number | null;
  expires_at?: string | number | null;
  canEdit?: boolean;
  comment_count?: number;
  audience_scope?: string;
  audience_year?: number | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  status: AnnouncementStatus;
  authorName: string;
  authorPosition: string;
  authorId: string;
  authorEmail: string;
  authorStudentNumber: string;
  publishedAt: string | number;
  expiresAt: string | number | null;
  isCritical: boolean;
  canEdit: boolean;
  commentCount: number;
  audienceScope: "all" | "year";
  audienceYear: number | null;
};

type AnnouncementsResponse = {
  announcements?: ApiAnnouncement[];
  canPublish?: boolean;
  can_publish?: boolean;
  canViewAuthorIdentifiers?: boolean;
  capabilities?: { publish?: boolean; archive?: boolean };
  error?: string;
};

type Notice = { kind: ToastKind; message: string };

const PAGE_SIZE = 6;

function announcementIdFromHash() {
  const match = /^#aviso-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function normalizedStatus(item: ApiAnnouncement): AnnouncementStatus {
  if (item.status && item.status !== "published") return item.status;
  const expiry = item.expiresAt ?? item.expires_at;
  return expiry && new Date(expiry).getTime() <= Date.now() ? "expired" : "active";
}

function normalize(item: ApiAnnouncement, fallbackMember: string, fallbackCommission: string): Announcement {
  return {
    id: String(item.id),
    title: item.title,
    body: item.body ?? item.content ?? "",
    priority: item.priority ?? "normal",
    status: normalizedStatus(item),
    authorName: item.author?.fullName ?? item.author?.full_name ?? item.authorName ?? item.author_name ?? fallbackMember,
    authorPosition: item.author?.commissionPosition ?? item.author?.commission_position ?? item.authorPositionLabel ?? item.author_position_label ?? item.authorPosition ?? item.author_position ?? item.commissionPosition ?? item.commission_position ?? fallbackCommission,
    authorId: String(item.authorId ?? ""),
    authorEmail: String(item.authorEmail ?? ""),
    authorStudentNumber: String(item.authorStudentNumber ?? ""),
    publishedAt: item.publishedAt ?? item.published_at ?? item.createdAt ?? item.created_at ?? Date.now(),
    expiresAt: item.expiresAt ?? item.expires_at ?? null,
    isCritical: item.isCritical === true || item.is_critical === 1,
    canEdit: item.canEdit === true,
    commentCount: Number(item.comment_count ?? 0),
    audienceScope: item.audience_scope === "year" ? "year" : "all",
    audienceYear: item.audience_year ?? null,
  };
}

function formatDate(value: string | number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}


export function AnnouncementsBoard() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const priorityLabels = useMemo<Record<Priority, string>>(() => ({
    normal: t("announcements.priority.normal"),
    important: t("announcements.priority.important"),
    urgent: t("announcements.priority.urgent"),
  }), [t]);
  const statusLabels = useMemo<Record<AnnouncementStatus, string>>(() => ({
    active: t("announcements.status.active"),
    scheduled: t("announcements.status.scheduled"),
    expired: t("announcements.status.expired"),
    archived: t("announcements.status.archived"),
  }), [t]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [canArchive, setCanArchive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [isCritical, setIsCritical] = useState(false);
  const [audienceScope, setAudienceScope] = useState<"all" | "year">("all");
  const [audienceYear, setAudienceYear] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"active" | "archived">("active");
  const [archiveTarget, setArchiveTarget] = useState<Announcement | null>(null);
  // Read on first render: the app shell rewrites the URL while the session loads.
  const [openId, setOpenId] = useState<string | null>(() => typeof window === "undefined" ? null : announcementIdFromHash());
  const editorRef = useRef<HTMLDivElement>(null);
  const [minimumExpiry] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(view === "archived" ? "/api/announcements?view=archived" : "/api/announcements", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as AnnouncementsResponse;
      if (!response.ok) throw new Error(data.error || t("announcements.loadError"));
      const publish = data.canPublish ?? data.can_publish ?? data.capabilities?.publish ?? false;
      setAnnouncements((data.announcements ?? []).map(item => normalize(item, t("announcements.fallbackMember"), t("announcements.fallbackCommission"))));
      setCanPublish(publish);
      setCanArchive(data.capabilities?.archive ?? false);
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("announcements.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t, view]);

  // A função inicia I/O antes de atualizar o estado com a resposta.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // The open announcement lives in #aviso-<id> so it can be linked and the back button works.
  useEffect(() => {
    const sync = () => setOpenId(announcementIdFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openAnnouncement = (id: string | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `aviso-${id}` : "";
    window.history.pushState(null, "", url);
    setOpenId(id);
    window.scrollTo({ top: 0 });
  };

  const newAnnouncementIcon = useMemo(() => <Pencil />, []);
  useFloatingAction(canPublish && !editorOpen && !openId ? { id: "new-announcement", label: t("announcements.new"), icon: newAnnouncementIcon, onClick: () => { openAnnouncement(null); fillEditor(null); setEditorOpen(true); } } : null);

  const sortedAnnouncements = useMemo(() => [...announcements].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()), [announcements]);
  const authors = useMemo(() => [...new Set(sortedAnnouncements.map(item => item.authorName))].sort((a, b) => a.localeCompare(b, dateLocale)), [dateLocale, sortedAnnouncements]);
  const filteredAnnouncements = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase(dateLocale);
    return sortedAnnouncements.filter(item => {
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (authorFilter !== "all" && item.authorName !== authorFilter) return false;
      if (!query) return true;
      const searchable = [item.title, announcementPlainText(item.body), item.authorName, item.authorPosition, priorityLabels[item.priority]].join(" ").toLocaleLowerCase(dateLocale);
      return searchable.includes(query);
    });
  }, [authorFilter, dateLocale, priorityFilter, priorityLabels, searchQuery, sortedAnnouncements]);
  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedAnnouncements = useMemo(() => filteredAnnouncements.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [currentPage, filteredAnnouncements]);
  const resetFilters = () => { setSearchQuery(""); setPriorityFilter("all"); setAuthorFilter("all"); setPage(1); };

  const toLocalInput = (value: string | number | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
  const fillEditor = (item: Announcement | null) => {
    setEditingId(item?.id ?? null);
    setTitle(item?.title ?? "");
    setBody(item?.body ?? "");
    setPriority(item?.priority ?? "normal");
    setIsCritical(item?.isCritical ?? false);
    setAudienceScope(item?.audienceScope ?? "all");
    setAudienceYear(item?.audienceYear ? String(item.audienceYear) : "");
    setExpiresAt(toLocalInput(item?.expiresAt ?? null));
  };
  const closeEditor = () => { fillEditor(null); setEditorOpen(false); };
  const startEditing = (item: Announcement) => { fillEditor(item); setEditorOpen(true); window.scrollTo({ top: 0 }); };

  // The rich-text area is uncontrolled: load the text being edited when it mounts.
  const loadEditorContent = useCallback((node: HTMLDivElement | null) => {
    editorRef.current = node;
    if (node && !node.innerHTML) node.innerHTML = body;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, editingId]);

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || announcementPlainText(body).length < 10) {
      setNotice({ kind: "warning", message: t("announcements.validationError") });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/announcements", {
        method: editingId ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(editingId ? { action: "update", id: editingId } : {}), title: title.trim(), body: body.trim(), priority, isCritical, audienceScope, audienceYear: audienceScope === "year" && audienceYear ? Number(audienceYear) : null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.publishError"));
      setNotice({ kind: "success", message: t(editingId ? "announcements.updateSuccess" : "announcements.publishSuccess") });
      closeEditor();
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("announcements.publishError") });
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (id: string, status: "archived" | "published" = "archived") => {
    setArchivingId(id);
    try {
      const response = await fetch("/api/announcements", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.archiveError"));
      setNotice({ kind: "success", message: t(status === "archived" ? "announcements.archiveSuccess" : "announcements.restoreSuccess") });
      if (announcementIdFromHash() === id) openAnnouncement(null);
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("announcements.archiveError") });
    } finally {
      setArchivingId(null);
    }
  };

  const format = (command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") => {
    editorRef.current?.focus();
    document.execCommand(command);
    setBody(editorRef.current?.innerHTML ?? "");
  };

  const addLink = () => {
    const value = window.prompt(t("announcements.linkPrompt"));
    if (!value) return;
    try {
      const url = new URL(value);
      if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw new Error();
      editorRef.current?.focus();
      document.execCommand("createLink", false, value);
      setBody(editorRef.current?.innerHTML ?? "");
    } catch {
      setNotice({ kind: "warning", message: t("announcements.linkInvalid") });
    }
  };

  const bodyLength = announcementPlainText(body).length;
  // Day groups (Lisbon time): today and yesterday show the hour, this week the weekday, older ones month and year.
  const groupByDay = (items: Announcement[]) => {
    const dayKey = (value: string | number | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(value));
    const daysAgo = (value: string | number) => Math.round((Date.parse(dayKey(Date.now())) - Date.parse(dayKey(value))) / 86_400_000);
    const time = (value: string | number) => new Intl.DateTimeFormat(dateLocale, { timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
    const weekday = (value: string | number) => new Intl.DateTimeFormat(dateLocale, { weekday: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
    const shortDate = (value: string | number) => new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
    const groups: { key: string; label: string; when: (value: string | number) => string; items: Announcement[] }[] = [];
    for (const item of items) {
      const days = daysAgo(item.publishedAt);
      const group = days <= 0 ? { key: "today", label: t("announcements.group.today"), when: time }
        : days === 1 ? { key: "yesterday", label: t("announcements.group.yesterday"), when: time }
        : days < 7 ? { key: "week", label: t("announcements.group.week"), when: weekday }
        : (() => { const label = new Intl.DateTimeFormat(dateLocale, { month: "long", year: "numeric", timeZone: "Europe/Lisbon" }).format(new Date(item.publishedAt)); return { key: label, label: label.charAt(0).toLocaleUpperCase(dateLocale) + label.slice(1), when: shortDate }; })();
      const last = groups[groups.length - 1];
      if (last?.key === group.key) last.items.push(item); else groups.push({ ...group, items: [item] });
    }
    return groups;
  };
  const openItem = openId ? announcements.find(item => item.id === openId) ?? null : null;
  const authorOf = (item: Announcement) => personDisplay({ fullName: item.authorName, id: item.authorId, email: item.authorEmail, studentNumber: item.authorStudentNumber }, { revealIdentifier: false, locale });
  // On an open announcement its own actions live in the floating menu.
  const archiveIcon = useMemo(() => <Archive />, []);
  const openEditable = !editorOpen && openItem?.canEdit && openItem.status !== "archived" ? openItem : null;
  const openRestorable = !editorOpen && openItem?.canEdit && openItem.status === "archived" ? openItem : null;
  const restoreIcon = useMemo(() => <RotateCcw />, []);
  useFloatingAction(openRestorable && archivingId !== openRestorable.id ? { id: "restore-announcement", label: t("announcements.restore"), icon: restoreIcon, onClick: () => void archive(openRestorable.id, "published") } : null);
  useFloatingAction(openEditable ? { id: "edit-announcement", label: t("announcements.edit"), icon: newAnnouncementIcon, onClick: () => startEditing(openEditable) } : null);
  useFloatingAction(openEditable && archivingId !== openEditable.id ? { id: "archive-announcement", label: t("announcements.archive"), icon: archiveIcon, onClick: () => setArchiveTarget(openEditable) } : null);

  return <AuthGuard><ModuleGuard moduleKey="announcements.feed"><AppShell active="announcements" breadcrumb={t("announcements.title")}>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <SurfaceHeader
      standalone
      headingLevel="h1"
      icon={<Megaphone />}
      eyebrow={t("announcements.eyebrow")}
      title={t("announcements.title")}
     
    />

    {canPublish && editorOpen && <form id="announcement-editor" className={`panel ${styles.editor}`} onSubmit={publish}>
      <SurfaceHeader icon={<Megaphone />} title={t(editingId ? "announcements.editor.editTitle" : "announcements.editor.title")} actions={<FormCloseButton onClick={closeEditor} label={t("common.close")} disabled={submitting} />} />
      <div className={styles.fields}>
        <label className={`${styles.field} ${styles.wide}`}><span className={styles.fieldLabel}>{t("announcements.editor.titleLabel")}</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} required placeholder={t("announcements.editor.titlePlaceholder")} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>{t("announcements.editor.priority")}</span><select value={priority} onChange={event => setPriority(event.target.value as Priority)}><option value="normal">{priorityLabels.normal}</option><option value="important">{priorityLabels.important}</option><option value="urgent">{priorityLabels.urgent}</option></select></label>
        <label className={styles.field}><span className={styles.fieldLabel}>{t("announcements.editor.audience")}</span><select value={audienceScope} onChange={event => setAudienceScope(event.target.value as "all" | "year")}><option value="all">{t("announcements.editor.audienceAll")}</option><option value="year">{t("announcements.editor.audienceYear")}</option></select></label>
        {audienceScope === "year" && <label className={styles.field}><span className={styles.fieldLabel}>{t("announcements.editor.audienceYear")}</span><input type="number" min={1} max={6} value={audienceYear} onChange={event => setAudienceYear(event.target.value)} placeholder={t("announcements.editor.audienceYearPlaceholder")} required /></label>}
        <label className={styles.field}><span className={styles.fieldLabel}>{t("announcements.editor.visibleUntil")} <small>({t("common.optional")})</small></span><input type="datetime-local" value={expiresAt} min={minimumExpiry} onChange={event => setExpiresAt(event.target.value)} /></label>
        <div className={`${styles.field} ${styles.wide}`}><span className={styles.fieldLabel}>{t("announcements.editor.content")}</span><div className={styles.richEditor}>
          <div className={styles.toolbar} role="toolbar" aria-label={t("announcements.editor.toolbar")}>
            <button type="button" onClick={() => format("bold")} aria-label={t("announcements.editor.bold")} title={t("announcements.editor.bold")}><Bold /></button>
            <button type="button" onClick={() => format("italic")} aria-label={t("announcements.editor.italic")} title={t("announcements.editor.italic")}><Italic /></button>
            <button type="button" onClick={() => format("underline")} aria-label={t("announcements.editor.underline")} title={t("announcements.editor.underline")}><Underline /></button>
            <span />
            <button type="button" onClick={() => format("insertUnorderedList")} aria-label={t("announcements.editor.bullets")} title={t("announcements.editor.bullets")}><List /></button>
            <button type="button" onClick={() => format("insertOrderedList")} aria-label={t("announcements.editor.numbered")} title={t("announcements.editor.numbered")}><ListOrdered /></button>
            <button type="button" onClick={addLink} aria-label={t("announcements.editor.link")} title={t("announcements.editor.link")}><Link2 /></button>
          </div>
          <div ref={loadEditorContent} className={styles.editable} contentEditable role="textbox" aria-label={t("announcements.editor.content")} aria-multiline="true" data-placeholder={t("announcements.editor.placeholder")} onInput={event => setBody(event.currentTarget.innerHTML)} suppressContentEditableWarning />
        </div></div>
        <label className={`${styles.check} ${styles.wide}`}><input type="checkbox" checked={isCritical} onChange={event => setIsCritical(event.target.checked)} /><span>{t("announcements.editor.critical")}</span></label>
      </div>
      <FormActions aside={t("announcements.editor.characters", { count: bodyLength })}><CancelButton onClick={closeEditor} disabled={submitting}>{t("common.cancel")}</CancelButton><SubmitButton busy={submitting} disabled={bodyLength > 5000}>{submitting ? t("announcements.editor.publishing") : t(editingId ? "announcements.editor.save" : "announcements.editor.publish")}</SubmitButton></FormActions>
    </form>}
    {!editorOpen && openId && <>
    <button className={styles.back} type="button" onClick={() => openAnnouncement(null)}><ChevronLeft aria-hidden="true" />{t("announcements.back")}</button>
    <article className={`panel ${styles.reading} ${openItem ? styles[`priority_${openItem.priority}`] : ""}`} aria-busy={loading}>
      {loading ? <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("announcements.loading")}</span>{[0, 1, 2].map(index => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div> : !openItem ? <div className={styles.empty}><Megaphone /><strong>{t("announcements.noResults.title")}</strong></div> : (() => { const day = groupByDay([openItem])[0]; const authorInitials = initials(openItem.authorName); return <>
        <header className={styles.byline}>
          <span className={styles.avatar} aria-hidden="true">{authorInitials}</span>
          <div>
            <p className={styles.bylineName}><PersonName person={authorOf(openItem)} /></p>
            <p className={styles.bylineMeta}>{openItem.authorPosition ? `${openItem.authorPosition} · ` : ""}<time dateTime={new Date(openItem.publishedAt).toISOString()} title={formatDate(openItem.publishedAt, dateLocale)}>{day.key === "today" || day.key === "yesterday" ? `${day.label.toLocaleLowerCase(dateLocale)}, ${day.when(openItem.publishedAt)}` : formatDate(openItem.publishedAt, dateLocale)}</time></p>
          </div>
          {openItem.priority !== "normal" && <span className={styles.flag}>{priorityLabels[openItem.priority]}</span>}
          {canArchive && openItem.status !== "active" && <span className={`${styles.status} ${styles[`status_${openItem.status}`]}`}>{statusLabels[openItem.status]}</span>}
        </header>
        <h2 className={styles.readingTitle}>{openItem.title}</h2>
        <span className={styles.readingRule} aria-hidden="true" />
        <div className={`${styles.body} ${styles.readingBody}`} dangerouslySetInnerHTML={{ __html: announcementDisplayHtml(openItem.body) }} />
        {openItem.expiresAt && <p className={styles.readingNote}>{t("announcements.visibleUntil", { date: formatDate(openItem.expiresAt, dateLocale) })}</p>}
        <footer className={styles.readingComments}>
          <AnnouncementComments readOnly={openItem.status === "archived"} announcementId={openItem.id} revealIdentifiers={false} onCountChange={count => setAnnouncements(current => current.map(item => item.id === openItem.id && item.commentCount !== count ? { ...item, commentCount: count } : item))} />
        </footer>
      </>; })()}
    </article></>}
    {!editorOpen && !openId && <>
      <section className={`panel ${styles.feed}`} aria-label={t("announcements.feed.title")} aria-busy={loading}>
        <FilterBar label={t("announcements.filters.aria")} onClearAll={() => setPage(1)}>
          {canPublish && <FilterSegmented label={t("announcements.filters.state")} value={view} onChange={value => { setView(value); setPage(1); }} options={[{ value: "active", label: t("announcements.view.active") }, { value: "archived", label: t("announcements.view.archived") }]} />}
          <FilterSearch label={t("announcements.filters.search")} value={searchQuery} onChange={value => { setSearchQuery(value); setPage(1); }} placeholder={t("announcements.filters.placeholder")} />
          <FilterSelect label={t("announcements.filters.priority")} value={priorityFilter} onChange={value => { setPriorityFilter(value as Priority | "all"); setPage(1); }} options={[{ value: "all", label: t("announcements.filters.allPriorities") }, { value: "urgent", label: priorityLabels.urgent }, { value: "important", label: priorityLabels.important }, { value: "normal", label: priorityLabels.normal }]} />
          <FilterSelect label={t("announcements.filters.author")} value={authorFilter} onChange={value => { setAuthorFilter(value); setPage(1); }} options={[{ value: "all", label: t("announcements.filters.allAuthors") }, ...authors.map(author => ({ value: author, label: author }))]} />
        </FilterBar>
        {loading ? <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("announcements.loading")}</span>{[0, 1, 2].map(index => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div> : announcements.length === 0 ? <div className={styles.empty}><Megaphone /><strong>{t(view === "archived" ? "announcements.empty.archived" : "announcements.empty.title")}</strong></div> : filteredAnnouncements.length === 0 ? <div className={styles.empty}><Search /><strong>{t("announcements.noResults.title")}</strong><button className="button" type="button" onClick={resetFilters}><RotateCcw />{t("announcements.filters.reset")}</button></div> : <>
        {groupByDay(paginatedAnnouncements).map(group => <section className={`${styles.group} ${group.key === "today" ? styles.groupToday : ""}`} key={group.key} aria-label={group.label}>
          <h3 className={styles.dayChip}>{group.label}</h3>
          <ul className={styles.rows}>
            {group.items.map(item => <li className={`${styles.row} ${styles[`priority_${item.priority}`]} ${item.status === "archived" ? styles.archived : ""}`} key={item.id}>
              <span className={styles.node} aria-hidden="true" />
              <div className={styles.rowMain}>
                <h4><a className={`link-quiet ${styles.titleLink}`} href={`#aviso-${encodeURIComponent(item.id)}`} onClick={event => { event.preventDefault(); openAnnouncement(item.id); }}>{item.title}</a>{item.priority !== "normal" && <span className={styles.flag}>{priorityLabels[item.priority]}</span>}</h4>
                <p className={styles.rowMeta}><PersonName person={authorOf(item)} />{item.authorPosition ? ` · ${item.authorPosition}` : ""} · <time dateTime={new Date(item.publishedAt).toISOString()} title={formatDate(item.publishedAt, dateLocale)}>{group.when(item.publishedAt)}</time>{item.commentCount > 0 && <span className={styles.commentCount} aria-label={t(item.commentCount === 1 ? "announcements.comments.countOne" : "announcements.comments.countMany", { count: item.commentCount })}><MessageCircle aria-hidden="true" />{item.commentCount}</span>}</p>
              </div>
              {canArchive && item.status !== "active" && <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span>}
            </li>)}
          </ul>
        </section>)}
        <Pagination page={currentPage} totalItems={filteredAnnouncements.length} pageSize={PAGE_SIZE} onChange={setPage} /></>}
      </section>
    </>}
    <ConfirmationDialog
      open={Boolean(archiveTarget)}
      eyebrow={t("announcements.archiveDialog.eyebrow")}
      title={t("announcements.archiveDialog.title")}
      description={t("announcements.archiveDialog.description")}
      subject={archiveTarget?.title}
      subjectLabel={t("announcements.archiveDialog.subject")}
      confirmLabel={t(archivingId ? "announcements.archiving" : "announcements.archive")}
      cancelLabel={t("common.cancel")}
      icon={<Archive />}
      busy={Boolean(archivingId)}
      onClose={() => { if (!archivingId) setArchiveTarget(null); }}
      onConfirm={() => { if (archiveTarget) void archive(archiveTarget.id).then(() => setArchiveTarget(null)); }}
    />
  </AppShell></ModuleGuard></AuthGuard>;
}
