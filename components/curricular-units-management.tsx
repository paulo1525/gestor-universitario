"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Award, BookOpen, CalendarRange, GraduationCap, Hash, LoaderCircle, Pencil, Plus, Save, Search, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminPage, AdminPageHeader, AdminSection } from "@/components/admin-ui";
import { AppToast } from "@/components/app-toast";
import { FormLabel } from "@/components/form-label";
import { useAuth } from "@/components/auth-context";
import { useI18n } from "@/components/i18n-context";
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

export function CurricularUnitsManagement() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const [units, setUnits] = useState<CurricularUnit[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createForm, setCreateForm] = useState<UnitForm>(emptyForm);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UnitForm>(emptyForm);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [query, setQuery] = useState("");

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
    const search = query.trim().toLocaleLowerCase(locale === "en" ? "en-GB" : "pt-PT");
    return search ? units.filter(unit => `${unit.code} ${unit.name}`.toLocaleLowerCase(locale === "en" ? "en-GB" : "pt-PT").includes(search)) : units;
  }, [locale, query, units]);

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
      ...(mode === "edit" ? { id: editingId } : {}),
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
      setView("list");
      setCreateForm(emptyForm);
      setCreateErrors({});
      setEditingId(null);
      setEditErrors({});
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : t("classes.units.saveError") });
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (unit: CurricularUnit) => {
    setEditingId(unit.id);
    setEditForm({ code: unit.code, name: unit.name, ects: unit.ects, year: unit.year, semester: unit.semester, representativeUserIds: unit.representativeUserIds });
    setEditErrors({});
    setNotice(null);
    setView("edit");
  };

  if (user?.commissionDepartment !== "management" && user?.email.toLowerCase() !== "up202507850@up.pt") {
    return <main className="auth-loading"><ShieldCheck size={28} /><strong>{t("classes.units.accessDenied")}</strong></main>;
  }

  const pageTitle = view === "create" ? t("classes.units.new") : view === "edit" ? t("classes.units.editing", { name: editForm.name }) : t("classes.units.title");
  const pageAction = view === "list" ? <button className="button button--primary" type="button" onClick={() => { setView("create"); setNotice(null); }} disabled={loading}><Plus />{t("classes.units.add")}</button> : <button className="button button--secondary" type="button" onClick={() => { setView("list"); setEditingId(null); setCreateErrors({}); setEditErrors({}); }}><ArrowLeft />Voltar à lista</button>;

  return <AppShell active="curricular_units_management" breadcrumb={t("classes.units.breadcrumb")}><AdminPage>
    <AdminPageHeader eyebrow={t("classes.units.eyebrow")} title={pageTitle} description={view === "list" ? t("classes.units.description") : t("classes.units.required")} actions={pageAction} />

    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    {view === "create" && <section className={`panel ${styles.editor}`} aria-labelledby="nova-unidade">
      <div className={styles.editorHeading}><div><span className={styles.editorIcon}><BookOpen /></span><div><span className="eyebrow">Plano curricular</span><h2 id="nova-unidade">{t("classes.units.new")}</h2></div></div></div>
      <UnitEditor form={createForm} setForm={setCreateForm} errors={createErrors} representatives={representatives} saving={saving} submitLabel={t("classes.units.create")} onSubmit={event => void save("create", event)} onCancel={() => { setView("list"); setCreateErrors({}); }} />
    </section>}

    {view === "edit" && editingId && <section className={`panel ${styles.editor}`} aria-labelledby="editar-unidade">
      <div className={styles.editorHeading}><div><span className={styles.editorIcon}><Pencil /></span><div><span className="eyebrow">{editForm.code}</span><h2 id="editar-unidade">{t("classes.units.editing", { name: editForm.name })}</h2></div></div></div>
      <UnitEditor form={editForm} setForm={setEditForm} errors={editErrors} representatives={representatives} saving={saving} submitLabel={t("classes.units.saveChanges")} onSubmit={event => void save("edit", event)} onCancel={() => { setView("list"); setEditingId(null); setEditErrors({}); }} />
    </section>}

    {view === "list" && <AdminSection className={styles.list} icon={<BookOpen />} eyebrow={t("classes.units.plan")} title={t("classes.units.registered")} description={!loading && !loadError ? `${units.length} ${units.length === 1 ? t("classes.units.countOne") : t("classes.units.countMany")}` : undefined} actions={<label className={styles.unitSearch}><span className="sr-only">Pesquisar</span><span className={styles.searchControl}><Search /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Pesquisar por nome ou código" /></span></label>}>
      {loading ? <div className={styles.state} role="status"><LoaderCircle className={styles.spin} /><strong>{t("classes.units.loading")}</strong></div>
        : loadError ? <div className={`${styles.state} ${styles.errorState}`} role="alert"><strong>{loadError}</strong><button className="button button--secondary button--compact" type="button" onClick={() => void load()}>{t("classes.units.retry")}</button></div>
        : units.length === 0 ? <div className={styles.state}><BookOpen /><strong>{t("classes.units.empty")}</strong><p>{t("classes.units.emptyDescription")}</p><button className="button button--secondary button--compact" type="button" onClick={() => setView("create")}><Plus />{t("classes.units.addFirst")}</button></div>
        : visibleUnits.length === 0 ? <div className={styles.state}><Search /><strong>Sem resultados.</strong><p>Experimente pesquisar por outro nome ou código.</p></div>
        : <div className={styles.unitGrid}><div className={styles.unitTableHeader} data-has-representatives={visibleUnits.some(unit => unit.representativeUserIds.length) ? "true" : "false"} aria-hidden="true"><span>Unidade curricular</span><span>{t("classes.units.credits")}</span><span>{t("classes.units.period")}</span>{visibleUnits.some(unit => unit.representativeUserIds.length) && <span>Comissão de Curso</span>}<span /></div>{visibleUnits.map(unit => <article className={styles.unitCard} data-has-representatives={unit.representativeUserIds.length ? "true" : "false"} key={unit.id}>
          <div className={styles.identity}><span className={styles.code}>{unit.code}</span><h3>{unit.name}</h3></div>
          <div className={styles.metric}><span>{t("classes.units.credits")}</span><strong>{unit.ects.toLocaleString(locale === "en" ? "en-GB" : "pt-PT")} <small>ECTS</small></strong></div>
          <div className={styles.metric}><span>{t("classes.units.period")}</span><strong>{t("classes.units.yearValue", { year: unit.year })} <small>· {t("classes.units.semesterValue", { semester: unit.semester })}</small></strong></div>
          {unit.representativeUserIds.length > 0 && <div className={styles.representative}>{unit.representativeUserIds.map((representativeId) => { const representative = representativesById.get(representativeId); return representative ? <span className={styles.representativePerson} key={representative.id}><strong>{representative.fullName}</strong><small>{representative.email}</small></span> : null; })}</div>}
          <button className={styles.editButton} type="button" onClick={() => beginEdit(unit)} aria-label={t("classes.units.editAria", { name: unit.name })}><Pencil />{t("classes.units.edit")}</button>
        </article>)}</div>}
    </AdminSection>}
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
      <label><FormLabel icon={Award}>{t("classes.units.ects")}</FormLabel><input type="number" value={form.ects} onChange={event => field("ects", event.target.valueAsNumber)} min="0.5" max="60" step="0.5" aria-invalid={Boolean(errors.ects)} />{errors.ects && <small>{errors.ects}</small>}</label>
      <label><FormLabel icon={GraduationCap}>{t("classes.units.year")}</FormLabel><select value={form.year} onChange={event => field("year", Number(event.target.value))} aria-invalid={Boolean(errors.year)}>{[1, 2, 3, 4, 5, 6].map(year => <option value={year} key={year}>{t("classes.units.yearValue", { year })}</option>)}</select>{errors.year && <small>{errors.year}</small>}</label>
      <label><FormLabel icon={CalendarRange}>{t("classes.units.semester")}</FormLabel><select value={form.semester} onChange={event => field("semester", Number(event.target.value))} aria-invalid={Boolean(errors.semester)}><option value={1}>{t("classes.units.semesterValue", { semester: 1 })}</option><option value={2}>{t("classes.units.semesterValue", { semester: 2 })}</option></select>{errors.semester && <small>{errors.semester}</small>}</label>
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
    <div className={styles.formActions}><button className="button button--secondary button--compact" type="button" onClick={onCancel} disabled={saving}>{t("classes.common.cancel")}</button><button className="button button--primary button--compact" type="submit" disabled={saving}>{saving ? <><LoaderCircle className={styles.spin} />{t("classes.common.saving")}</> : <><Save />{submitLabel}</>}</button></div>
  </form>;
}
