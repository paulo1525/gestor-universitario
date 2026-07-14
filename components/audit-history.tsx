"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Search, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useI18n } from "@/components/i18n-context";
import { APP_MODULES } from "@/lib/app-modules";
import { adminDataLabel } from "@/lib/i18n-admin";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";

type Action = { id: string | number; action: string; details: string | null; created_at: number; actor_id?: string; actor_name: string; actor_email?: string; actor_student_number?: string; class_id: number | null };
type DetailRow = { label: string; value: string };

const moduleLabels = Object.fromEntries(APP_MODULES.map(module => [module.key, module.label]));
const PAGE_SIZE = 10;

type AuditCopy = { noValue: string; noItems: string; noData: string; enabled: string; disabled: string; yes: string; no: string; registeredInformation: string };
type AppLocale = "pt-PT" | "en";

function classLabel(number: string | number, locale: AppLocale): string {
  return locale === "en" ? `Class ${number}` : `Turma ${number}`;
}

function humaniseKey(key: string, locale: AppLocale): string {
  if (/^\d+$/.test(key)) return classLabel(key, locale);
  return adminDataLabel(locale, "detail", key) || key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, character => character.toLocaleUpperCase(locale === "en" ? "en-GB" : "pt-PT"));
}

function actionLabel(action: string, locale: AppLocale): string {
  return adminDataLabel(locale, "action", action) || humaniseKey(action, locale);
}

function isDateKey(key: string): boolean {
  return /(?:At|Until)$/.test(key) || ["expires_at", "starts_at", "ends_at", "created_at", "updated_at"].includes(key);
}

function formatPrimitive(value: unknown, key: string, locale: AppLocale, copy: AuditCopy): string {
  if (value === null || value === undefined || value === "") return copy.noValue;
  if (typeof value === "boolean") {
    if (key === "enabled") return value ? copy.enabled : copy.disabled;
    return value ? copy.yes : copy.no;
  }
  if (isDateKey(key) && (typeof value === "number" || typeof value === "string")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString(locale === "en" ? "en-GB" : "pt-PT");
  }
  if (["classId", "previousClass", "destinationClass", "representedClass"].includes(key) && Number.isFinite(Number(value))) return classLabel(String(value), locale);
  const text = String(value);
  return adminDataLabel(locale, "module", text) || (locale === "pt-PT" ? moduleLabels[text] : undefined) || adminDataLabel(locale, "value", text) || text;
}

function flattenDetails(value: unknown, rows: DetailRow[], locale: AppLocale, copy: AuditCopy, path: string[] = [], key = "information"): void {
  const keyLabel = key ? humaniseKey(key, locale) : "";
  const label = [...path, keyLabel].filter(Boolean).join(" · ");
  if (Array.isArray(value)) {
    if (!value.length) {
      rows.push({ label, value: copy.noItems });
      return;
    }
    if (value.every(item => item === null || typeof item !== "object")) {
      rows.push({ label, value: value.map(item => formatPrimitive(item, key, locale, copy)).join(", ") });
      return;
    }
    value.forEach((item, index) => flattenDetails(item, rows, locale, copy, [...path, `${keyLabel} ${index + 1}`.trim()], ""));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) rows.push({ label, value: copy.noData });
    const nextPath = keyLabel ? [...path, keyLabel] : path;
    entries.forEach(([childKey, childValue]) => flattenDetails(childValue, rows, locale, copy, nextPath, childKey));
    return;
  }
  rows.push({ label, value: formatPrimitive(value, key, locale, copy) });
}

function detailRows(details: string | null, locale: AppLocale, copy: AuditCopy): DetailRow[] {
  if (!details) return [];
  try {
    const parsed: unknown = JSON.parse(details);
    const rows: DetailRow[] = [];
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => flattenDetails(value, rows, locale, copy, [], key));
    } else {
      flattenDetails(parsed, rows, locale, copy);
    }
    return rows;
  } catch {
    return [{ label: copy.registeredInformation, value: details }];
  }
}

function detailSearchText(details: string | null, locale: AppLocale, copy: AuditCopy): string {
  return detailRows(details, locale, copy).map(row => `${row.label} ${row.value}`).join(" ");
}

