"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, History, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { FilterSearch } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n-context";
import { APP_MODULES } from "@/lib/app-modules";
import { adminDataLabel } from "@/lib/i18n-admin";
import { personDisplay } from "@/lib/person-display";
import { PersonName } from "@/components/person-name";
import { clampPage, Pagination } from "@/components/pagination";
import { AdminEmptyState, AdminPage, AdminPageHeader, AdminToolbar } from "@/components/admin-ui";
import styles from "@/components/audit-history.module.css";

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

function auditKey(action: Action): string {
  return `${action.class_id || "admin"}-${action.id}`;
}

function recordKeyFromHash() {
  const match = /^#registo-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export function AuditHistory() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "en" ? "en-GB" : "pt-PT";
  const [actions, setActions] = useState<Action[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  // The open record lives in #registo-<key> so it can be linked and the back button works.
  const [openKey, setOpenKey] = useState<string | null>(() => typeof window === "undefined" ? null : recordKeyFromHash());
  const auditCopy = useMemo<AuditCopy>(() => ({
    noValue: t("admin.audit.noValue"), noItems: t("admin.audit.noItems"), noData: t("admin.audit.noData"),
    enabled: t("admin.audit.enabled"), disabled: t("admin.audit.disabled"), yes: t("admin.audit.yes"), no: t("admin.audit.no"),
    registeredInformation: t("admin.audit.registeredInformation"),
  }), [t]);

  useEffect(() => {
    const sync = () => setOpenKey(recordKeyFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openRecord = (key: string | null) => {
    const url = new URL(window.location.href);
    url.hash = key ? `registo-${key}` : "";
    window.history.pushState(null, "", url);
    setOpenKey(key);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { actions?: Action[]; error?: string };
        if (!response.ok) throw new Error(data.error);
        setActions(data.actions || []);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : t("admin.audit.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(dateLocale);
    if (!needle) return actions;
    return actions.filter(action => `${actionLabel(action.action, locale)} ${action.actor_name} ${action.class_id ? classLabel(action.class_id, locale) : t("admin.common.administration")} ${detailSearchText(action.details, locale, auditCopy)}`.toLocaleLowerCase(dateLocale).includes(needle));
  }, [actions, auditCopy, dateLocale, locale, query, t]);
  const effectivePage = clampPage(page, visible.length, PAGE_SIZE);
  const pagedActions = visible.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);
  const openItem = openKey ? actions.find(action => auditKey(action) === openKey) ?? null : null;
  const openDetails = openItem ? detailRows(openItem.details, locale, auditCopy) : [];
  const actorOf = (action: Action) => personDisplay({ fullName: action.actor_name, id: action.actor_id, email: action.actor_email, studentNumber: action.actor_student_number }, { revealIdentifier: true, locale });
  const contextOf = (action: Action) => action.class_id ? classLabel(action.class_id, locale) : t("admin.common.administration");
  const formatDate = (value: number) => new Date(value).toLocaleString(dateLocale);
  const skeleton = (count: number) => <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("admin.audit.loading")}</span>{Array.from({ length: count }, (_, index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div>;

  return <AuthGuard requireAdmin><AppShell active="audit" breadcrumb={t("admin.audit.breadcrumb")}><AdminPage>
    <AdminPageHeader icon={<History />} eyebrow={t("admin.audit.eyebrow")} title={t("admin.audit.title")} />
    {error && <AppToast key={error} kind="error" message={error} onDismiss={() => setError("")} />}
    {!openKey && <section className={`panel ${styles.listPanel}`} aria-label={t("admin.audit.recent")} aria-busy={loading}>
      <AdminToolbar label={t("admin.audit.search")}><FilterSearch label={t("admin.audit.search")} value={query} onChange={value => { setQuery(value); setPage(1); }} placeholder={t("admin.audit.search")} /></AdminToolbar>
      {loading ? skeleton(4) : pagedActions.length ? <ul className={styles.rows}>{pagedActions.map(action => { const key = auditKey(action); return <li className={styles.row} key={key}>
        <span className={styles.statusDot} aria-hidden="true" />
        <div className={styles.rowMain}>
          <h3><a className={`link-quiet ${styles.titleLink}`} href={`#registo-${encodeURIComponent(key)}`} onClick={event => { event.preventDefault(); openRecord(key); }}>{actionLabel(action.action, locale)}</a></h3>
          <p className={styles.rowMeta}><PersonName person={actorOf(action)} /> · {contextOf(action)} · {formatDate(action.created_at)}</p>
        </div>
      </li>; })}</ul> : !error && <AdminEmptyState icon={<History />} title={query ? t("admin.audit.noSearchResults") : t("admin.audit.empty")} />}
      {!loading && <Pagination page={effectivePage} totalItems={visible.length} pageSize={PAGE_SIZE} onChange={setPage} />}
    </section>}
    {openKey && <>
      <button className={styles.back} type="button" onClick={() => openRecord(null)}><ChevronLeft aria-hidden="true" />{t("admin.audit.back")}</button>
      <article className={`panel ${styles.reading}`} aria-busy={loading}>
        {loading ? skeleton(2) : !openItem ? <AdminEmptyState icon={<Search />} title={t("admin.audit.noSearchResults")} /> : <>
          <header className={styles.byline}>
            <div>
              <p className={styles.bylineName}><PersonName person={actorOf(openItem)} /></p>
              <p className={styles.bylineMeta}>{contextOf(openItem)} · {formatDate(openItem.created_at)}</p>
            </div>
          </header>
          <h2 className={styles.readingTitle}>{actionLabel(openItem.action, locale)}</h2>
          <span className={styles.readingRule} aria-hidden="true" />
          {openDetails.length ? <dl className={styles.details} aria-label={t("admin.audit.actionDetails")}>{openDetails.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : <p className={styles.readingBody}>{t("admin.audit.noDetails")}</p>}
        </>}
      </article>
    </>}
  </AdminPage></AppShell></AuthGuard>;
}
