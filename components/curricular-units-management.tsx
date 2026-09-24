"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpen, CalendarRange, ChevronLeft, FileText, GraduationCap, Hash, Library, Pencil, Search, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SurfaceHeader } from "@/components/surface-header";
import { AdminPage, AdminPageHeader, AdminToolbar } from "@/components/admin-ui";
import { CancelButton, FormActions, FormCloseButton, SubmitButton } from "@/components/form-actions";
import { FilterSearch } from "@/components/filter-bar";
import { AppToast } from "@/components/app-toast";
import { FormLabel } from "@/components/form-label";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
import { useFloatingAction } from "@/components/floating-actions";
import styles from "@/components/curricular-units-management.module.css";

type ApiUnit = {
  id: string | number;
  code?: string;
  name?: string;
  ects?: number;
  credits?: number;
  year?: number;
  studyYear?: number;
  study_year?: number;
  semester?: number;
  representativeUserIds?: string[] | null;
  representative_user_ids?: string[] | null;
  representativeUserId?: string | null;
  representative_user_id?: string | null;
};

type ApiRepresentative = {
  id: string;
  fullName?: string;
  full_name?: string;
  email: string;
  commissionPosition?: string | null;
  commission_position?: string | null;
};

type CurricularUnit = {
  id: string;
  code: string;
  name: string;
  ects: number;
  year: number;
  semester: number;
  representativeUserIds: string[];
};

type Representative = {
  id: string;
  fullName: string;
  email: string;
  commissionPosition: string | null;
};

type UnitForm = Omit<CurricularUnit, "id">;
type FieldErrors = Partial<Record<keyof UnitForm, string>>;
type Notice = { kind: "success" | "error"; message: string } | null;

const FLOATING_CREATE_ICON = <Pencil aria-hidden="true" />;
const FLOATING_CONTENT_ICON = <FileText aria-hidden="true" />;

const emptyForm: UnitForm = { code: "", name: "", ects: 6, year: 1, semester: 1, representativeUserIds: [] };

function normaliseUnit(unit: ApiUnit): CurricularUnit {
  return {
    id: String(unit.id),
    code: String(unit.code || ""),
    name: String(unit.name || ""),
    ects: Number(unit.ects ?? unit.credits ?? 0),
    year: Number(unit.year ?? unit.studyYear ?? unit.study_year ?? 1),
    semester: Number(unit.semester || 1),
    representativeUserIds: Array.from(new Set((unit.representativeUserIds ?? unit.representative_user_ids ?? [unit.representativeUserId ?? unit.representative_user_id]).filter((value): value is string => typeof value === "string" && Boolean(value)).slice(0, 2))),
  };
}

function normaliseRepresentative(representative: ApiRepresentative): Representative {
  return {
    id: String(representative.id),
    fullName: String(representative.fullName ?? representative.full_name ?? representative.email),
    email: representative.email,
    commissionPosition: representative.commissionPosition ?? representative.commission_position ?? null,
  };
}

type Translator = ReturnType<typeof useI18n>["t"];

function validate(form: UnitForm, t: Translator): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.code.trim()) errors.code = t("classes.units.validationCodeRequired");
  else if (form.code.trim().length > 20) errors.code = t("classes.units.validationCodeLength");
  if (!form.name.trim()) errors.name = t("classes.units.validationNameRequired");
  else if (form.name.trim().length > 160) errors.name = t("classes.units.validationNameLength");
  if (!Number.isFinite(form.ects) || form.ects < 0.5 || form.ects > 60) errors.ects = t("classes.units.validationEcts");
  if (!Number.isInteger(form.year) || form.year < 1 || form.year > 6) errors.year = t("classes.units.validationYear");
  if (form.semester !== 1 && form.semester !== 2) errors.semester = t("classes.units.validationSemester");
  return errors;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function unitIdFromHash() {
  const match = /^#uc-(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function formFromUnit(unit: CurricularUnit): UnitForm {
  return { code: unit.code, name: unit.name, ects: unit.ects, year: unit.year, semester: unit.semester, representativeUserIds: unit.representativeUserIds };
}

