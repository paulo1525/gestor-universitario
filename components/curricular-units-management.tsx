"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Award, BookOpen, CalendarRange, GraduationCap, Hash, LoaderCircle, Pencil, Plus, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppToast } from "@/components/app-toast";
import { FormLabel } from "@/components/form-label";
import { useAuth } from "@/components/auth-context";
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

function validate(form: UnitForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.code.trim()) errors.code = "Indique o código da unidade curricular.";
  else if (form.code.trim().length > 20) errors.code = "O código não pode ter mais de 20 caracteres.";
  if (!form.name.trim()) errors.name = "Indique o nome da unidade curricular.";
  else if (form.name.trim().length > 160) errors.name = "O nome não pode ter mais de 160 caracteres.";
  if (!Number.isFinite(form.ects) || form.ects < 0.5 || form.ects > 60) errors.ects = "Indique entre 0,5 e 60 ECTS.";
  if (!Number.isInteger(form.year) || form.year < 1 || form.year > 6) errors.year = "Selecione um ano válido.";
  if (form.semester !== 1 && form.semester !== 2) errors.semester = "Selecione um semestre válido.";
  if (!form.representativeUserId) errors.representativeUserId = "Selecione o representante da CC.";
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
      if (!response.ok) throw new Error(await responseMessage(response, "Não foi possível carregar as unidades curriculares."));
      const data = await response.json() as { units?: ApiUnit[]; representatives?: ApiRepresentative[] };
      setUnits((data.units || []).map(normaliseUnit));
      setRepresentatives((data.representatives || []).map(normaliseRepresentative));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as unidades curriculares.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    const errors = validate(form);
    if (mode === "create") setCreateErrors(errors); else setEditErrors(errors);
    if (Object.keys(errors).length) {
      setNotice({ kind: "error", message: "Revê os campos assinalados antes de guardar." });
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
      if (!response.ok) throw new Error(await responseMessage(response, "Não foi possível guardar a unidade curricular."));
      setNotice({ kind: "success", message: mode === "create" ? "Unidade curricular criada." : "Unidade curricular atualizada." });
      setShowCreate(false);
      setCreateForm(emptyForm);
      setCreateErrors({});
      setEditingId(null);
      setEditErrors({});
      await load();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível guardar a unidade curricular." });
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
    return <main className="auth-loading"><ShieldCheck size={28} /><strong>Acesso reservado ao Núcleo de Gestão.</strong></main>;
  }

  return <AppShell active="curricular_units_management" breadcrumb="Gerir unidades">
    <header className={styles.heading}>
      <div><span className="eyebrow">Núcleo de Gestão</span><h1>Unidades curriculares</h1><p>Regista as unidades curriculares, os respetivos créditos e o representante da Comissão de Curso.</p></div>
      <button className="button button--primary" type="button" onClick={() => { setShowCreate(true); setNotice(null); }} disabled={showCreate}><Plus />Adicionar unidade curricular</button>
    </header>

    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}

    {showCreate && <section className={`panel ${styles.editor}`} aria-labelledby="nova-unidade">
      <div className={styles.editorHeading}><div><span className={styles.editorIcon}><BookOpen /></span><div><h2 id="nova-unidade">Nova unidade curricular</h2><p>Todos os campos são obrigatórios.</p></div></div><button type="button" className={styles.closeButton} onClick={() => { setShowCreate(false); setCreateErrors({}); }} aria-label="Cancelar criação"><X /></button></div>
      <UnitEditor form={createForm} setForm={setCreateForm} errors={createErrors} representatives={representatives} saving={saving} submitLabel="Criar unidade curricular" onSubmit={event => void save("create", event)} onCancel={() => { setShowCreate(false); setCreateErrors({}); }} />
    </section>}

    <section className={`panel ${styles.list}`} aria-labelledby="lista-unidades">
      <div className={styles.listHeading}><div><span className={styles.editorIcon}><BookOpen /></span><div><span className="eyebrow">Plano curricular</span><h2 id="lista-unidades">Unidades registadas</h2></div></div>{!loading && !loadError && <span>{units.length} {units.length === 1 ? "unidade" : "unidades"}</span>}</div>
      {loading ? <div className={styles.state} role="status"><LoaderCircle className={styles.spin} /><strong>A carregar unidades curriculares…</strong></div>
        : loadError ? <div className={`${styles.state} ${styles.errorState}`} role="alert"><strong>{loadError}</strong><button className="button button--secondary button--compact" type="button" onClick={() => void load()}>Tentar novamente</button></div>
        : units.length === 0 ? <div className={styles.state}><BookOpen /><strong>Ainda não existem unidades curriculares.</strong><p>Adiciona a primeira unidade para começar a construir o plano curricular.</p><button className="button button--secondary button--compact" type="button" onClick={() => setShowCreate(true)}><Plus />Adicionar primeira unidade</button></div>
        : <div className={styles.unitGrid}>{units.map(unit => <div className={styles.unitEntry} key={unit.id}>{editingId === unit.id ? <article className={styles.editCard}><div className={styles.editContext}><span className={styles.code}>{unit.code}</span><div><strong>A editar {unit.name}</strong><small>Altera apenas os campos necessários e guarda no final.</small></div></div><UnitEditor form={editForm} setForm={setEditForm} errors={editErrors} representatives={representatives} saving={saving} submitLabel="Guardar alterações" onSubmit={event => void save("edit", event)} onCancel={() => { setEditingId(null); setEditErrors({}); }} /></article> : <article className={styles.unitCard}>
          <div className={styles.identity}><span className={styles.code}>{unit.code}</span><h3>{unit.name}</h3></div>
          <div className={styles.metric}><span>Créditos</span><strong>{unit.ects.toLocaleString("pt-PT")} <small>ECTS</small></strong></div>
          <div className={styles.metric}><span>Período</span><strong>{unit.year}.º ano <small>· {unit.semester}.º semestre</small></strong></div>
          <div className={styles.representative}><span>Representante da CC</span>{representativesById.get(unit.representativeUserId) ? <><strong>{representativesById.get(unit.representativeUserId)?.fullName}</strong><small>{representativesById.get(unit.representativeUserId)?.email}</small></> : <strong className={styles.missingRepresentative}>Representante por atribuir</strong>}</div>
          <button className={styles.editButton} type="button" onClick={() => beginEdit(unit)} aria-label={`Editar ${unit.name}`}><Pencil />Editar</button>
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
  const field = <Key extends keyof UnitForm>(key: Key, value: UnitForm[Key]) => setForm({ ...form, [key]: value });
  return <form className={styles.form} onSubmit={onSubmit} noValidate>
    <div className={styles.formGrid}>
      <label className={styles.codeField}><FormLabel icon={Hash}>Código</FormLabel><input value={form.code} onChange={event => field("code", event.target.value.toUpperCase())} maxLength={20} placeholder="Ex.: ANAT2" aria-invalid={Boolean(errors.code)} />{errors.code && <small>{errors.code}</small>}</label>
      <label className={styles.nameField}><FormLabel icon={BookOpen}>Nome da unidade curricular</FormLabel><input value={form.name} onChange={event => field("name", event.target.value)} maxLength={160} placeholder="Ex.: Anatomia II" aria-invalid={Boolean(errors.name)} />{errors.name && <small>{errors.name}</small>}</label>
      <label><FormLabel icon={Award}>Créditos ECTS</FormLabel><input type="number" value={form.ects} onChange={event => field("ects", event.target.valueAsNumber)} min="0.5" max="60" step="0.5" aria-invalid={Boolean(errors.ects)} />{errors.ects && <small>{errors.ects}</small>}</label>
      <label><FormLabel icon={GraduationCap}>Ano</FormLabel><select value={form.year} onChange={event => field("year", Number(event.target.value))} aria-invalid={Boolean(errors.year)}>{[1, 2, 3, 4, 5, 6].map(year => <option value={year} key={year}>{year}.º ano</option>)}</select>{errors.year && <small>{errors.year}</small>}</label>
      <label><FormLabel icon={CalendarRange}>Semestre</FormLabel><select value={form.semester} onChange={event => field("semester", Number(event.target.value))} aria-invalid={Boolean(errors.semester)}><option value={1}>1.º semestre</option><option value={2}>2.º semestre</option></select>{errors.semester && <small>{errors.semester}</small>}</label>
      <label className={styles.representativeField}><FormLabel icon={UserRound}>Representante da Comissão de Curso</FormLabel><select value={form.representativeUserId} onChange={event => field("representativeUserId", event.target.value)} aria-invalid={Boolean(errors.representativeUserId)}><option value="">Selecionar representante…</option>{representatives.map(representative => <option value={representative.id} key={representative.id}>{representative.fullName} · {representative.email}</option>)}</select>{errors.representativeUserId && <small>{errors.representativeUserId}</small>}{!representatives.length && <small className={styles.hint}>Não existem membros da CC elegíveis. Atribui primeiro um cargo no controlo administrativo.</small>}</label>
    </div>
    <div className={styles.formActions}><button className="button button--secondary button--compact" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="button button--primary button--compact" type="submit" disabled={saving}>{saving ? <><LoaderCircle className={styles.spin} />A guardar…</> : <><Save />{submitLabel}</>}</button></div>
  </form>;
}
