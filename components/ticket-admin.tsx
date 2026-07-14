/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CircleDot, Filter, LoaderCircle, MessageSquareText, Search, Ticket, Trash2, UserRound, Wrench } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { useI18n } from "@/components/i18n-context";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { sanitizeRichTextHtml } from "@/lib/announcement-content";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import styles from "@/components/ticket-admin.module.css";

type Row = { id: string; class_id: number; request_type: string | null; description: string; status: string; response: string | null; student_name: string | null; student_number: string | null; created_by: string; created_by_name: string; created_by_email: string | null; created_by_student_number: string | null; created_at: number; execution_result: string | null };
type FilterValue = "pending" | "resolved" | "all";

function isPending(status: string) { return ["pending", "approved"].includes(status); }
function isResolved(status: string) { return ["executed", "rejected", "execution_error"].includes(status); }
function statusStyle(status: string) {
  if (status === "pending") return styles.statusPending;
  if (status === "approved") return styles.statusApproved;
  if (status === "executed") return styles.statusExecuted;
  if (status === "execution_error") return styles.statusExecutionError;
  return styles.statusRejected;
}

export function TicketAdmin() {
  const { locale, t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/class-tickets", { cache: "no-store" });
    const result = await response.json() as { tickets: Row[] };
    setRows(result.tickets || []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((row) => isPending(row.status)).length,
    resolved: rows.filter((row) => isResolved(row.status)).length,
  }), [rows]);

  const visible = useMemo(() => {
    const localeCode = locale === "en" ? "en-GB" : "pt-PT";
    const needle = query.trim().toLocaleLowerCase(localeCode);
    return rows.filter((row) => {
      const matchesFilter = filter === "pending" ? isPending(row.status) : filter === "resolved" ? isResolved(row.status) : true;
      const searchable = `${row.class_id} ${row.request_type || ""} ${row.description} ${row.student_name || ""} ${row.student_number || ""} ${row.created_by_name}`.toLocaleLowerCase(localeCode);
      return matchesFilter && (!needle || searchable.includes(needle));
    });
  }, [rows, filter, locale, query]);

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

  async function save(row: Row) {
    setSaving(row.id);
    const response = await fetch("/api/admin/class-tickets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, status: row.status, response: sanitizeRichTextHtml(row.response || "") }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? t("classes.tickets.saved") : result.error || t("classes.tickets.updateError"));
    setSaving(null);
    if (response.ok) void load();
  }

  async function remove(row: Row) {
    if (!window.confirm(t("classes.tickets.deleteConfirm"))) return;
    setSaving(row.id);
    const response = await fetch("/api/admin/class-tickets", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? t("classes.tickets.deleted") : result.error || t("classes.tickets.deleteError"));
    setSaving(null);
    if (response.ok) void load();
  }

  return <AuthGuard requireAdmin><AppShell active="tickets" breadcrumb={t("classes.tickets.breadcrumb")}>
    <section className="admin-heading"><div><span className="eyebrow">{t("classes.tickets.eyebrow")}</span><h1>{t("classes.tickets.title")}</h1><p>{t("classes.tickets.description")}</p></div></section>
    <section className={`panel ${styles.panel}`}>
      <header className={styles.panelHeader}>
        <div className={styles.heading}><span className={styles.headingIcon}><Ticket /></span><div><h2>{t("classes.tickets.listTitle")}</h2><p>{t("classes.tickets.listDescription")}</p></div></div>
        <div className={styles.controls}>
          <label className={styles.search}><Search /><span className="sr-only">{t("classes.tickets.search")}</span><input type="search" aria-label={t("classes.tickets.search")} placeholder={t("classes.tickets.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className={styles.filter}><Filter /><span className="sr-only">{t("classes.tickets.filter")}</span><select aria-label={t("classes.tickets.filter")} value={filter} onChange={(event) => setFilter(event.target.value as FilterValue)}>{filterOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        </div>
      </header>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className={styles.summary} aria-live="polite"><span>{t("classes.tickets.visibleSummary", { visible: visible.length, total: counts.all })}</span><span>{t("classes.tickets.statusSummary", { pending: counts.pending, resolved: counts.resolved })}</span></div>
      <div className={styles.list}>{visible.map((row) => {
        const expanded = expandedId === row.id;
        const terminal = ["executed", "rejected"].includes(row.status);
        const author = personDisplay({ fullName: row.created_by_name, email: row.created_by_email, studentNumber: row.created_by_student_number, id: row.created_by }, { revealIdentifier: true });
        const student = personDisplay({ fullName: row.student_name, studentNumber: row.student_number }, { revealIdentifier: true });
        return <article key={row.id} className={`${styles.card} ${expanded ? styles.expanded : ""}`}>
          <header className={styles.cardHeader}>
            <div className={styles.cardIdentity}>
              <div className={styles.badges}><span className={styles.typeBadge}><Ticket />{types[row.request_type || "other"] || t("classes.tickets.defaultType")}</span><span className={`${styles.status} ${statusStyle(row.status)}`}>{labels[row.status] || row.status}</span></div>
              <h3>{row.student_name ? <PersonName person={student} /> : <>{t("classes.tickets.submittedBy", { name: "" })}<PersonName person={author} /></>}</h3>
              <div className={styles.cardMeta}><span><UserRound /><PersonName person={author} /></span><time>{new Date(row.created_at).toLocaleString(locale === "en" ? "en-GB" : "pt-PT", { dateStyle: "medium", timeStyle: "short" })}</time></div>
            </div>
            <button className={styles.expand} type="button" aria-expanded={expanded} aria-controls={`ticket-${row.id}`} onClick={() => setExpandedId((current) => current === row.id ? null : row.id)}>{expanded ? t("classes.tickets.hideDetails") : t("classes.tickets.analyse")}<ChevronDown /></button>
          </header>
          {expanded && <div className={styles.details} id={`ticket-${row.id}`}>
            <div className={styles.request}>
              <section className={styles.requestBody}><span>{t("classes.tickets.requestDescription")}</span><RichTextContent value={row.description} className={styles.requestText} /></section>
              <details className={styles.secondary}><summary><Wrench />{t("classes.tickets.adminContext")}</summary><div className={styles.secondaryGrid}>
                <div><span>{t("classes.common.class", { number: "" }).trim()}</span><strong>{t("classes.common.class", { number: row.class_id })}</strong></div>
                <div><span>{t("classes.tickets.submittedByLabel")}</span><strong><PersonName person={author} /></strong></div>
                <div><span>{t("classes.tickets.targetStudent")}</span><strong>{row.student_name ? <PersonName person={student} /> : t("classes.tickets.notProvided")}</strong></div>
                {row.execution_result && <div className={styles.execution}><span>{t("classes.tickets.executionResult")}</span><p>{row.execution_result}</p></div>}
              </div></details>
            </div>
            <div className={styles.decision}>
              <label><FormLabel icon={CircleDot}>{t("classes.tickets.decisionStatus")}</FormLabel><select value={row.status} disabled={terminal} onChange={(event) => update(row.id, { status: event.target.value })}><option value="pending">{t("classes.tickets.status.pending")}</option><option value="approved">{t("classes.tickets.approveExecute")}</option><option value="rejected">{t("classes.tickets.reject")}</option>{["executed", "execution_error"].includes(row.status) && <option value={row.status}>{labels[row.status]}</option>}</select></label>
              <label><FormLabel icon={MessageSquareText}>{t("classes.tickets.reasoning")}</FormLabel><RichTextEditor value={row.response || ""} onChange={(response) => update(row.id, { response })} ariaLabel={t("classes.tickets.reasoningAria", { name: row.student_name ? student.name : author.name })} placeholder={t("classes.tickets.reasoningPlaceholder")} maxLength={5000} minHeight="compact" disabled={terminal} onInvalidLink={() => setNotice(t("classes.tickets.invalidLink"))} /></label>
              <footer className={styles.actions}><button className="button button--secondary button--danger" disabled={saving === row.id} onClick={() => void remove(row)}><Trash2 />{t("classes.tickets.delete")}</button><button className="button button--primary" disabled={saving === row.id || terminal} onClick={() => void save(row)}>{saving === row.id ? <LoaderCircle className="spin" /> : <Check />}{t("classes.tickets.save")}</button></footer>
            </div>
          </div>}
        </article>;
      })}{!visible.length && <div className={styles.empty}><Ticket size={30} /><strong>{query ? t("classes.tickets.noSearch") : filter === "pending" ? t("classes.tickets.noPending") : t("classes.tickets.noFilter")}</strong><span>{query ? t("classes.tickets.searchHint") : t("classes.tickets.emptyHint")}</span></div>}</div>
    </section>
  </AppShell></AuthGuard>;
}
