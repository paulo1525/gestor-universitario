"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Award, BookOpen, CalendarRange, GraduationCap, Hash, LoaderCircle, Pencil, Plus, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
  representativeUserId: string;
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

const emptyForm: UnitForm = { code: "", name: "", ects: 6, year: 1, semester: 1, representativeUserId: "" };

function normaliseUnit(unit: ApiUnit): CurricularUnit {
  return {
    id: String(unit.id),
    code: String(unit.code || ""),
    name: String(unit.name || ""),
    ects: Number(unit.ects ?? unit.credits ?? 0),
    year: Number(unit.year ?? unit.studyYear ?? unit.study_year ?? 1),
    semester: Number(unit.semester || 1),
    representativeUserId: String(unit.representativeUserId ?? unit.representative_user_id ?? ""),
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
  if (!form.representativeUserId) errors.representativeUserId = t("classes.units.validationRepresentative");
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
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<UnitForm>(emptyForm);
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UnitForm>(emptyForm);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

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
      representativeUserId: form.representativeUserId,
    };
    try {
      const response = await fetch("/api/admin/curricular-units", {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response, t("classes.units.saveError")));
      setNotice({ kind: "success", message: mode === "create" ? t("classes.units.created") : t("classes.units.updated") });
      setShowCreate(false);
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
    setEditForm({ code: unit.code, name: unit.name, ects: unit.ects, year: unit.year, semester: unit.semester, representativeUserId: unit.representativeUserId });
    setEditErrors({});
    setNotice(null);
  };

  if (user?.commissionDepartment !== "management" && user?.email.toLowerCase() !== "up202507850@up.pt") {
    return <main className="auth-loading"><ShieldCheck size={28} /><strong>{t("classes.units.accessDenied")}</strong></main>;
  }

  return <AppShell active="curricular_units_management" breadcrumb={t("classes.units.breadcrumb")}>
    <header className={styles.heading}>
      <div><span className="eyebrow">{t("classes.units.eyebrow")}</span><h1>{t("classes.units.title")}</h1><p>{t("classes.units.description")}</p></div>
      <button className="button button--primary" type="button" onClick={() => { setShowCreate(true); setNotice(null); }} disabled={showCreate}><Plus />{t("classes.units.add")}</button>
    </header>

    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    {showCreate && <section className={`panel ${styles.editor}`} aria-labelledby="nova-unidade">
      <div className={styles.editorHeading}><div><span className={styles.editorIcon}><BookOpen /></span><div><h2 id="nova-unidade">{t("classes.units.new")}</h2><p>{t("classes.units.required")}</p></div></div><button type="button" className={styles.closeButton} onClick={() => { setShowCreate(false); setCreateErrors({}); }} aria-label={t("classes.units.cancelCreate")}><X /></button></div>
      <UnitEditor form={createForm} setForm={setCreateForm} errors={createErrors} representatives={representatives} saving={saving} submitLabel={t("classes.units.create")} onSubmit={event => void save("create", event)} onCancel={() => { setShowCreate(false); setCreateErrors({}); }} />
    </section>}

    <section className={`panel ${styles.list}`} aria-labelledby="lista-unidades">
      <div className={styles.listHeading}><div><span className={styles.editorIcon}><BookOpen /></span><div><span className="eyebrow">{t("classes.units.plan")}</span><h2 id="lista-unidades">{t("classes.units.registered")}</h2></div></div>{!loading && !loadError && <span>{units.length} {units.length === 1 ? t("classes.units.countOne") : t("classes.units.countMany")}</span>}</div>
      {loading ? <div className={styles.state} role="status"><LoaderCircle className={styles.spin} /><strong>{t("classes.units.loading")}</strong></div>
        : loadError ? <div className={`${styles.state} ${styles.errorState}`} role="alert"><strong>{loadError}</strong><button className="button button--secondary button--compact" type="button" onClick={() => void load()}>{t("classes.units.retry")}</button></div>
        : units.length === 0 ? <div className={styles.state}><BookOpen /><strong>{t("classes.units.empty")}</strong><p>{t("classes.units.emptyDescription")}</p><button className="button button--secondary button--compact" type="button" onClick={() => setShowCreate(true)}><Plus />{t("classes.units.addFirst")}</button></div>
        : <div className={styles.unitGrid}>{units.map(unit => <div className={styles.unitEntry} key={unit.id}>{editingId === unit.id ? <article className={styles.editCard}><div className={styles.editContext}><span className={styles.code}>{unit.code}</span><div><strong>{t("classes.units.editing", { name: unit.name })}</strong><small>{t("classes.units.editHint")}</small></div></div><UnitEditor form={editForm} setForm={setEditForm} errors={editErrors} representatives={representatives} saving={saving} submitLabel={t("classes.units.saveChanges")} onSubmit={event => void save("edit", event)} onCancel={() => { setEditingId(null); setEditErrors({}); }} /></article> : <article className={styles.unitCard}>
          <div className={styles.identity}><span className={styles.code}>{unit.code}</span><h3>{unit.name}</h3></div>
          <div className={styles.metric}><span>{t("classes.units.credits")}</span><strong>{unit.ects.toLocaleString(locale === "en" ? "en-GB" : "pt-PT")} <small>ECTS</small></strong></div>
          <div className={styles.metric}><span>{t("classes.units.period")}</span><strong>{t("classes.units.yearValue", { year: unit.year })} <small>· {t("classes.units.semesterValue", { semester: unit.semester })}</small></strong></div>
          <div className={styles.representative}><span>{t("classes.units.representative")}</span>{representativesById.get(unit.representativeUserId) ? <><strong>{representativesById.get(unit.representativeUserId)?.fullName}</strong><small>{representativesById.get(unit.representativeUserId)?.email}</small></> : <strong className={styles.missingRepresentative}>{t("classes.units.noRepresentative")}</strong>}</div>
          <button className={styles.editButton} type="button" onClick={() => beginEdit(unit)} aria-label={t("classes.units.editAria", { name: unit.name })}><Pencil />{t("classes.units.edit")}</button>
        </article>}</div>)}</div>}
    </section>
  </AppShell>;
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
  return <form className={styles.form} onSubmit={onSubmit} noValidate>
    <div className={styles.formGrid}>
      <label className={styles.codeField}><FormLabel icon={Hash}>{t("classes.units.code")}</FormLabel><input value={form.code} onChange={event => field("code", event.target.value.toUpperCase())} maxLength={20} placeholder={t("classes.units.codePlaceholder")} aria-invalid={Boolean(errors.code)} />{errors.code && <small>{errors.code}</small>}</label>
      <label className={styles.nameField}><FormLabel icon={BookOpen}>{t("classes.units.name")}</FormLabel><input value={form.name} onChange={event => field("name", event.target.value)} maxLength={160} placeholder={t("classes.units.namePlaceholder")} aria-invalid={Boolean(errors.name)} />{errors.name && <small>{errors.name}</small>}</label>
      <label><FormLabel icon={Award}>{t("classes.units.ects")}</FormLabel><input type="number" value={form.ects} onChange={event => field("ects", event.target.valueAsNumber)} min="0.5" max="60" step="0.5" aria-invalid={Boolean(errors.ects)} />{errors.ects && <small>{errors.ects}</small>}</label>
      <label><FormLabel icon={GraduationCap}>{t("classes.units.year")}</FormLabel><select value={form.year} onChange={event => field("year", Number(event.target.value))} aria-invalid={Boolean(errors.year)}>{[1, 2, 3, 4, 5, 6].map(year => <option value={year} key={year}>{t("classes.units.yearValue", { year })}</option>)}</select>{errors.year && <small>{errors.year}</small>}</label>
      <label><FormLabel icon={CalendarRange}>{t("classes.units.semester")}</FormLabel><select value={form.semester} onChange={event => field("semester", Number(event.target.value))} aria-invalid={Boolean(errors.semester)}><option value={1}>{t("classes.units.semesterValue", { semester: 1 })}</option><option value={2}>{t("classes.units.semesterValue", { semester: 2 })}</option></select>{errors.semester && <small>{errors.semester}</small>}</label>
      <label className={styles.representativeField}><FormLabel icon={UserRound}>{t("classes.units.committeeRepresentative")}</FormLabel><select value={form.representativeUserId} onChange={event => field("representativeUserId", event.target.value)} aria-invalid={Boolean(errors.representativeUserId)}><option value="">{t("classes.units.selectRepresentative")}</option>{representatives.map(representative => <option value={representative.id} key={representative.id}>{representative.fullName} · {representative.email}</option>)}</select>{errors.representativeUserId && <small>{errors.representativeUserId}</small>}{!representatives.length && <small className={styles.hint}>{t("classes.units.noEligibleRepresentative")}</small>}</label>
    </div>
    <div className={styles.formActions}><button className="button button--secondary button--compact" type="button" onClick={onCancel} disabled={saving}>{t("classes.common.cancel")}</button><button className="button button--primary button--compact" type="submit" disabled={saving}>{saving ? <><LoaderCircle className={styles.spin} />{t("classes.common.saving")}</> : <><Save />{submitLabel}</>}</button></div>
  </form>;
}