export function AuditHistory() {
  const { locale, t } = useI18n();
  const [actions, setActions] = useState<Action[]>([]), [error, setError] = useState(""), [selected, setSelected] = useState<Action | null>(null), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const auditCopy = useMemo<AuditCopy>(() => ({
    noValue: t("admin.audit.noValue"), noItems: t("admin.audit.noItems"), noData: t("admin.audit.noData"),
    enabled: t("admin.audit.enabled"), disabled: t("admin.audit.disabled"), yes: t("admin.audit.yes"), no: t("admin.audit.no"),
    registeredInformation: t("admin.audit.registeredInformation"),
  }), [t]);

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { actions?: Action[]; error?: string };
        if (!response.ok) throw new Error(data.error);
        setActions(data.actions || []);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : t("admin.audit.loadError")));
  }, [t]);

  const visible = useMemo(() => {
    const localeCode = locale === "en" ? "en-GB" : "pt-PT";
    const needle = query.trim().toLocaleLowerCase(localeCode);
    if (!needle) return actions;
    return actions.filter(action => `${actionLabel(action.action, locale)} ${action.actor_name} ${action.class_id ? classLabel(action.class_id, locale) : t("admin.common.administration")} ${detailSearchText(action.details, locale, auditCopy)}`.toLocaleLowerCase(localeCode).includes(needle));
  }, [actions, auditCopy, locale, query, t]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);
  const pagedActions = visible.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);
  const selectedDetails = selected ? detailRows(selected.details, locale, auditCopy) : [];

  return <AuthGuard requireAdmin><AppShell active="audit" breadcrumb={t("admin.audit.breadcrumb")}>
    <section className="page-heading"><div><span className="eyebrow">{t("admin.audit.eyebrow")}</span><h1>{t("admin.audit.title")}</h1><p>{t("admin.audit.description")}</p></div></section>
    <section className="panel audit-panel">
      <div className="panel__header"><div><h2>{t("admin.audit.recent")}</h2><p>{t("admin.audit.recentDescription")}</p></div><label className="search-field audit-search"><Search size={16} /><input placeholder={t("admin.audit.search")} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label></div>
      {error && <AppToast key={error} kind="error" message={error} onDismiss={() => setError("")} />}
      <div className="audit-list">
        {pagedActions.map(action => { const actor = personDisplay({ fullName: action.actor_name, id: action.actor_id, email: action.actor_email, studentNumber: action.actor_student_number }, { revealIdentifier: true, locale }); return <article className="audit-row" key={`${action.class_id || "admin"}-${action.id}`}>
          <div className="audit-row__action"><span className="audit-row__icon"><History size={17} /></span><div><strong>{actionLabel(action.action, locale)}</strong><small><PersonName person={actor} /></small></div></div>
          <div className="audit-row__context">{action.class_id ? classLabel(action.class_id, locale) : t("admin.common.administration")}</div>
          <time>{new Date(action.created_at).toLocaleString(locale === "en" ? "en-GB" : "pt-PT")}</time>
          <button className="button button--secondary audit-row__button" type="button" onClick={() => setSelected(action)}>{t("admin.audit.details")}</button>
        </article> })}
        {!visible.length && !error && <p className="empty-state">{query ? t("admin.audit.noSearchResults") : t("admin.audit.empty")}</p>}
      </div>
      {visible.length > 0 && <div className="admin-pagination"><span>{(effectivePage - 1) * PAGE_SIZE + 1}–{Math.min(effectivePage * PAGE_SIZE, visible.length)} {t("admin.common.of")} {visible.length}</span><div><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={effectivePage === 1}>{t("admin.common.previous")}</button><strong>{effectivePage} / {pageCount}</strong><button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={effectivePage === pageCount}>{t("admin.common.next")}</button></div></div>}
    </section>
    {selected && <div className="audit-modal-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title" onClick={event => event.stopPropagation()}>
      <header><div><span className="eyebrow">{t("admin.audit.record")}</span><h2 id="audit-modal-title">{actionLabel(selected.action, locale)}</h2></div><button type="button" aria-label={t("admin.audit.close")} onClick={() => setSelected(null)}><X size={18} /></button></header>
      <dl><div><dt>{t("admin.audit.user")}</dt><dd>{(() => { const actor = personDisplay({ fullName: selected.actor_name, id: selected.actor_id, email: selected.actor_email, studentNumber: selected.actor_student_number }, { revealIdentifier: true, locale }); return <PersonName person={actor} />; })()}</dd></div><div><dt>{t("admin.audit.context")}</dt><dd>{selected.class_id ? classLabel(selected.class_id, locale) : t("admin.common.administration")}</dd></div><div><dt>{t("admin.audit.date")}</dt><dd>{new Date(selected.created_at).toLocaleString(locale === "en" ? "en-GB" : "pt-PT")}</dd></div></dl>
      <h3>{t("admin.audit.actionDetails")}</h3>
      {selectedDetails.length ? <dl>{selectedDetails.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : <p>{t("admin.audit.noDetails")}</p>}
    </section></div>}
  </AppShell></AuthGuard>;
}