export function CurricularUnitsManagement() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const numberLocale = locale === "en" ? "en-GB" : "pt-PT";
  const [units, setUnits] = useState<CurricularUnit[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createForm, setCreateForm] = useState<UnitForm>(emptyForm);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  // Unsaved edits are kept per unit; without a draft the editor shows the stored values.
  const [editDraft, setEditDraft] = useState<{ id: string; form: UnitForm } | null>(null);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  // The open unit lives in #uc-<id> so it can be linked and the back button works.
  const [openId, setOpenId] = useState<string | null>(() => typeof window === "undefined" ? null : unitIdFromHash());

  useEffect(() => {
    const sync = () => setOpenId(unitIdFromHash());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const openUnit = (id: string | null) => {
    const url = new URL(window.location.href);
    url.hash = id ? `uc-${id}` : "";
    window.history.pushState(null, "", url);
    setOpenId(id);
    setEditDraft(null);
    setEditErrors({});
    window.scrollTo({ top: 0 });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/curricular-units", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response, t("classes.units.loadError")));
      const data = await response.json() as { units?: ApiUnit[]; representatives?: ApiRepresentative[] };
      setUnits((data.units || []).map(normaliseUnit));
      setRepresentatives((data.representatives || []).map(normaliseRepresentative));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("classes.units.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // O pedido é iniciado pelo efeito; as atualizações de estado acontecem após a resposta da API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const representativesById = useMemo(
    () => new Map(representatives.map(representative => [representative.id, representative])),
    [representatives],
  );
  const visibleUnits = useMemo(() => {
    const search = query.trim().toLocaleLowerCase(numberLocale);
    return search ? units.filter(unit => `${unit.code} ${unit.name}`.toLocaleLowerCase(numberLocale).includes(search)) : units;
  }, [numberLocale, query, units]);
  const openItem = openId ? units.find(unit => unit.id === openId) ?? null : null;
  const editForm = openItem ? editDraft?.id === openItem.id ? editDraft.form : formFromUnit(openItem) : emptyForm;
  const setEditForm = (form: UnitForm) => { if (openItem) setEditDraft({ id: openItem.id, form }); };

  const save = async (mode: "create" | "edit", event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = mode === "create" ? createForm : editForm;
    const errors = validate(form, t);
    if (mode === "create") setCreateErrors(errors); else setEditErrors(errors);
    if (Object.keys(errors).length) {
      setNotice({ kind: "error", message: t("classes.units.validationReview") });
      return;
    }
    setSaving(true);
    setNotice(null);
    const payload = {
      ...(mode === "edit" ? { id: openItem?.id } : {}),
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      ects: form.ects,
      year: form.year,
      semester: form.semester,
      representativeUserIds: form.representativeUserIds,
      // Mantém o alias para instalações que ainda leem apenas o primeiro representante.
      representativeUserId: form.representativeUserIds[0] || null,
    };
    try {
      const response = await fetch("/api/admin/curricular-units", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response, t("classes.units.saveError")));
      setNotice({ kind: "success", message: mode === "create" ? t("classes.units.created") : t("classes.units.updated") });
      if (mode === "create") {
        setCreating(false);
        setCreateForm(emptyForm);
        setCreateErrors({});
      } else {
        openUnit(null);
      }
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("classes.units.saveError") });
    } finally {
      setSaving(false);
    }
  };

  const canManage = user?.commissionDepartment === "management" || user?.commissionPosition === "principal_admin";
  useFloatingAction(canManage && !creating && !openId && !loading ? { id: "new-curricular-unit", label: t("classes.units.add"), icon: FLOATING_CREATE_ICON, onClick: () => { setCreating(true); setNotice(null); } } : null);
  useFloatingAction(canManage && !creating && openItem ? { id: "curricular-unit-content", label: t("classes.units.content"), icon: FLOATING_CONTENT_ICON, onClick: () => router.push(`/admin/unidades-curriculares/${encodeURIComponent(openItem.id)}/conteudo`) } : null);

  if (!canManage) {
    return <main className="auth-loading"><ShieldCheck size={28} /><strong>{t("classes.units.accessDenied")}</strong></main>;
  }

  const periodOf = (unit: CurricularUnit) => `${t("classes.units.yearValue", { year: unit.year })} · ${t("classes.units.semesterValue", { semester: unit.semester })}`;
  const representativeNames = (unit: CurricularUnit) => unit.representativeUserIds.map(id => representativesById.get(id)?.fullName).filter(Boolean).join(", ");
  const skeleton = (count: number) => <div className={styles.skeleton} aria-busy="true"><span className="sr-only" role="status">{t("classes.units.loading")}</span>{Array.from({ length: count }, (_, index) => <div key={index} className={styles.skeletonRow}><span /><span /></div>)}</div>;

  return <AppShell active="curricular_units_management" breadcrumb={t("classes.units.breadcrumb")}><AdminPage>
    <AdminPageHeader icon={<Library />} eyebrow={t("classes.units.eyebrow")} title={creating ? t("classes.units.new") : t("classes.units.title")} />

    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    {creating && <section className={`panel ${styles.editor}`} aria-labelledby="nova-unidade">
      <SurfaceHeader icon={<BookOpen />} eyebrow={t("classes.units.plan")} title={t("classes.units.new")} headingId="nova-unidade" actions={<FormCloseButton onClick={() => { setCreating(false); setCreateErrors({}); }} label={t("common.close")} disabled={saving} />} />
      <UnitEditor form={createForm} setForm={setCreateForm} errors={createErrors} representatives={representatives} saving={saving} submitLabel={t("classes.units.create")} onSubmit={event => void save("create", event)} onCancel={() => { setCreating(false); setCreateErrors({}); }} />
    </section>}

    {!creating && openId && <>
      <button className={styles.back} type="button" onClick={() => openUnit(null)}><ChevronLeft aria-hidden="true" />{t("classes.units.back")}</button>
      <article className={`panel ${styles.reading}`} aria-busy={loading}>
        {loading ? skeleton(2) : !openItem ? <div className={styles.state}><Search /><strong>{t("classes.units.notFound")}</strong></div> : <>
          <header className={styles.byline}>
            <div>
              <p className={styles.bylineName}>{openItem.code}</p>
              <p className={styles.bylineMeta}>{openItem.ects.toLocaleString(numberLocale)} ECTS · {periodOf(openItem)}</p>
            </div>
          </header>
          <h2 className={styles.readingTitle}>{openItem.name}</h2>
          <span className={styles.readingRule} aria-hidden="true" />
          <div className={styles.readingEditor}><UnitEditor form={editForm} setForm={setEditForm} errors={editErrors} representatives={representatives} saving={saving} submitLabel={t("classes.units.saveChanges")} onSubmit={event => void save("edit", event)} onCancel={() => openUnit(null)} /></div>
        </>}
      </article>
    </>}

    {!creating && !openId && <section className={`panel ${styles.listPanel}`} aria-label={t("classes.units.registered")} aria-busy={loading}>
      <AdminToolbar label={t("classes.units.search")}><FilterSearch label={t("classes.units.search")} value={query} onChange={setQuery} placeholder={t("classes.units.search")} /></AdminToolbar>
      {loading ? skeleton(3)
        : loadError ? <div className={`${styles.state} ${styles.errorState}`} role="alert"><strong>{loadError}</strong><button className="button button--secondary button--compact" type="button" onClick={() => void load()}>{t("classes.units.retry")}</button></div>
        : units.length === 0 ? <div className={styles.state}><BookOpen /><strong>{t("classes.units.empty")}</strong></div>
        : visibleUnits.length === 0 ? <div className={styles.state}><Search /><strong>{t("classes.units.noResults")}</strong></div>
        : <ul className={styles.rows}>{visibleUnits.map(unit => <li className={styles.row} key={unit.id}>
          <span className={styles.code}>{unit.code}</span>
          <div className={styles.rowMain}>
            <h3><a className={`link-quiet ${styles.titleLink}`} href={`#uc-${encodeURIComponent(unit.id)}`} onClick={event => { event.preventDefault(); openUnit(unit.id); }}>{unit.name}</a></h3>
            <p className={styles.rowMeta}>{unit.ects.toLocaleString(numberLocale)} ECTS · {periodOf(unit)}{representativeNames(unit) && ` · ${representativeNames(unit)}`}</p>
          </div>
        </li>)}</ul>}
    </section>}
  </AdminPage></AppShell>;
}

