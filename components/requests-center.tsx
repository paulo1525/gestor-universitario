"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlignLeft, CheckCircle2, ChevronLeft, Eye, EyeOff, GraduationCap, Inbox, LockKeyhole, MessageCircle, MessageSquareText, Search, Tags, Trash2, UserRound, ShieldAlert, Pencil } from "lucide-react";
import { AnnouncementComments } from "@/components/announcement-comments";
import { AppShell } from "@/components/app-shell";
import { clampPage, Pagination } from "@/components/pagination";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { CancelButton, FormActions, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { SurfaceHeader } from "@/components/surface-header";
import { AppToast, ToastKind } from "@/components/app-toast";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { PersonName } from "@/components/person-name";
import { useModuleEnabled } from "@/components/use-module-enabled";
import { useScrollLock } from "@/components/use-scroll-lock";
import { useEscapeKey } from "@/components/use-escape-key";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import styles from "@/components/requests-center.module.css";
import { useFloatingAction } from "@/components/floating-actions";

const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;
const PAGE_SIZE = 8;
const FLOATING_DELETE_ICON = <Trash2 aria-hidden="true" />;
const FLOATING_REVEAL_ICON = <ShieldAlert aria-hidden="true" />;

function requestIdFromHash() {
  const match = /^#pedido-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

type DateInput = string | number;
type RequestItem = { id: string; subject: string; message: string; category: string; status: string; anonymous: boolean; authorName: string; authorId: string; authorEmail: string; authorStudentNumber: string; unitId: string; unitName: string; response: string; responseVisibility: string; createdAt: DateInput; isOwn: boolean; canRevealIdentity?: boolean; commentCount: number };
type Unit = { id: string; code: string; name: string };
type Notice = { kind: ToastKind; message: string } | null;
function first(raw: Record<string, unknown>, ...keys: string[]) { for (const key of keys) if (raw[key] != null) return raw[key]; return undefined; }
function dateInput(raw: unknown): DateInput { return typeof raw === "number" ? raw : String(raw || new Date().toISOString()); }
function formatCreatedAt(value: DateInput, locale: string, unknownDate: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? unknownDate : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date); }
function normalise(raw: Record<string, unknown>, anonymousAuthor: string, studentAuthor: string, fallbackSubject: string): RequestItem { const unit = (raw.unit && typeof raw.unit === "object" ? raw.unit : {}) as Record<string, unknown>; const submitter = (raw.submitter && typeof raw.submitter === "object" ? raw.submitter : {}) as Record<string, unknown>; const anonymous = Boolean(first(raw, "anonymous", "isAnonymous", "is_anonymous")); return { id: String(raw.id), subject: String(first(raw, "subject", "title") || fallbackSubject), message: String(first(raw, "message", "body", "content") || ""), category: String(raw.category || "other"), status: String(raw.status || "received"), anonymous, authorName: anonymous ? anonymousAuthor : String(first(raw, "authorName", "author_name") ?? first(submitter, "fullName", "full_name") ?? studentAuthor), authorId: String(first(submitter, "id") ?? ""), authorEmail: String(first(submitter, "email") ?? ""), authorStudentNumber: String(first(submitter, "studentNumber", "student_number") ?? ""), unitId: String(first(raw, "unitId", "unit_id") ?? unit.id ?? ""), unitName: String(first(raw, "unitName", "unit_name") ?? unit.name ?? ""), response: String(first(raw, "response", "publicResponse", "public_response") || ""), responseVisibility: String(first(raw, "responseVisibility", "response_visibility") || "private"), createdAt: dateInput(first(raw, "createdAt", "created_at")), isOwn: Boolean(first(raw, "isOwn", "is_own")), canRevealIdentity: Boolean(raw.canRevealIdentity), commentCount: Number(first(raw, "commentCount", "comment_count") ?? 0) }; }

export function RequestsCenter() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const categories = useMemo<Record<string, string>>(() => ({ suggestion: t("requests.category.suggestion"), question: t("requests.category.question"), problem: t("requests.category.problem"), curricular_unit: t("requests.category.curricularUnit"), facilities: t("requests.category.facilities"), academic: t("requests.category.academic"), other: t("requests.category.other") }), [t]);
  const statuses = useMemo<Record<string, string>>(() => ({ received: t("requests.status.received"), reviewing: t("requests.status.reviewing"), forwarded: t("requests.status.forwarded"), resolved: t("requests.status.resolved"), closed: t("requests.status.closed") }), [t]);
  const { user } = useAuth(); const managementEnabled = useModuleEnabled("requests.management"); const canManage = managementEnabled && (user?.role === "admin" || Boolean(user?.commissionPosition));
  const [requests, setRequests] = useState<RequestItem[]>([]); const [units, setUnits] = useState<Unit[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState<Notice>(null);
  const [statusFilter, setStatusFilter] = useState("all"); const [categoryFilter, setCategoryFilter] = useState("all"); const [searchQuery, setSearchQuery] = useState(""); const [page, setPage] = useState(1); const [responseVisibility, setResponseVisibility] = useState<Record<string, string>>({}); const [updatingId, setUpdatingId] = useState<string | null>(null); const [revealingId, setRevealingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  // The open request lives in #pedido-<id> so it can be linked and the back button works.
  const [openId, setOpenId] = useState<string | null>(() => typeof window === "undefined" ? null : requestIdFromHash());
  useEffect(() => {
    const sync = () => setOpenId(requestIdFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const openRequest = (id: string | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `pedido-${id}` : "";
    window.history.pushState(null, "", url);
    setOpenId(id);
    window.scrollTo({ top: 0 });
  };
  const [deleteTarget, setDeleteTarget] = useState<RequestItem | null>(null); const [deletingId, setDeletingId] = useState<string | null>(null); const [deleteError, setDeleteError] = useState("");
  useScrollLock(Boolean(deleteTarget));
  useEscapeKey(Boolean(deleteTarget), () => { if (!deletingId) setDeleteTarget(null); });
  const [form, setForm] = useState({ subject: "", message: "", category: "suggestion", unitId: "", anonymous: false, responseVisibility: "private" });
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch(canManage ? "/api/requests?scope=management" : "/api/requests", { cache: "no-store" }); const data = await response.json() as { requests?: Record<string, unknown>[]; units?: Record<string, unknown>[]; curricularUnits?: Record<string, unknown>[]; error?: string }; if (!response.ok) throw new Error(data.error || t("requests.loadError")); const items = (data.requests || []).map(raw => normalise(raw, t("requests.anonymousAuthor"), t("requests.studentAuthor"), t("requests.fallbackSubject"))); setRequests(items); setUnits((data.units || data.curricularUnits || []).map(raw => ({ id: String(raw.id), code: String(raw.code || ""), name: String(raw.name || "") }))); setResponseVisibility(Object.fromEntries(items.map(item => [item.id, item.responseVisibility]))); } catch (error) { setNotice({ kind: "error", message: error instanceof Error ? error.message : t("requests.loadError") }); } finally { setLoading(false); } }, [canManage, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase(dateLocale);
    return requests
      .filter(item => (statusFilter === "all" || item.status === statusFilter) && (categoryFilter === "all" || item.category === categoryFilter))
      .filter(item => !query || [item.subject, richTextPlainText(item.message), item.unitName, item.anonymous ? "" : item.authorName].join(" ").toLocaleLowerCase(dateLocale).includes(query))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [categoryFilter, dateLocale, requests, searchQuery, statusFilter]);
  const currentPage = clampPage(page, visible.length, PAGE_SIZE);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const openItem = openId ? requests.find(item => item.id === openId) ?? null : null;
  const authorOf = (item: RequestItem) => personDisplay({ fullName: item.authorName, id: item.authorId, email: item.authorEmail, studentNumber: item.authorStudentNumber, anonymous: item.anonymous, anonymousLabel: t("requests.anonymousSubmission") }, { revealIdentifier: canManage, locale });
  const messageLength = richTextPlainText(form.message).length;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (messageLength < 20 || messageLength > 5000) { setNotice({ kind: "warning", message: messageLength < 20 ? t("requests.messageTooShort") : t("requests.messageTooLong") }); return; } setSaving(true); try { const response = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, message: sanitizeRichTextHtml(form.message), unitId: form.unitId || null }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || t("requests.sendError")); setForm({ subject: "", message: "", category: "suggestion", unitId: "", anonymous: false, responseVisibility: "private" }); setComposerOpen(false); setNotice({ kind: "success", message: t("requests.sendSuccess") }); await load(); } catch (error) { setNotice({ kind: "error", message: error instanceof Error ? error.message : t("requests.sendError") }); } finally { setSaving(false); } };
  const update = async (id: string, status: string, visibility: string) => { setUpdatingId(id); try { const response = await fetch("/api/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, responseVisibility: visibility }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || t("requests.updateError")); setNotice({ kind: "success", message: t("requests.updateSuccess") }); await load(); } catch (error) { setNotice({ kind: "error", message: error instanceof Error ? error.message : t("requests.updateError") }); } finally { setUpdatingId(null); } };
  const reveal = async (item: RequestItem) => { const reason = window.prompt(t("requests.revealReason"), ""); if (!reason || reason.trim().length < 10) return; setRevealingId(item.id); try { const response = await fetch("/api/requests/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, reason: reason.trim() }) }); const data = await response.json() as { error?: string; identity?: { fullName?: string; email?: string; studentNumber?: string } }; if (!response.ok) throw new Error(data.error || t("requests.updateError")); setNotice({ kind: "success", message: `${data.identity?.fullName || t("requests.anonymousSubmission")} · ${data.identity?.email || ""}` }); } catch (error) { setNotice({ kind: "error", message: error instanceof Error ? error.message : t("requests.updateError") }); } finally { setRevealingId(null); } };
  const remove = async () => { if (!deleteTarget) return; setDeletingId(deleteTarget.id); setDeleteError(""); try { const response = await fetch(`/api/requests?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || t("requests.deleteError")); const deletedId = deleteTarget.id; setDeleteTarget(null); if (requestIdFromHash() === deletedId) openRequest(null); setNotice({ kind: "success", message: t("requests.deleteSuccess") }); await load(); } catch (error) { setDeleteError(error instanceof Error ? error.message : t("requests.deleteError")); } finally { setDeletingId(null); } };
  useFloatingAction(!composerOpen && !openId ? { id: "new-request", label: t("requests.new"), icon: FLOATING_CREATE_ICON, onClick: () => setComposerOpen(true) } : null);
  // On an open request its own actions live in the floating menu.
  const deletable = !composerOpen && openItem && (canManage || openItem.isOwn) ? openItem : null;
  const revealable = !composerOpen && openItem && openItem.anonymous && openItem.canRevealIdentity && revealingId !== openItem.id ? openItem : null;
  useFloatingAction(deletable ? { id: "delete-request", label: t("requests.delete"), icon: FLOATING_DELETE_ICON, onClick: () => { setDeleteError(""); setDeleteTarget(deletable); } } : null);
  useFloatingAction(revealable ? { id: "reveal-request", label: t("requests.revealIdentity"), icon: FLOATING_REVEAL_ICON, onClick: () => void reveal(revealable) } : null);

  return <AuthGuard><ModuleGuard moduleKey="requests.submission"><AppShell active="requests" breadcrumb={t("requests.title")}>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <SurfaceHeader standalone headingLevel="h1" icon={<Inbox />} eyebrow={t("requests.eyebrow")} title={t("requests.title")} />
    <div className={styles.splitLayout}>
      {composerOpen && <form id="request-composer" className={`${styles.panel} ${styles.form}`} onSubmit={submit}><SurfaceHeader icon={<Inbox />} title={t("requests.form.title")} actions={<FormCloseButton onClick={() => setComposerOpen(false)} label={t("common.close")} disabled={saving} />} /><div className={styles.formGrid}>
        <label className={styles.full}><FormLabel icon={MessageSquareText}>{t("requests.form.subject")}</FormLabel><input required maxLength={160} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder={t("requests.form.subjectPlaceholder")} /></label>
        <label><FormLabel icon={Tags}>{t("requests.form.category")}</FormLabel><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label><FormLabel icon={GraduationCap} optional>{t("requests.form.unit")}</FormLabel><select value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })}><option value="">{t("requests.form.general")}</option>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
        <label className={styles.full}><FormLabel icon={AlignLeft}>{t("requests.form.message")}</FormLabel><RichTextEditor value={form.message} onChange={(message) => setForm((current) => ({ ...current, message }))} ariaLabel={t("requests.form.messageAria")} placeholder={t("requests.form.messagePlaceholder")} maxLength={5000} minHeight="minimal" onInvalidLink={() => setNotice({ kind: "warning", message: t("requests.invalidLink") })} /></label>
        <fieldset className={styles.privacyOptions}><legend><FormLabel icon={UserRound}>{t("requests.form.privacy")}</FormLabel></legend><label className={!form.anonymous ? styles.optionSelected : ""}><input type="radio" name="identity" checked={!form.anonymous} onChange={() => setForm({ ...form, anonymous: false })} /><UserRound /><span><strong>{t("requests.form.identified")}</strong><small>{t("requests.form.identifiedHelp")}</small></span></label><label className={form.anonymous ? styles.optionSelected : ""}><input type="radio" name="identity" checked={form.anonymous} onChange={() => setForm({ ...form, anonymous: true })} /><EyeOff /><span><strong>{t("requests.form.anonymous")}</strong><small>{t("requests.form.anonymousHelp")}</small></span></label></fieldset>
        <fieldset className={styles.privacyOptions}><legend><FormLabel icon={Eye}>{t("requests.form.responseVisibility")}</FormLabel></legend><label className={form.responseVisibility === "private" ? styles.optionSelected : ""}><input type="radio" name="answer" checked={form.responseVisibility === "private"} onChange={() => setForm({ ...form, responseVisibility: "private" })} /><LockKeyhole /><span><strong>{t("requests.form.private")}</strong><small>{t("requests.form.privateHelp")}</small></span></label><label className={form.responseVisibility === "public" ? styles.optionSelected : ""}><input type="radio" name="answer" checked={form.responseVisibility === "public"} onChange={() => setForm({ ...form, responseVisibility: "public" })} /><Eye /><span><strong>{t("requests.form.public")}</strong><small>{t("requests.form.publicHelp")}</small></span></label></fieldset>
      </div><FormActions><CancelButton onClick={() => setComposerOpen(false)} disabled={saving}>{t("requests.form.cancel")}</CancelButton><SubmitButton busy={saving} disabled={messageLength < 20 || messageLength > 5000}>{saving ? t("requests.form.sending") : form.anonymous ? t("requests.form.sendAnonymous") : t("requests.form.send")}</SubmitButton></FormActions></form>}
      {!composerOpen && !openId && <section className={`${styles.panel} ${styles.listPanel}`} aria-busy={loading}><FilterBar label={t("requests.list.filterAria")}><FilterSearch label={t("requests.search")} value={searchQuery} onChange={value => { setSearchQuery(value); setPage(1); }} placeholder={t("requests.search")} /><FilterSelect label={t("requests.list.filterAria")} value={statusFilter} onChange={value => { setStatusFilter(value); setPage(1); }} options={[{ value: "all", label: t("requests.list.allStatuses") }, ...Object.entries(statuses).map(([key, label]) => ({ value: key, label }))]} /><FilterSelect label={t("requests.list.filterCategory")} value={categoryFilter} onChange={value => { setCategoryFilter(value); setPage(1); }} options={[{ value: "all", label: t("requests.list.allCategories") }, ...Object.entries(categories).map(([key, label]) => ({ value: key, label }))]} /></FilterBar>
        {loading ? <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("requests.loading")}</span>{[0, 1, 2].map(index => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div> : visible.length === 0 ? <div className={styles.empty}><CheckCircle2 /><strong>{t("requests.empty.title")}</strong></div> : <><ul className={styles.rows}>{pageItems.map(item => <li className={styles.row} key={item.id} data-status={item.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div className={styles.rowMain}>
            <h3><a className={`link-quiet ${styles.titleLink}`} href={`#pedido-${encodeURIComponent(item.id)}`} onClick={event => { event.preventDefault(); openRequest(item.id); }}>{item.subject}</a></h3>
            <p className={styles.rowMeta}>{categories[item.category] || item.category} · {item.anonymous ? t("requests.anonymousSubmission") : <PersonName person={authorOf(item)} />}{item.unitName && ` · ${item.unitName}`} · {formatCreatedAt(item.createdAt, dateLocale, t("requests.dateUnknown"))}{item.commentCount > 0 && <span className={styles.answeredFlag}><MessageCircle aria-hidden="true" />{item.commentCount}</span>}</p>
          </div>
          <span className={styles.statusPill}>{statuses[item.status] || item.status}</span>
        </li>)}</ul><Pagination page={currentPage} totalItems={visible.length} pageSize={PAGE_SIZE} onChange={setPage} /></>}
      </section>}
      {!composerOpen && openId && <>
        <button className={styles.back} type="button" onClick={() => openRequest(null)}><ChevronLeft aria-hidden="true" />{t("requests.back")}</button>
        <article className={`panel ${styles.reading}`} data-status={openItem?.status} aria-busy={loading}>
          {loading ? <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("requests.loading")}</span>{[0, 1].map(index => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div> : !openItem ? <div className={styles.empty}><Search /><strong>{t("requests.empty.title")}</strong></div> : <>
            <header className={styles.byline}>
              <span className={`${styles.avatar} ${openItem.anonymous ? styles.avatarAnonymous : ""}`} aria-hidden="true">{openItem.anonymous ? <EyeOff /> : initials(openItem.authorName)}</span>
              <div>
                <p className={styles.bylineName}>{openItem.anonymous ? t("requests.anonymousSubmission") : <PersonName person={authorOf(openItem)} />}</p>
                <p className={styles.bylineMeta}>{categories[openItem.category] || openItem.category}{openItem.unitName && ` · ${openItem.unitName}`} · {formatCreatedAt(openItem.createdAt, dateLocale, t("requests.dateUnknown"))}</p>
              </div>
              <span className={styles.statusPill}>{statuses[openItem.status] || openItem.status}</span>
              {openItem.responseVisibility === "private" && <span className={styles.privateFlag}><LockKeyhole aria-hidden="true" />{t("requests.privateResponse")}</span>}
            </header>
            <h2 className={styles.readingTitle}>{openItem.subject}</h2>
            <span className={styles.readingRule} aria-hidden="true" />
            <RichTextContent value={openItem.message} className={styles.readingBody} />
            <footer className={styles.manageArea}>
              {canManage && <div className={styles.manageFields}>
                <label><span>{t("requests.management.status")}</span><select value={openItem.status} onChange={e => void update(openItem.id, e.target.value, responseVisibility[openItem.id] || "private")} disabled={updatingId === openItem.id}>{Object.entries(statuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                <label><span>{t("requests.management.visibility")}</span><select value={responseVisibility[openItem.id] || "private"} onChange={e => { setResponseVisibility({ ...responseVisibility, [openItem.id]: e.target.value }); void update(openItem.id, openItem.status, e.target.value); }} disabled={updatingId === openItem.id}><option value="private">{t("requests.management.private")}</option><option value="public">{t("requests.management.public")}</option></select></label>
              </div>}
              <AnnouncementComments announcementId={openItem.id} endpoint="/api/requests/comments" targetParam="requestId" maxLength={2000} revealIdentifiers={false} onCountChange={count => setRequests(current => current.map(item => item.id === openItem.id && item.commentCount !== count ? { ...item, commentCount: count } : item))} />
            </footer>
          </>}
        </article>
      </>}
    </div>
    <ConfirmationDialog
      open={Boolean(deleteTarget)}
      eyebrow={t("requests.delete.eyebrow")}
      title={t("requests.delete.title")}
      description={t("requests.delete.intro")}
      subject={deleteTarget?.subject}
      subjectLabel={t("requests.delete.selected")}
      warning={deleteError || t("requests.delete.warning")}
      confirmLabel={t(deletingId ? "requests.delete.deleting" : "requests.delete.confirm")}
      cancelLabel={t("requests.delete.cancel")}
      busy={Boolean(deletingId)}
      onClose={() => { if (!deletingId) setDeleteTarget(null); }}
      onConfirm={() => void remove()}
    />
  </AppShell></ModuleGuard></AuthGuard>;
}
