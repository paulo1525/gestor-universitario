"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, ClipboardCheck, FileText, LoaderCircle, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminPage, AdminPageHeader, AdminSection, AdminFormGrid, AdminToolbar } from "@/components/admin-ui";
import { FilterSelect } from "@/components/filter-bar";
import { AppToast } from "@/components/app-toast";
import styles from "@/components/curricular-unit-academic-content-management.module.css";

type Evaluation = { title: string; weight: string; minimumScore: string; details: string };
type Exam = { title: string; examType: string; calendarEventId: string; notes: string };
type Source = { title: string; sourceType: string; citation: string; pages: string; url: string };
type FormState = {
  id: string;
  academicYear: string;
  description: string;
  attendanceRequired: boolean;
  attendancePolicy: string;
  absenceLimit: string;
  absencePolicy: string;
  attendanceNotes: string;
  status: "a_validar" | "verificado";
  evaluations: Evaluation[];
  exams: Exam[];
  sources: Source[];
};
type CalendarEvent = { id: string; title: string; startsAt: number; endsAt: number; type: string };
type Unit = { id: string; code: string; name: string };
type Notice = { kind: "success" | "error"; message: string } | null;

const emptyForm = (academicYear: string): FormState => ({ id: "", academicYear, description: "", attendanceRequired: false, attendancePolicy: "", absenceLimit: "", absencePolicy: "", attendanceNotes: "", status: "a_validar", evaluations: [], exams: [], sources: [] });
const academicYearDefault = () => {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}/${start + 1}`;
};

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function date(value: number): string { return new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Lisbon" }).format(new Date(value)); }
function apiMessage(response: Response, fallback: string): Promise<string> { return response.json().then(value => (value as { error?: string }).error || fallback).catch(() => fallback); }

export function CurricularUnitAcademicContentManagement({ id }: { id: string }) {
  const [unit, setUnit] = useState<Unit | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState(academicYearDefault);
  const [form, setForm] = useState<FormState>(() => emptyForm(academicYearDefault()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async (selectedYear = year) => {
    setLoading(true);
    try {
      const [contentResponse, unitsResponse, eventsResponse] = await Promise.all([
        fetch(`/api/admin/curricular-unit-content?unitId=${encodeURIComponent(id)}&academicYear=${encodeURIComponent(selectedYear)}`, { cache: "no-store" }),
        fetch("/api/admin/curricular-units", { cache: "no-store" }),
        fetch(`/api/calendar-events?unitId=${encodeURIComponent(id)}&from=0&to=4102444800000`, { cache: "no-store" }),
      ]);
      if (!contentResponse.ok) throw new Error(await apiMessage(contentResponse, "Não foi possível carregar a informação académica."));
      const content = await contentResponse.json() as { academicYear?: string | null; availableYears?: string[]; profile?: Record<string, unknown> | null; evaluations?: Array<Record<string, unknown>>; exams?: Array<Record<string, unknown>>; sources?: Array<Record<string, unknown>> };
      const units = unitsResponse.ok ? await unitsResponse.json() as { units?: Array<Record<string, unknown>> } : { units: [] };
      const calendar = eventsResponse.ok ? await eventsResponse.json() as { events?: Array<Record<string, unknown>> } : { events: [] };
      const foundUnit = (units.units || []).find(item => String(item.id) === id);
      if (foundUnit) setUnit({ id, code: text(foundUnit.code), name: text(foundUnit.name) });
      const resolvedYear = text(content.academicYear) || selectedYear;
      setYear(resolvedYear);
      setYears(Array.from(new Set([...(content.availableYears || []), resolvedYear])).sort().reverse());
      setEvents((calendar.events || []).map(item => ({ id: text(item.id), title: text(item.title), startsAt: Number(item.startsAt || item.starts_at || 0), endsAt: Number(item.endsAt || item.ends_at || 0), type: text(item.type || item.eventType || item.event_type) })));
      const profile = content.profile;
      setForm({
        id: text(profile?.id), academicYear: resolvedYear, description: text(profile?.description), attendanceRequired: profile?.attendanceRequired === true, attendancePolicy: text(profile?.attendancePolicy), absenceLimit: text(profile?.absenceLimit), absencePolicy: text(profile?.absencePolicy), attendanceNotes: text(profile?.attendanceNotes), status: profile?.status === "verificado" ? "verificado" : "a_validar",
        evaluations: (content.evaluations || []).map(item => ({ title: text(item.title), weight: item.weight == null ? "" : String(item.weight), minimumScore: item.minimumScore == null ? "" : String(item.minimumScore), details: text(item.details) })),
        exams: (content.exams || []).map(item => ({ title: text(item.title), examType: text(item.examType) || "outro", calendarEventId: text(item.calendarEventId), notes: text(item.notes) })),
        sources: (content.sources || []).map(item => ({ title: text(item.title), sourceType: text(item.sourceType) || "outro", citation: text(item.citation), pages: text(item.pages), url: text(item.url) })),
      });
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível carregar a informação académica." });
    } finally {
      setLoading(false);
    }
  }, [id, year]);

  // O carregamento é iniciado pelo efeito; as atualizações de estado acontecem após a resposta da API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm(current => ({ ...current, [key]: value }));
  const updateArray = <Key extends "evaluations" | "exams" | "sources">(key: Key, index: number, value: Partial<FormState[Key][number]>) => setForm(current => ({ ...current, [key]: current[key].map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item) }));
  const removeArray = <Key extends "evaluations" | "exams" | "sources">(key: Key, index: number) => setForm(current => ({ ...current, [key]: current[key].filter((_, itemIndex) => itemIndex !== index) }));
  const addEvaluation = () => update("evaluations", [...form.evaluations, { title: "", weight: "", minimumScore: "", details: "" }]);
  const addExam = () => update("exams", [...form.exams, { title: "", examType: "normal", calendarEventId: "", notes: "" }]);
  const addSource = () => update("sources", [...form.sources, { title: "", sourceType: "recomendada", citation: "", pages: "", url: "" }]);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/curricular-unit-content", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ unitId: id, ...form, evaluations: form.evaluations.map((item, sortOrder) => ({ ...item, weight: item.weight === "" ? null : Number(item.weight), minimumScore: item.minimumScore === "" ? null : Number(item.minimumScore), sortOrder })), exams: form.exams.map((item, sortOrder) => ({ ...item, calendarEventId: item.calendarEventId || null, sortOrder })), sources: form.sources.map((item, sortOrder) => ({ ...item, url: item.url || null, sortOrder })) }) });
      if (!response.ok) throw new Error(await apiMessage(response, "Não foi possível guardar a informação académica."));
      setNotice({ kind: "success", message: form.status === "verificado" ? "Informação guardada e marcada como verificada." : "Informação académica guardada como a validar." });
      await load(form.academicYear);
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Não foi possível guardar a informação académica." });
    } finally {
      setSaving(false);
    }
  };

  const eventOptions = useMemo(() => events.slice().sort((left, right) => left.startsAt - right.startsAt), [events]);
  const statusLabel = form.status === "verificado" ? "Verificado" : "A validar";

  if (loading && !unit) return <AppShell active="curricular_units_management" breadcrumb="Conteúdo académico"><AdminPage><div className="auth-loading"><LoaderCircle className="spin" /><strong>A carregar informação académica…</strong></div></AdminPage></AppShell>;

  return <AppShell active="curricular_units_management" breadcrumb={unit?.name || "Conteúdo académico"}><AdminPage>
    <AdminPageHeader eyebrow="Conteúdo académico" title={unit ? `${unit.code} · ${unit.name}` : "Informação académica"} />
    <AdminToolbar standalone label="Ano letivo"><FilterSelect label="Ano letivo" value={year} onChange={value => { setYear(value); void load(value); }} defaultValue={academicYearDefault()} options={[academicYearDefault(), ...years.filter(item => item !== academicYearDefault())].map(item => ({ value: item, label: item }))} /></AdminToolbar>
    {notice && <AppToast kind={notice.kind} message={notice.message} onDismiss={() => setNotice(null)} />}
    <AdminSection icon={form.status === "verificado" ? <BadgeCheck /> : <ShieldAlert />} eyebrow="Estado da informação" title={statusLabel} actions={<span className={`${styles.status} ${form.status === "verificado" ? styles.statusVerified : styles.statusPending}`}>{form.status === "verificado" ? <BadgeCheck /> : <ShieldAlert />}{statusLabel}</span>}>
      <AdminFormGrid>
        <label className={`${styles.field} ${styles.wide}`}><span>Descrição da unidade curricular</span><textarea value={form.description} onChange={event => update("description", event.target.value)} maxLength={20000} placeholder="Resumo da unidade curricular neste ano letivo…" /></label>
        <label className={styles.checkboxField}><input type="checkbox" checked={form.attendanceRequired} onChange={event => update("attendanceRequired", event.target.checked)} /><span>Presença obrigatória</span></label>
        <label className={styles.field}><span>Limite de faltas</span><input value={form.absenceLimit} onChange={event => update("absenceLimit", event.target.value)} maxLength={160} placeholder="Ex.: máximo de 3 faltas" /></label>
        <label className={styles.field}><span>Política de presenças</span><textarea value={form.attendancePolicy} onChange={event => update("attendancePolicy", event.target.value)} maxLength={8000} placeholder="Indica como são contabilizadas as presenças…" /></label>
        <label className={styles.field}><span>Política de faltas</span><textarea value={form.absencePolicy} onChange={event => update("absencePolicy", event.target.value)} maxLength={8000} placeholder="Indica consequências, justificação e reposição…" /></label>
        <label className={`${styles.field} ${styles.wide}`}><span>Notas adicionais sobre presenças</span><textarea value={form.attendanceNotes} onChange={event => update("attendanceNotes", event.target.value)} maxLength={8000} /></label>
        <label className={styles.field}><span>Estado público</span><select value={form.status} onChange={event => update("status", event.target.value as FormState["status"])}><option value="a_validar">A validar</option><option value="verificado">Verificado</option></select></label>
      </AdminFormGrid>
    </AdminSection>

    <AdminSection icon={<ClipboardCheck />} eyebrow="Avaliação" title="Componentes de avaliação" actions={<button className="button button--secondary button--compact" type="button" onClick={addEvaluation}><Plus />Adicionar componente</button>}>
      {form.evaluations.length ? <div className={styles.rows}>{form.evaluations.map((item, index) => <div className={styles.row} key={`evaluation-${index}`}><label className={styles.field}><span>Componente</span><input value={item.title} onChange={event => updateArray("evaluations", index, { title: event.target.value })} maxLength={180} placeholder="Ex.: Avaliação contínua" /></label><label className={styles.field}><span>Peso (%)</span><input type="number" min="0" max="100" step="0.1" value={item.weight} onChange={event => updateArray("evaluations", index, { weight: event.target.value })} /></label><label className={styles.field}><span>Nota mínima</span><input type="number" min="0" max="20" step="0.1" value={item.minimumScore} onChange={event => updateArray("evaluations", index, { minimumScore: event.target.value })} /></label><div className={styles.rowActions}><button className="button button--ghost button--compact" type="button" onClick={() => removeArray("evaluations", index)} aria-label="Remover componente"><Trash2 /></button></div><label className={`${styles.field} ${styles.wide}`}><span>Detalhes</span><textarea value={item.details} onChange={event => updateArray("evaluations", index, { details: event.target.value })} maxLength={5000} /></label></div>)}</div> : <p className={styles.empty}>Ainda não existem componentes de avaliação.</p>}
    </AdminSection>

    <AdminSection icon={<CalendarClock />} eyebrow="Calendário académico" title="Frequências e exames" actions={<button className="button button--secondary button--compact" type="button" onClick={addExam}><Plus />Adicionar exame</button>}>
      {form.exams.length ? <div className={styles.rows}>{form.exams.map((item, index) => <div className={styles.row} key={`exam-${index}`}><label className={styles.field}><span>Designação</span><input value={item.title} onChange={event => updateArray("exams", index, { title: event.target.value })} maxLength={180} placeholder="Ex.: Exame de recurso" /></label><label className={styles.field}><span>Tipo</span><select value={item.examType} onChange={event => updateArray("exams", index, { examType: event.target.value })}><option value="frequencia">Frequência</option><option value="normal">Época normal</option><option value="recurso">Recurso</option><option value="especial">Época especial</option><option value="melhoria">Melhoria</option><option value="outro">Outro</option></select></label><label className={styles.field}><span>Evento do calendário</span><select value={item.calendarEventId} onChange={event => updateArray("exams", index, { calendarEventId: event.target.value })}><option value="">Sem evento associado</option>{eventOptions.map(event => <option value={event.id} key={event.id}>{event.title} · {date(event.startsAt)}</option>)}</select></label><div className={styles.rowActions}><button className="button button--ghost button--compact" type="button" onClick={() => removeArray("exams", index)} aria-label="Remover exame"><Trash2 /></button></div><label className={`${styles.field} ${styles.wide}`}><span>Notas</span><textarea value={item.notes} onChange={event => updateArray("exams", index, { notes: event.target.value })} maxLength={5000} /></label></div>)}</div> : <p className={styles.empty}>Ainda não existem frequências ou exames registados.</p>}
      <div className={styles.calendarHint}><span>Eventos disponíveis: {eventOptions.length}.</span><Link href="/calendario">Abrir calendário académico</Link></div>
    </AdminSection>

    <AdminSection icon={<FileText />} eyebrow="Fontes" title="Fontes e bibliografia" actions={<button className="button button--secondary button--compact" type="button" onClick={addSource}><Plus />Adicionar fonte</button>}>
      {form.sources.length ? <div className={styles.rows}>{form.sources.map((item, index) => <div className={styles.row} key={`source-${index}`}><label className={styles.field}><span>Título</span><input value={item.title} onChange={event => updateArray("sources", index, { title: event.target.value })} maxLength={180} placeholder="Ex.: Ficha da unidade curricular" /></label><label className={styles.field}><span>Tipo</span><select value={item.sourceType} onChange={event => updateArray("sources", index, { sourceType: event.target.value })}><option value="oficial">Oficial</option><option value="recomendada">Recomendada</option><option value="regulamento">Regulamento</option><option value="bibliografia">Bibliografia</option><option value="outro">Outra fonte</option></select></label><label className={styles.field}><span>Páginas</span><input value={item.pages} onChange={event => updateArray("sources", index, { pages: event.target.value })} maxLength={120} placeholder="Ex.: pp. 40–58" /></label><div className={styles.rowActions}><button className="button button--ghost button--compact" type="button" onClick={() => removeArray("sources", index)} aria-label="Remover fonte"><Trash2 /></button></div><label className={`${styles.field} ${styles.wide}`}><span>Referência bibliográfica</span><textarea value={item.citation} onChange={event => updateArray("sources", index, { citation: event.target.value })} maxLength={1000} /></label><label className={`${styles.field} ${styles.wide}`}><span>Ligação HTTPS (opcional)</span><input type="url" value={item.url} onChange={event => updateArray("sources", index, { url: event.target.value })} maxLength={1000} placeholder="https://…" /></label></div>)}</div> : <p className={styles.empty}>Ainda não existem fontes associadas.</p>}
    </AdminSection>

    <div className={styles.actions}><button className="button button--primary" type="button" onClick={() => void save()} disabled={saving || loading}>{saving ? <><LoaderCircle className="spin" />A guardar…</> : <><Save />Guardar informação académica</>}</button></div>
  </AdminPage></AppShell>;
}
