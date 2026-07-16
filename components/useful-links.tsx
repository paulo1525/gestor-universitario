"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ExternalLink,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { AppShell, AppShellActive } from "@/components/app-shell";
import { AppToast, ToastKind } from "@/components/app-toast";
import { AuthGuard } from "@/components/auth-guard";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { ModuleGuard } from "@/components/module-guard";
import { useModuleEnabled } from "@/components/use-module-enabled";
import styles from "@/components/useful-links.module.css";

type Priority = "urgent" | "important" | "normal";
type Category = "academic" | "platform" | "curricular_unit" | "support" | "association" | "other";
type Visibility = "students" | "cc" | "public";
type LinkStatus = "published" | "draft" | "archived";
type Unit = { id: string; code: string; name: string };
type UsefulLink = {
  id: string;
  title: string;
  url: string;
  description: string;
  priority: Priority;
  category: Category;
  visibility: Visibility;
  status: LinkStatus;
  unit: Unit | null;
  updatedAt: string;
};
type ApiLink = Partial<Omit<UsefulLink, "id" | "unit">> & {
  id: string | number;
  href?: string;
  link?: string;
  curricularUnitId?: string | number;
  unitId?: string | number;
  curricularUnit?: { id: string | number; code?: string; name?: string };
  unit?: { id: string | number; code?: string; name?: string };
  unitCode?: string;
  unitName?: string;
  updated_at?: string;
  createdAt?: string;
  isArchived?: boolean;
};
type FormState = Omit<UsefulLink, "id" | "unit" | "updatedAt"> & { unitId: string };
type Notice = { kind: ToastKind; message: string } | null;

const priorities: Priority[] = ["urgent", "important", "normal"];
const categories: Category[] = ["academic", "platform", "curricular_unit", "support", "association", "other"];
const visibilities: Visibility[] = ["students", "cc", "public"];
const statuses: LinkStatus[] = ["published", "draft", "archived"];
const priorityOrder: Record<Priority, number> = { urgent: 0, important: 1, normal: 2 };
const initialForm: FormState = {
  title: "",
  url: "https://",
  description: "",
  priority: "normal",
  category: "academic",
  visibility: "students",
  status: "published",
  unitId: "",
};

