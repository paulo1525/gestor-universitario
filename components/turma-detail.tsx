"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Plus, RotateCcw, Save, Search, Send, Trash2, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import type { Turma } from "@/data/turmas";

type Student = { id: string; nome: string; numero: string; preferencia: string; isSelf: boolean };
type Detail = { class: { id: number; status: string; submittedAt: number | null; workflowStep: number; draftRevision: number }; students: Student[]; settings: { openAt: string; closeAt: string }; serverNow: number; permissions: { edit: boolean; manage: boolean; representative: boolean } };
type Row = { id: string; fullName: string; studentNumber: string };
const blank = (): Row => ({ id: crypto.randomUUID(), fullName: "", studentNumber: "" });
const steps = ["Preenchimento", "Verificação", "Revisão e submissão"];
const requestTypes = { reopen: "Reabrir a turma para edição", add_student: "Adicionar um estudante", remove_student: "Remover um estudante", replace_student: "Substituir um estudante", correct_student: "Corrigir dados de um estudante", other: "Outro pedido" };

export function TurmaDetail({ turma }: { turma: Turma; alunosIniciais: unknown[] }) {
  const { user } = useAuth();
  const readOnlyStudent = user?.role === "student" && !user.classRepresentative && !user.preview;
  const [data, setData] = useState<Detail | null>(null);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestType, setRequestType] = useState("reopen");
  const [description, setDescription] = useState("");
  const [ticketStudentId, setTicketStudentId] = useState("");
  const [ticketName, setTicketName] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const revision = useRef(0);
  const loaded = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const lastPayload = useRef("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/classes/${turma.id}`, { cache: "no-store" });
    const next = await response.json() as Detail & { error?: string };
    if (!response.ok) { setNotice(next.error || "Não foi possível carregar a turma."); return; }
    setData(next);
    setStep(next.class.workflowStep || 1);
    revision.current = next.class.draftRevision || 0;
    const restored = next.students.map((student) => ({ id: student.id, fullName: student.nome, studentNumber: student.numero }));
    const initial = restored.length ? restored : [blank()];
    setRows(initial);
    setTimeout(() => { loaded.current = true; lastPayload.current = JSON.stringify({ students: initial, workflowStep: next.class.workflowStep || 1 }); }, 0);
  }, [turma.id]);

  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const save = useCallback(async (nextRows: Row[], nextStep: number, force = false) => {
    if (!data?.permissions.edit) return true;
    const key = JSON.stringify({ students: nextRows, workflowStep: nextStep });
    if (!force && key === lastPayload.current) return true;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSaveState("saving");
    const nextRevision = Math.max(Date.now(), revision.current + 1);
    try {
      const response = await fetch(`/api/classes/${turma.id}/draft`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ students: nextRows, workflowStep: nextStep, revision: nextRevision }), signal: controller.signal });
      const result = await response.json() as { error?: string; revision?: number };
      if (!response.ok) throw new Error(result.error);
      revision.current = result.revision || nextRevision;
      lastPayload.current = key;
      setSaveState("saved");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      setSaveState("error");
      setNotice(error instanceof Error ? error.message : "Não foi possível guardar.");
      return false;
    }
  }, [data?.permissions.edit, turma.id]);

  useEffect(() => {
    if (!loaded.current || !data?.permissions.edit) return;
    const timer = window.setTimeout(() => void save(rows, step), 900);
    return () => window.clearTimeout(timer);
  }, [rows, step, save, data?.permissions.edit]);

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  async function go(next: number) { if (await save(rows, next, true)) { setStep(next); window.scrollTo({ top: 0, behavior: "smooth" }); } }
  async function submit() { setSubmitting(true); if (await save(rows, 3, true)) { const response = await fetch(`/api/classes/${turma.id}/submit`, { method: "POST" }); const result = await response.json() as { error?: string }; setNotice(response.ok ? "Turma submetida com sucesso." : result.error || "Não foi possível submeter."); if (response.ok) { setConfirming(false); await load(); } } setSubmitting(false); }
  async function ticket() { const payload = { studentId: ticketStudentId || undefined, fullName: ticketName || undefined, studentNumber: ticketNumber || undefined }; const response = await fetch(`/api/classes/${turma.id}/tickets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestType, description, payload }) }); const result = await response.json() as { error?: string }; setNotice(response.ok ? "Pedido enviado ao Núcleo de Gestão." : result.error || "Não foi possível enviar."); if (response.ok) { setDescription(""); setTicketStudentId(""); setTicketName(""); setTicketNumber(""); } }
  async function reopenSubmission() { if (!window.confirm("Reverter a submissão e reabrir esta turma para edição? A ação ficará registada no histórico.")) return; const response = await fetch(`/api/classes/${turma.id}/reopen`, { method: "POST" }); const result = await response.json() as { error?: string }; setNotice(response.ok ? "Submissão revertida. A turma voltou a edição." : result.error || "Não foi possível reverter a submissão."); if (response.ok) await load(); }

  if (!data) return <AppShell active="turmas" breadcrumb={turma.nome}><p className="empty-state">A carregar turma…</p></AppShell>;
  const submitted = !["draft", "reopened"].includes(data.class.status);
  const needle = query.trim().toLocaleLowerCase("pt-PT");
  const visibleRows = needle ? rows.filter((row) => `${row.fullName} ${row.studentNumber}`.toLocaleLowerCase("pt-PT").includes(needle)) : rows;
  const preferenceBadge = (value: string) => <span className={`preference-badge ${value === "Ficar" ? "is-stay" : value === "Mudar" ? "is-move" : "is-pending"}`}>{value}</span>;

  return <AppShell active="turmas" breadcrumb={turma.nome} currentClassId={turma.id}><Link className="back-link" href="/"><ArrowLeft />Voltar às turmas</Link><section className="detail-heading"><div><span className="eyebrow">2.º ano · 2026/2027</span><h1>{turma.nome}</h1><p>{rows.filter((row) => row.fullName || row.studentNumber).length} estudantes</p></div><span className="status status--neutral">{submitted ? "Submetida" : "Rascunho"}</span></section>{notice && <p className="admin-notice" role="status">{notice}</p>}
    {readOnlyStudent && <section className="panel submitted-roster"><div className="panel__header"><div><span className="eyebrow">Consulta da turma base</span><h2>Composição da turma</h2><p>A lista de estudantes está disponível para consulta. As decisões individuais sobre mudança de turma não são apresentadas.</p></div></div><div className="table-scroll roster-table roster-table--read"><table><thead><tr><th>Estudante</th><th>Número mecanográfico</th></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><strong>{student.nome}</strong>{student.isSelf && <small className="self-badge">Tu</small>}</td><td>{student.numero}</td></tr>)}</tbody></table>{!data.students.length && <p className="empty-state">Ainda não existem estudantes nesta turma.</p>}</div></section>}
    {data.permissions.edit && <><ol className="class-progress">{steps.map((name, index) => <li key={name} className={step === index + 1 ? "is-active" : step > index + 1 ? "is-complete" : ""}><button type="button" disabled><span>{step > index + 1 ? <Check /> : index + 1}</span>{name}</button></li>)}</ol><p className={`autosave autosave--${saveState}`} aria-live="polite">{saveState === "saving" ? "A guardar…" : saveState === "error" ? "Não foi possível guardar" : saveState === "saved" ? "Alterações guardadas" : "Rascunho guardado na base de dados"}</p></>}
    {data.permissions.edit && step === 1 && <section className="panel class-editor class-roster"><div className="panel__header"><div><span className="eyebrow">Composição</span><h2>Adicionar estudantes</h2><p>{rows.length} {rows.length === 1 ? "estudante no rascunho" : "estudantes no rascunho"}</p></div><div className="roster-tools"><label className="search-field roster-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome ou número" /></label><div className="student-add-actions"><button className="button button--secondary button--compact" onClick={() => setRows((current) => [...current, ...Array.from({ length: 5 }, blank)])}><UsersRound />Adicionar 5</button><button className="button button--secondary button--compact" onClick={() => setRows((current) => [...current, blank()])}><Plus />Adicionar</button></div></div></div><div className="table-scroll roster-table"><table><thead><tr><th>Estudante</th><th>Número mecanográfico</th><th>Decisão do estudante</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.id}><td><input aria-label={`Nome completo do estudante ${index + 1}`} placeholder="Nome completo" value={row.fullName} onChange={(event) => update(row.id, { fullName: event.target.value })} /></td><td><input aria-label={`Número mecanográfico do estudante ${index + 1}`} inputMode="numeric" maxLength={9} placeholder="202500000" value={row.studentNumber} onChange={(event) => update(row.id, { studentNumber: event.target.value.replace(/\D/g, "") })} /></td><td><span className="preference-badge is-pending">A aguardar decisão</span></td><td><button className="roster-delete" aria-label={`Remover estudante ${index + 1}`} onClick={() => setRows((current) => current.length === 1 ? [blank()] : current.filter((item) => item.id !== row.id))}><Trash2 /></button></td></tr>)}</tbody></table>{!visibleRows.length && <p className="empty-state">Nenhum estudante corresponde à pesquisa.</p>}</div><footer className="batch-footer"><span /><button className="button button--primary button--compact" onClick={() => void go(step + 1)}><Save />Guardar e continuar<ArrowRight /></button></footer></section>}
    {data.permissions.edit && step === 2 && <section className="panel class-editor verification-list-panel class-roster"><div className="panel__header"><div><span className="eyebrow">Verificação</span><h2>Lista de estudantes</h2><p>Confirma os dados antes de avançar para a submissão.</p></div><label className="search-field roster-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome ou número" /></label></div><div className="table-scroll roster-table roster-table--read"><table><thead><tr><th>Estudante</th><th>Número mecanográfico</th><th>Decisão do estudante</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}><td><strong>{row.fullName || "Por preencher"}</strong></td><td>{row.studentNumber || "—"}</td><td><span className="preference-badge is-pending">A aguardar decisão</span></td></tr>)}</tbody></table>{!visibleRows.length && <p className="empty-state">Nenhum estudante corresponde à pesquisa.</p>}</div><footer className="batch-footer"><button className="button button--secondary button--compact" onClick={() => void go(1)}><ArrowLeft />Voltar para editar</button><button className="button button--primary button--compact" onClick={() => void go(3)}>Continuar<ArrowRight /></button></footer></section>}
    {data.permissions.edit && step === 3 && <section className="panel submission-panel"><div className="panel__header"><div><span className="eyebrow">Revisão final</span><h2>Submissão da turma</h2><p>Confirma a composição final antes de submeter.</p></div></div><div className="submission-warning" role="alert"><AlertTriangle /><div><strong>Esta ação bloqueia a edição direta da turma</strong><p>Depois da submissão, qualquer correção terá de ser pedida ao Núcleo de Gestão da CC. Confirma cuidadosamente todos os dados antes de continuar.</p></div></div><div className="table-scroll roster-table roster-table--read"><table><thead><tr><th>Estudante</th><th>Número mecanográfico</th><th>Decisão do estudante</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.fullName || "Por preencher"}</strong></td><td>{row.studentNumber || "—"}</td><td><span className="preference-badge is-pending">A aguardar decisão</span></td></tr>)}</tbody></table></div><footer className="batch-footer"><button className="button button--secondary button--compact" onClick={() => void go(2)}><ArrowLeft />Voltar e corrigir</button><button className="button button--primary button--compact" onClick={() => setConfirming(true)}><Send />Submeter turma</button></footer></section>}
    {submitted && <section className="panel submitted-roster"><div className="panel__header"><div><span className="eyebrow">Lista final enviada</span><h2>Composição submetida</h2><p>{data.students.length} {data.students.length === 1 ? "estudante" : "estudantes"} · a edição direta está bloqueada.</p></div>{data.permissions.manage && <button className="button button--secondary button--danger" onClick={() => void reopenSubmission()}><RotateCcw />Reverter submissão</button>}</div><div className="table-scroll roster-table roster-table--read"><table><thead><tr><th>Estudante</th><th>Número mecanográfico</th><th>Decisão do estudante</th></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><strong>{student.nome}</strong>{student.isSelf && <small className="self-badge">Tu</small>}</td><td>{student.numero}</td><td>{preferenceBadge(student.preferencia)}</td></tr>)}</tbody></table></div></section>}
    {submitted && data.permissions.representative && <section className="panel ticket-panel"><h2>Pedido de alteração</h2><p>Indica apenas os dados necessários. O Núcleo de Gestão decide e a execução fica registada.</p><label>Tipo<select value={requestType} onChange={(event) => setRequestType(event.target.value)}>{Object.entries(requestTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{["remove_student", "replace_student", "correct_student"].includes(requestType) && <label>Estudante afetado<select value={ticketStudentId} onChange={(event) => setTicketStudentId(event.target.value)}><option value="">Selecionar estudante</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.nome} · {student.numero}</option>)}</select></label>}{["add_student", "replace_student", "correct_student"].includes(requestType) && <div className="ticket-structured-fields"><label>{requestType === "correct_student" ? "Nome corrigido" : "Nome do novo estudante"}<input value={ticketName} onChange={(event) => setTicketName(event.target.value)} /></label><label>Número mecanográfico<input inputMode="numeric" maxLength={9} placeholder="202500000" value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value.replace(/\D/g, ""))} /></label></div>}{requestType === "reopen" && <p className="admin-notice">Ao aprovar, a turma volta a rascunho e poderá ser editada novamente.</p>}<label>Motivo<textarea minLength={10} value={description} onChange={(event) => setDescription(event.target.value)} /></label><button className="button button--primary" onClick={() => void ticket()}>Enviar pedido</button></section>}
    {confirming && <div className="modal-backdrop"><div className="confirm-dialog" role="dialog" aria-modal="true"><h2>Confirmar submissão</h2><p>Tem a certeza de que pretende submeter esta turma? Depois da submissão, a composição deixa de poder ser alterada diretamente pelo representante. Qualquer alteração posterior terá de ser solicitada à administração.</p><div><button className="button button--secondary" onClick={() => setConfirming(false)} disabled={submitting}>Cancelar</button><button className="button button--primary" onClick={() => void submit()} disabled={submitting}>Confirmar submissão</button></div></div></div>}
  </AppShell>;
}
