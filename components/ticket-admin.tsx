"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, CircleDot, LoaderCircle, MessageSquareText, Search, Ticket, Trash2, Wrench, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FilterSearch, FilterSelect } from "@/components/filter-bar";
import { AdminEmptyState, AdminPage, AdminPageHeader, AdminToolbar } from "@/components/admin-ui";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useFloatingAction } from "@/components/floating-actions";
import { FormLabel } from "@/components/form-label";
import { useI18n } from "@/components/i18n-context";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { sanitizeRichTextHtml } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import styles from "@/components/ticket-admin.module.css";

type Row = { id: string; class_id: number; request_type: string | null; description: string; status: string; response: string | null; student_name: string | null; student_number: string | null; created_by: string; created_by_name: string; created_by_email: string | null; created_by_student_number: string | null; created_at: number; execution_result: string | null };
type FilterValue = "pending" | "resolved" | "all";

const FLOATING_DELETE_ICON = <Trash2 aria-hidden="true" />;

function isPending(status: string) { return ["pending", "approved"].includes(status); }
function isResolved(status: string) { return ["executed", "rejected", "execution_error"].includes(status); }

function ticketIdFromHash() {
  const match = /^#ticket-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export function TicketAdmin() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  // The open ticket lives in #ticket-<id> so it can be linked and the back button works.
  const [openId, setOpenId] = useState<string | null>(() => typeof window === "undefined" ? null : ticketIdFromHash());

  useEffect(() => {
    const sync = () => setOpenId(ticketIdFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openTicket = (id: string | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `ticket-${id}` : "";
    window.history.pushState(null, "", url);
    setOpenId(id);
    window.scrollTo({ top: 0 });
  };

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/class-tickets", { cache: "no-store" });
      const result = await response.json() as { tickets: Row[] };
      setRows(result.tickets || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(dateLocale);
    return rows.filter((row) => {
      const matchesFilter = filter === "pending" ? isPending(row.status) : filter === "resolved" ? isResolved(row.status) : true;
      const searchable = `${row.class_id} ${row.request_type || ""} ${row.description} ${row.student_name || ""} ${row.student_number || ""} ${row.created_by_name}`.toLocaleLowerCase(dateLocale);
      return matchesFilter && (!needle || searchable.includes(needle));
    });
  }, [rows, filter, dateLocale, query]);

  const labels: Record<string, string> = {
    pending: t("classes.tickets.status.pending"), approved: t("classes.tickets.status.approved"), rejected: t("classes.tickets.status.rejected"),
    executed: t("classes.tickets.status.executed"), execution_error: t("classes.tickets.status.execution_error"),
  };
  const types: Record<string, string> = {
    reopen: t("classes.tickets.type.reopen"), add_student: t("classes.tickets.type.add_student"), remove_student: t("classes.tickets.type.remove_student"),
    replace_student: t("classes.tickets.type.replace_student"), correct_student: t("classes.tickets.type.correct_student"), other: t("classes.tickets.type.other"),
  };
  const filterOptions: Array<{ value: FilterValue; label: string }> = [
    { value: "pending", label: t("classes.tickets.pendingPlural") }, { value: "resolved", label: t("classes.tickets.resolvedPlural") }, { value: "all", label: t("classes.tickets.all") },
  ];

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const formatDate = (value: number) => new Date(value).toLocaleString(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const authorOf = (row: Row) => personDisplay({ fullName: row.created_by_name, email: row.created_by_email, studentNumber: row.created_by_student_number, id: row.created_by }, { revealIdentifier: true });
  const studentOf = (row: Row) => personDisplay({ fullName: row.student_name, studentNumber: row.student_number }, { revealIdentifier: true });
  const typeOf = (row: Row) => types[row.request_type || "other"] || t("classes.tickets.defaultType");

  async function save(row: Row) {
    setSaving(row.id);
    const response = await fetch("/api/admin/class-tickets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, status: row.status, response: sanitizeRichTextHtml(row.response || "") }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? t("classes.tickets.saved") : result.error || t("classes.tickets.updateError"));
    setSaving(null);
    if (response.ok) void load();
  }

  async function remove(row: Row) {
    setSaving(row.id);
    const response = await fetch("/api/admin/class-tickets", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? t("classes.tickets.deleted") : result.error || t("classes.tickets.deleteError"));
    setSaving(null);
    setDeleteTarget(null);
    if (response.ok) {
      if (ticketIdFromHash() === row.id) openTicket(null);
      void load();
    }
  }

  const openItem = openId ? rows.find((row) => row.id === openId) ?? null : null;
  useFloatingAction(openItem && saving !== openItem.id ? { id: "delete-ticket", label: t("classes.tickets.delete"), icon: FLOATING_DELETE_ICON, onClick: () => setDeleteTarget(openItem) } : null);

  const skeleton = (count: number) => <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("classes.tickets.loading")}</span>{Array.from({ length: count }, (_, index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div>;
  const terminal = openItem ? ["executed", "rejected"].includes(openItem.status) : false;

  return <AuthGuard requireAdmin><AppShell active="tickets" breadcrumb={t("classes.tickets.breadcrumb")}><AdminPage>
    <AdminPageHeader icon={<Ticket />} eyebrow={t("classes.tickets.eyebrow")} title={t("classes.tickets.title")} />
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {!openId && <section className={`panel ${styles.listPanel}`} aria-label={t("classes.tickets.listTitle")} aria-busy={loading}>
      <AdminToolbar label={t("classes.tickets.filter")}>
        <FilterSearch label={t("classes.tickets.search")} value={query} onChange={setQuery} placeholder={t("classes.tickets.searchPlaceholder")} />
        <FilterSelect label={t("classes.tickets.filter")} value={filter} onChange={(value) => setFilter(value as FilterValue)} defaultValue="pending" options={filterOptions.map((option) => ({ value: option.value, label: option.label }))} />
      </AdminToolbar>
      {loading ? skeleton(3) : visible.length === 0 ? <AdminEmptyState icon={<Ticket />} title={query ? t("classes.tickets.noSearch") : filter === "pending" ? t("classes.tickets.noPending") : t("classes.tickets.noFilter")} /> : <ul className={styles.rows}>{visible.map((row) => {
        const author = authorOf(row);
        return <li className={styles.row} key={row.id} data-status={row.status}>
          <span className={styles.statusDot} aria-hidden="true" />
          <div className={styles.rowMain}>
            <h3><a className={`link-quiet ${styles.titleLink}`} href={`#ticket-${encodeURIComponent(row.id)}`} onClick={(event) => { event.preventDefault(); openTicket(row.id); }}>{row.student_name ? <PersonName person={studentOf(row)} /> : <>{t("classes.tickets.submittedBy", { name: "" })}<PersonName person={author} /></>}</a></h3>
            <p className={styles.rowMeta}>{typeOf(row)} · {t("classes.common.class", { number: row.class_id })} · <PersonName person={author} /> · {formatDate(row.created_at)}</p>
          </div>
          <span className={styles.statusPill}>{labels[row.status] || row.status}</span>
        </li>;
      })}</ul>}
    </section>}
    {openId && <>
      <button className={styles.back} type="button" onClick={() => openTicket(null)}><ChevronLeft aria-hidden="true" />{t("classes.tickets.back")}</button>
      <article className={`panel ${styles.reading}`} data-status={openItem?.status} aria-busy={loading}>
        {loading ? skeleton(2) : !openItem ? <AdminEmptyState icon={<Search />} title={t("classes.tickets.noFilter")} /> : <>
          <header className={styles.byline}>
            <div>
              <p className={styles.bylineName}><PersonName person={authorOf(openItem)} /></p>
              <p className={styles.bylineMeta}>{typeOf(openItem)} · {t("classes.common.class", { number: openItem.class_id })} · {formatDate(openItem.created_at)}</p>
            </div>
            <span className={styles.statusPill}>{labels[openItem.status] || openItem.status}</span>
          </header>
          <h2 className={styles.readingTitle}>{openItem.student_name ? <PersonName person={studentOf(openItem)} /> : typeOf(openItem)}</h2>
          <span className={styles.readingRule} aria-hidden="true" />
          <RichTextContent value={openItem.description} className={styles.readingBody} />
          {openItem.execution_result && <p className={styles.execution}><Wrench aria-hidden="true" />{openItem.execution_result}</p>}
          <footer className={styles.manageArea}>
            <div className={styles.manageFields}>
              <label><FormLabel icon={CircleDot}>{t("classes.tickets.decisionStatus")}</FormLabel><select value={openItem.status} disabled={terminal} onChange={(event) => update(openItem.id, { status: event.target.value })}><option value="pending">{t("classes.tickets.status.pending")}</option><option value="approved">{t("classes.tickets.approveExecute")}</option><option value="rejected">{t("classes.tickets.reject")}</option>{["executed", "execution_error"].includes(openItem.status) && <option value={openItem.status}>{labels[openItem.status]}</option>}</select></label>
            </div>
            <label className={styles.reasoning}><FormLabel icon={MessageSquareText}>{t("classes.tickets.reasoning")}</FormLabel><RichTextEditor value={openItem.response || ""} onChange={(response) => update(openItem.id, { response })} ariaLabel={t("classes.tickets.reasoningAria", { name: openItem.student_name ? studentOf(openItem).name : authorOf(openItem).name })} placeholder={t("classes.tickets.reasoningPlaceholder")} maxLength={5000} minHeight="compact" disabled={terminal} onInvalidLink={() => setNotice(t("classes.tickets.invalidLink"))} /></label>
            <div className={styles.manageActions}><button className="button button--primary button--compact" type="button" disabled={saving === openItem.id || terminal} onClick={() => { if (openItem.status === "rejected") setRejectTarget(openItem); else void save(openItem); }}>{saving === openItem.id ? <LoaderCircle className="spin" /> : <Check />}{t("classes.tickets.save")}</button></div>
          </footer>
        </>}
      </article>
    </>}
    <ConfirmationDialog open={Boolean(deleteTarget)} eyebrow={t("classes.tickets.eyebrow")} title={locale === "en" ? "Delete this request?" : "Eliminar este pedido?"} description={t("classes.tickets.deleteConfirm")} subject={deleteTarget?.student_name || deleteTarget?.created_by_name} subjectLabel={locale === "en" ? "Request concerning" : "Pedido relativo a"} warning={locale === "en" ? "The request and its administrative history will be permanently removed." : "O pedido e o respetivo histórico administrativo serão removidos definitivamente."} confirmLabel={locale === "en" ? "Delete request" : "Eliminar pedido"} cancelLabel={locale === "en" ? "Cancel" : "Cancelar"} busy={Boolean(deleteTarget && saving === deleteTarget.id)} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void remove(deleteTarget); }} />
    <ConfirmationDialog open={Boolean(rejectTarget)} eyebrow="" title={t("classes.tickets.rejectTitle")} description="" subject={rejectTarget?.student_name || rejectTarget?.created_by_name} subjectLabel={locale === "en" ? "Request concerning" : "Pedido relativo a"} confirmLabel={t("classes.tickets.reject")} cancelLabel={locale === "en" ? "Cancel" : "Cancelar"} icon={<X />} onClose={() => setRejectTarget(null)} onConfirm={() => { if (rejectTarget) { const target = rejectTarget; setRejectTarget(null); void save(target); } }} />
  </AdminPage></AppShell></AuthGuard>;
}