function normalizeLink(item: ApiLink): UsefulLink {
  const nestedUnit = item.unit ?? item.curricularUnit;
  const unitId = nestedUnit?.id ?? item.unitId ?? item.curricularUnitId;
  return {
    id: String(item.id),
    title: item.title?.trim() || "—",
    url: item.url ?? item.href ?? item.link ?? "",
    description: item.description ?? "",
    priority: priorities.includes(item.priority as Priority) ? item.priority as Priority : "normal",
    category: categories.includes(item.category as Category) ? item.category as Category : "other",
    visibility: visibilities.includes(item.visibility as Visibility) ? item.visibility as Visibility : "students",
    status: item.isArchived ? "archived" : statuses.includes(item.status as LinkStatus) ? item.status as LinkStatus : "published",
    unit: unitId ? {
      id: String(unitId),
      code: nestedUnit?.code ?? item.unitCode ?? "UC",
      name: nestedUnit?.name ?? item.unitName ?? "",
    } : null,
    updatedAt: item.updatedAt ?? item.updated_at ?? item.createdAt ?? new Date().toISOString(),
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  return response.json() as Promise<Record<string, unknown>>;
}

export function UsefulLinks() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const managementEnabled = useModuleEnabled("useful_links.management");
  const [links, setLinks] = useState<UsefulLink[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const localManager = managementEnabled && (user?.role === "admin" || Boolean(user?.commissionPosition));
      const response = await fetch(`/api/useful-links${localManager ? "?scope=management" : ""}`, { cache: "no-store" });
      const data = await readJson(response) as {
        links?: ApiLink[];
        usefulLinks?: ApiLink[];
        items?: ApiLink[];
        units?: Array<{ id: string | number; code?: string; name?: string }>;
        canManage?: boolean;
        capabilities?: { manage?: boolean };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || t("links.loadError"));
      setLinks((data.links ?? data.usefulLinks ?? data.items ?? []).map(normalizeLink));
      setUnits((data.units ?? []).map((unit) => ({ id: String(unit.id), code: unit.code ?? "UC", name: unit.name ?? "" })));
      setCanManage(Boolean(localManager && (data.canManage ?? data.capabilities?.manage ?? true)));
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("links.loadError") });
    } finally {
      setLoading(false);
    }
  }, [managementEnabled, t, user]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return links
      .filter((item) => !normalizedQuery || `${item.title} ${item.description} ${item.url} ${item.unit?.code ?? ""} ${item.unit?.name ?? ""}`.toLocaleLowerCase(locale).includes(normalizedQuery))
      .filter((item) => priorityFilter === "all" || item.priority === priorityFilter)
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => unitFilter === "all" || (unitFilter === "general" ? !item.unit : item.unit?.id === unitFilter))
      .filter((item) => visibilityFilter === "all" || item.visibility === visibilityFilter)
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.title.localeCompare(b.title, locale));
  }, [categoryFilter, links, locale, priorityFilter, query, statusFilter, unitFilter, visibilityFilter]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(initialForm);
  };
  const create = () => {
    setEditingId(null);
    setForm(initialForm);
    setFormOpen(true);
  };
  const edit = (item: UsefulLink) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      url: item.url,
      description: item.description,
      priority: item.priority,
      category: item.category,
      visibility: item.visibility,
      status: item.status,
      unitId: item.unit?.id ?? "",
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.url.trim()) {
      setNotice({ kind: "warning", message: t("links.required") });
      return;
    }
    let parsed: URL;
    try { parsed = new URL(form.url.trim()); } catch { parsed = new URL("http://invalid.local"); }
    if (parsed.protocol !== "https:" || !parsed.hostname) {
      setNotice({ kind: "warning", message: t("links.invalidUrl") });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, id: editingId ?? undefined, title: form.title.trim(), url: parsed.toString(), description: form.description.trim(), unitId: form.unitId || null, curricularUnitId: form.unitId || null };
      const response = await fetch("/api/useful-links", {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson(response) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("links.saveError"));
      closeForm();
      setNotice({ kind: "success", message: t("links.saved") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("links.saveError") });
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (item: UsefulLink, action: "archive" | "delete") => {
    if (action === "delete" && !window.confirm(t("links.confirmDelete"))) return;
    setActing(item.id);
    try {
      const response = await fetch("/api/useful-links", {
        method: action === "delete" ? "DELETE" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "delete" ? { id: item.id } : {
          id: item.id,
          title: item.title,
          url: item.url,
          description: item.description,
          priority: item.priority,
          category: item.category,
          unitId: item.unit?.id ?? null,
          visibility: item.visibility,
          status: "archived",
        }),
      });
      const data = await readJson(response) as { error?: string };
      if (!response.ok) throw new Error(data.error || t("links.actionError"));
      setNotice({ kind: "success", message: t(action === "delete" ? "links.deleted" : "links.archived") });
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("links.actionError") });
    } finally {
      setActing(null);
    }
  };

  const filtersActive = Boolean(query || priorityFilter !== "all" || categoryFilter !== "all" || unitFilter !== "all" || visibilityFilter !== "all" || statusFilter !== "all");
  const clearFilters = () => { setQuery(""); setPriorityFilter("all"); setCategoryFilter("all"); setUnitFilter("all"); setVisibilityFilter("all"); setStatusFilter("all"); };

  return (
    <AuthGuard>
      <ModuleGuard moduleKey="useful_links.library">
        <AppShell active={"useful_links" as AppShellActive} breadcrumb={t("links.breadcrumb")}>
          <div className={styles.page}>
            <header className={styles.hero}>
              <div className={styles.heroCopy}>
                <span className={styles.heroIcon}><Link2 /></span>
                <div><span className="eyebrow">{t("links.eyebrow")}</span><h1>{t("links.title")}</h1><p>{t("links.description")}</p></div>
              </div>
              {canManage && <button className="button button--primary" type="button" onClick={formOpen ? closeForm : create}>{formOpen ? <X /> : <Plus />}{t(formOpen ? "links.closeForm" : "links.add")}</button>}
            </header>

            {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

            {canManage && formOpen && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}><div><h2>{t(editingId ? "links.edit" : "links.add")}</h2><p>{t("links.manageHint")}</p></div><ShieldCheck /></div>
                <form className={styles.form} onSubmit={submit}>
                  <div className={styles.formGrid}>
                    <label className={styles.field}><span>{t("links.field.title")}</span><input value={form.title} onChange={(event) => setField("title", event.target.value)} maxLength={160} placeholder={t("links.titlePlaceholder")} required /></label>
                    <label className={styles.field}><span>{t("links.field.url")}</span><input type="url" inputMode="url" value={form.url} onChange={(event) => setField("url", event.target.value)} maxLength={1500} pattern="https://.*" placeholder={t("links.urlPlaceholder")} required /></label>
                    <label className={`${styles.field} ${styles.fieldFull}`}><span>{t("links.field.description")}</span><textarea value={form.description} onChange={(event) => setField("description", event.target.value)} maxLength={500} placeholder={t("links.descriptionPlaceholder")} /></label>
                    <label className={styles.field}><span>{t("links.field.priority")}</span><select value={form.priority} onChange={(event) => setField("priority", event.target.value as Priority)}>{priorities.map((value) => <option key={value} value={value}>{t(`links.priority.${value}`)}</option>)}</select></label>
                    <label className={styles.field}><span>{t("links.field.category")}</span><select value={form.category} onChange={(event) => setField("category", event.target.value as Category)}>{categories.map((value) => <option key={value} value={value}>{t(`links.category.${value}`)}</option>)}</select></label>
                    <label className={styles.field}><span>{t("links.field.unit")}</span><select value={form.unitId} onChange={(event) => setField("unitId", event.target.value)}><option value="">{t("links.noUnit")}</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
                    <label className={styles.field}><span>{t("links.field.visibility")}</span><select value={form.visibility} onChange={(event) => setField("visibility", event.target.value as Visibility)}>{visibilities.map((value) => <option key={value} value={value}>{t(`links.visibility.${value}`)}</option>)}</select></label>
                    <label className={styles.field}><span>{t("links.field.status")}</span><select value={form.status} onChange={(event) => setField("status", event.target.value as LinkStatus)}>{statuses.map((value) => <option key={value} value={value}>{t(`links.status.${value}`)}</option>)}</select></label>
                  </div>
                  <div className={styles.formActions}><button className="button button--secondary" type="button" onClick={closeForm}>{t("links.cancel")}</button><button className="button button--primary" type="submit" disabled={saving}>{saving && <LoaderCircle className={styles.spin} />}{t(saving ? "links.saving" : "links.save")}</button></div>
                </form>
              </section>
            )}

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><h2>{t("links.library")}</h2><p>{t("links.libraryHint")}</p></div>{!loading && <span className={styles.count}>{visible.length} {t(visible.length === 1 ? "links.result" : "links.results")}</span>}</div>
              <div className={styles.toolbar} aria-label={t("links.filters")}>
                <label className={styles.search}><Search /><span className="sr-only">{t("links.search")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("links.search")} /></label>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label={t("links.field.priority")}><option value="all">{t("links.allPriorities")}</option>{priorities.map((value) => <option key={value} value={value}>{t(`links.priority.${value}`)}</option>)}</select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label={t("links.field.category")}><option value="all">{t("links.allCategories")}</option>{categories.map((value) => <option key={value} value={value}>{t(`links.category.${value}`)}</option>)}</select>
                <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} aria-label={t("links.field.unit")}><option value="all">{t("links.allUnits")}</option><option value="general">{t("links.noUnit")}</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select>
                {canManage && <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} aria-label={t("links.field.visibility")}><option value="all">{t("links.allVisibilities")}</option>{visibilities.map((value) => <option key={value} value={value}>{t(`links.visibility.${value}`)}</option>)}</select>}
                {canManage && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label={t("links.field.status")}><option value="all">{t("links.allStatuses")}</option>{statuses.map((value) => <option key={value} value={value}>{t(`links.status.${value}`)}</option>)}</select>}
                {filtersActive && <button className={styles.clear} type="button" onClick={clearFilters}><X />{t("links.clearFilters")}</button>}
              </div>
              {loading ? <div className={styles.state} aria-live="polite"><LoaderCircle className={styles.spin} /><strong>{t("links.loading")}</strong></div> : visible.length === 0 ? <div className={styles.state}><Link2 /><strong>{t("links.empty")}</strong><p>{t("links.emptyHint")}</p>{filtersActive && <button className={styles.emptyAction} type="button" onClick={clearFilters}><X />{t("links.clearFilters")}</button>}</div> : (
                <div className={styles.grid}>
                  {visible.map((item) => (
                    <article className={`${styles.card} ${styles[`priority_${item.priority}`]}`} key={item.id}>
                      <div className={styles.cardHeader}><span className={styles.priority}>{t(`links.priority.${item.priority}`)}</span>{canManage && <span className={`${styles.status} ${styles[`status_${item.status}`]}`}>{t(`links.status.${item.status}`)}</span>}</div>
                      <div className={styles.cardCopy}><span className={styles.linkIcon}><Link2 /></span><div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div></div>
                      <div className={styles.tags}><span>{t(`links.category.${item.category}`)}</span><span>{item.unit ? `${item.unit.code} · ${item.unit.name}` : t("links.noUnit")}</span>{canManage && <span>{t(`links.visibility.${item.visibility}`)}</span>}</div>
                      <a className={styles.url} href={item.url} target="_blank" rel="noopener noreferrer"><span>{item.url}</span><ExternalLink /></a>
                      <div className={styles.cardActions}>
                        <a className="button button--primary button--compact" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink />{t("links.open")}</a>
                        {canManage && <><button className="button button--secondary button--compact" type="button" onClick={() => edit(item)}><Pencil />{t("links.editAction")}</button>{item.status !== "archived" && <button className="button button--secondary button--compact" type="button" onClick={() => void runAction(item, "archive")} disabled={acting === item.id}><Archive />{t("links.archive")}</button>}<button className="button button--danger button--compact" type="button" onClick={() => void runAction(item, "delete")} disabled={acting === item.id}><Trash2 />{t("links.delete")}</button></>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </AppShell>
      </ModuleGuard>
    </AuthGuard>
  );
}