function UnitEditor({ form, setForm, errors, representatives, saving, submitLabel, onSubmit, onCancel }: {
  form: UnitForm;
  setForm: (form: UnitForm) => void;
  errors: FieldErrors;
  representatives: Representative[];
  saving: boolean;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const field = <Key extends keyof UnitForm>(key: Key, value: UnitForm[Key]) => setForm({ ...form, [key]: value });
  const representativeField = (index: number, value: string) => {
    const next = [...form.representativeUserIds];
    if (value) next[index] = value; else next.splice(index, 1);
    setForm({ ...form, representativeUserIds: Array.from(new Set(next.filter(Boolean))).slice(0, 2) });
  };
  return <form className={styles.form} onSubmit={onSubmit} noValidate>
    <div className={styles.formGrid}>
      <label className={styles.codeField}><FormLabel icon={Hash}>{t("classes.units.code")}</FormLabel><input value={form.code} onChange={event => field("code", event.target.value.toUpperCase())} maxLength={20} placeholder={t("classes.units.codePlaceholder")} aria-invalid={Boolean(errors.code)} />{errors.code && <small>{errors.code}</small>}</label>
      <label className={styles.nameField}><FormLabel icon={BookOpen}>{t("classes.units.name")}</FormLabel><input value={form.name} onChange={event => field("name", event.target.value)} maxLength={160} placeholder={t("classes.units.namePlaceholder")} aria-invalid={Boolean(errors.name)} />{errors.name && <small>{errors.name}</small>}</label>
      <label className={styles.ectsField}><FormLabel icon={Award}>{t("classes.units.ects")}</FormLabel><input type="number" value={form.ects} onChange={event => field("ects", event.target.valueAsNumber)} min="0.5" max="60" step="0.5" aria-invalid={Boolean(errors.ects)} />{errors.ects && <small>{errors.ects}</small>}</label>
      <label className={styles.yearField}><FormLabel icon={GraduationCap}>{t("classes.units.year")}</FormLabel><select value={form.year} onChange={event => field("year", Number(event.target.value))} aria-invalid={Boolean(errors.year)}>{[1, 2, 3, 4, 5, 6].map(year => <option value={year} key={year}>{t("classes.units.yearValue", { year })}</option>)}</select>{errors.year && <small>{errors.year}</small>}</label>
      <label className={styles.semesterField}><FormLabel icon={CalendarRange}>{t("classes.units.semester")}</FormLabel><select value={form.semester} onChange={event => field("semester", Number(event.target.value))} aria-invalid={Boolean(errors.semester)}><option value={1}>{t("classes.units.semesterValue", { semester: 1 })}</option><option value={2}>{t("classes.units.semesterValue", { semester: 2 })}</option></select>{errors.semester && <small>{errors.semester}</small>}</label>
      <div className={styles.representativeField}>
        <FormLabel icon={UserRound} optional>{t("classes.units.committeeRepresentatives")}</FormLabel>
        <div className={styles.representativeSelectors}>
          {[0, 1].map((index) => {
            const selected = form.representativeUserIds[index] || "";
            const otherSelected = form.representativeUserIds[index === 0 ? 1 : 0];
            return <label key={index}>
              <span>{t("classes.units.representativeNumber", { number: index + 1 })}</span>
              <select value={selected} onChange={event => representativeField(index, event.target.value)}>
                <option value="">{t("classes.units.noRepresentativeOption")}</option>
                {representatives.map(representative => <option value={representative.id} key={representative.id} disabled={representative.id === otherSelected}>{representative.fullName} · {representative.email}</option>)}
              </select>
            </label>;
          })}
        </div>
        {!representatives.length && <small className={styles.hint}>{t("classes.units.noEligibleRepresentativeOptional")}</small>}
      </div>
    </div>
    <FormActions><CancelButton onClick={onCancel} disabled={saving}>{t("classes.common.cancel")}</CancelButton><SubmitButton busy={saving}>{saving ? t("classes.common.saving") : submitLabel}</SubmitButton></FormActions>
  </form>;
}
