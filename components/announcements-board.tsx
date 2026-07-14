"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, Archive, Bold, CalendarClock, ChevronLeft, ChevronRight, Flag, Italic, Link2, List, ListOrdered, LoaderCircle, Megaphone, Plus, RotateCcw, Search, Send, Underline, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
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
type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

const PAGE_SIZE = 6;

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
  };
}

function formatDate(value: string | number, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value));
}

function paginationItems(totalPages: number, currentPage: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (currentPage >= totalPages - 3) return [1, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "ellipsis-start", currentPage - 1, currentPage, currentPage + 1, "ellipsis-end", totalPages];
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
  const [canViewAuthorIdentifiers, setCanViewAuthorIdentifiers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [expiresAt, setExpiresAt] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);
  const [minimumExpiry] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/announcements", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json() as AnnouncementsResponse;
      if (!response.ok) throw new Error(data.error || t("announcements.loadError"));
      const publish = data.canPublish ?? data.can_publish ?? data.capabilities?.publish ?? false;
      setAnnouncements((data.announcements ?? []).map(item => normalize(item, t("announcements.fallbackMember"), t("announcements.fallbackCommission"))));
      setCanPublish(publish);
      setCanArchive(data.capabilities?.archive ?? false);
      setCanViewAuthorIdentifiers(Boolean(data.canViewAuthorIdentifiers));
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("announcements.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  // A função inicia I/O antes de atualizar o estado com a resposta.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

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
  const pages = useMemo(() => paginationItems(totalPages, currentPage), [currentPage, totalPages]);
  const hasFilters = Boolean(searchQuery.trim() || priorityFilter !== "all" || authorFilter !== "all");
  const resetFilters = () => { setSearchQuery(""); setPriorityFilter("all"); setAuthorFilter("all"); setPage(1); };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || announcementPlainText(body).length < 10) {
      setNotice({ kind: "warning", message: t("announcements.validationError") });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), priority, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.publishError"));
      setTitle(""); setBody(""); setPriority("normal"); setExpiresAt(""); setEditorOpen(false);
      if (editorRef.current) editorRef.current.innerHTML = "";
      setNotice({ kind: "success", message: t("announcements.publishSuccess") });
      await load();
    } catch (reason) {
      setNotice({ kind: "error", message: reason instanceof Error ? reason.message : t("announcements.publishError") });
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (id: string) => {
    setArchivingId(id);
    try {
      const response = await fetch("/api/announcements", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "archived" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || t("announcements.archiveError"));
      setNotice({ kind: "success", message: t("announcements.archiveSuccess") });
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

  return <AuthGuard><ModuleGuard moduleKey="announcements.feed"><AppShell active="announcements" breadcrumb={t("announcements.title")}>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <section className={styles.heading}>
      <div><span className="eyebrow">{t("announcements.eyebrow")}</span><h1>{t("announcements.title")}</h1><p>{t("announcements.intro")}</p></div>
      {canPublish && <button className="button button--primary" type="button" onClick={() => setEditorOpen(current => !current)} aria-expanded={editorOpen} aria-controls="announcement-editor"><Plus />{editorOpen ? t("announcements.closeEditor") : t("announcements.new")}</button>}
    </section>

    {canPublish && editorOpen && <form id="announcement-editor" className={`panel ${styles.editor}`} onSubmit={publish}>
      <header><span className={styles.editorIcon}><Megaphone /></span><div><span className="eyebrow">{t("announcements.editor.eyebrow")}</span><h2>{t("announcements.editor.title")}</h2><p>{t("announcements.editor.intro")}</p></div></header>
      <div className={styles.formGrid}>
        <label className={styles.titleField}><FormLabel icon={Megaphone}>{t("announcements.editor.titleLabel")}</FormLabel><input value={title} onChange={event => setTitle(event.target.value)} maxLength={140} required placeholder={t("announcements.editor.titlePlaceholder")} /></label>
        <label><FormLabel icon={Flag}>{t("announcements.editor.priority")}</FormLabel><select value={priority} onChange={event => setPriority(event.target.value as Priority)}><option value="normal">{priorityLabels.normal}</option><option value="important">{priorityLabels.important}</option><option value="urgent">{priorityLabels.urgent}</option></select></label>
        <div className={styles.bodyField}><FormLabel icon={AlignLeft}>{t("announcements.editor.content")}</FormLabel><div className={styles.richEditor}>
          <div className={styles.toolbar} role="toolbar" aria-label={t("announcements.editor.toolbar")}>
            <button type="button" onClick={() => format("bold")} aria-label={t("announcements.editor.bold")} title={t("announcements.editor.bold")}><Bold /></button>
            <button type="button" onClick={() => format("italic")} aria-label={t("announcements.editor.italic")} title={t("announcements.editor.italic")}><Italic /></button>
            <button type="button" onClick={() => format("underline")} aria-label={t("announcements.editor.underline")} title={t("announcements.editor.underline")}><Underline /></button>
            <span />
            <button type="button" onClick={() => format("insertUnorderedList")} aria-label={t("announcements.editor.bullets")} title={t("announcements.editor.bullets")}><List /></button>
            <button type="button" onClick={() => format("insertOrderedList")} aria-label={t("announcements.editor.numbered")} title={t("announcements.editor.numbered")}><ListOrdered /></button>
            <button type="button" onClick={addLink} aria-label={t("announcements.editor.link")} title={t("announcements.editor.link")}><Link2 /></button>
          </div>
          <div ref={editorRef} className={styles.editable} contentEditable role="textbox" aria-label={t("announcements.editor.content")} aria-multiline="true" data-placeholder={t("announcements.editor.placeholder")} onInput={event => setBody(event.currentTarget.innerHTML)} suppressContentEditableWarning />
        </div></div>
        <label><FormLabel icon={CalendarClock} optional>{t("announcements.editor.visibleUntil")}</FormLabel><input type="datetime-local" value={expiresAt} min={minimumExpiry} onChange={event => setExpiresAt(event.target.value)} /></label>
      </div>
      <footer><span>{t("announcements.editor.characters", { count: bodyLength })}</span><button className="button button--primary" type="submit" disabled={submitting || bodyLength > 5000}>{submitting ? <LoaderCircle className={styles.spinner} /> : <Send />}{submitting ? t("announcements.editor.publishing") : t("announcements.editor.publish")}</button></footer>
    </form>}

    {!editorOpen && <section className={`panel ${styles.feed}`} aria-busy={loading}>
      <header className="panel__header"><div><h2>{t("announcements.feed.title")}</h2><p>{t("announcements.feed.intro")}</p></div><span className={styles.count}>{hasFilters ? t("announcements.feed.countFiltered", { visible: filteredAnnouncements.length, total: announcements.length }) : t(filteredAnnouncements.length === 1 ? "announcements.feed.countOne" : "announcements.feed.countMany", { count: filteredAnnouncements.length })}</span></header>
      <div className={styles.filters} aria-label={t("announcements.filters.aria")}>
        <label className={styles.searchField}><FormLabel icon={Search}>{t("announcements.filters.search")}</FormLabel><div><Search /><input type="search" value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setPage(1); }} placeholder={t("announcements.filters.placeholder")} /></div></label>
        <label><FormLabel icon={Flag}>{t("announcements.filters.priority")}</FormLabel><select value={priorityFilter} onChange={event => { setPriorityFilter(event.target.value as Priority | "all"); setPage(1); }}><option value="all">{t("announcements.filters.allPriorities")}</option><option value="urgent">{priorityLabels.urgent}</option><option value="important">{priorityLabels.important}</option><option value="normal">{priorityLabels.normal}</option></select></label>
        <label><FormLabel icon={UserRound}>{t("announcements.filters.author")}</FormLabel><select value={authorFilter} onChange={event => { setAuthorFilter(event.target.value); setPage(1); }}><option value="all">{t("announcements.filters.allAuthors")}</option>{authors.map(author => <option value={author} key={author}>{author}</option>)}</select></label>
        <button className={styles.resetFilters} type="button" onClick={resetFilters} disabled={!hasFilters}><RotateCcw />{t("announcements.filters.reset")}</button>
      </div>
      {loading ? <div className={styles.loading}><LoaderCircle className={styles.spinner} /><strong>{t("announcements.loading")}</strong></div> : announcements.length === 0 ? <div className={styles.empty}><Megaphone /><strong>{t("announcements.empty.title")}</strong><span>{t("announcements.empty.body")}</span></div> : filteredAnnouncements.length === 0 ? <div className={styles.empty}><Search /><strong>{t("announcements.noResults.title")}</strong><span>{t("announcements.noResults.body")}</span><button className="button" type="button" onClick={resetFilters}><RotateCcw />{t("announcements.filters.reset")}</button></div> : <>
      <div className={styles.resultsSummary} aria-live="polite"><span>{t("announcements.summary.range", { from: Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredAnnouncements.length), to: Math.min(currentPage * PAGE_SIZE, filteredAnnouncements.length), total: filteredAnnouncements.length })}</span><span>{t("announcements.summary.page", { page: currentPage, pages: totalPages })}</span></div>
      <div className={styles.list}>
        {paginatedAnnouncements.map(item => { const author = personDisplay({ fullName: item.authorName, id: item.authorId, email: item.authorEmail, studentNumber: item.authorStudentNumber }, { revealIdentifier: canViewAuthorIdentifiers, locale }); return <article className={`${styles.card} ${styles[`priority_${item.priority}`]} ${item.status === "archived" ? styles.archived : ""}`} key={item.id}>
          <div className={styles.cardRail}><Megaphone /></div>
          <div className={styles.cardContent}>
            <header><div className={styles.badges}><span className={styles.priority}>{priorityLabels[item.priority]}</span><span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span></div>{canArchive && item.status !== "archived" && <button className={styles.archiveButton} type="button" onClick={() => void archive(item.id)} disabled={archivingId === item.id}><Archive />{archivingId === item.id ? t("announcements.archiving") : t("announcements.archive")}</button>}</header>
            <h3>{item.title}</h3>
            <div className={styles.body} dangerouslySetInnerHTML={{ __html: announcementDisplayHtml(item.body) }} />
            <footer>
                <span className={styles.author}><UserRound /><span><strong><PersonName person={author} /></strong><small>{item.authorPosition}</small></span></span>
              <span className={styles.date}><CalendarClock /><span><strong>{formatDate(item.publishedAt, dateLocale)}</strong>{item.expiresAt && <small>{t("announcements.visibleUntil", { date: formatDate(item.expiresAt, dateLocale) })}</small>}</span></span>
            </footer>
          </div>
        </article>; })}
      </div>
      <nav className={styles.pagination} aria-label={t("announcements.pagination.aria")}>
        <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label={t("announcements.pagination.previous")}><ChevronLeft /></button>
        <div>{pages.map(item => typeof item === "number" ? <button type="button" key={item} className={item === currentPage ? styles.activePage : ""} aria-current={item === currentPage ? "page" : undefined} aria-label={t("announcements.pagination.page", { page: item })} onClick={() => setPage(item)}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div>
        <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label={t("announcements.pagination.next")}><ChevronRight /></button>
      </nav></>}
    </section>}
  </AppShell></ModuleGuard></AuthGuard>;
}
