/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, CheckCircle2, Clock3, Filter, LoaderCircle, Search, Ticket, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type Row = { id: string; class_id: number; request_type: string | null; description: string; status: string; response: string | null; student_name: string | null; student_number: string | null; created_by_name: string; created_at: number; execution_result: string | null };
type FilterValue = "pending" | "resolved" | "all";

const labels: Record<string, string> = { pending: "Pendente", approved: "Aprovado", rejected: "Recusado", executed: "Executado", execution_error: "Erro de execução" };
const types: Record<string, string> = { reopen: "Reabrir turma", add_student: "Adicionar estudante", remove_student: "Remover estudante", replace_student: "Substituir estudante", correct_student: "Corrigir dados", other: "Outro pedido" };
const filterOptions: Array<{ value: FilterValue; label: string; hint: string }> = [
  { value: "pending", label: "Pendentes", hint: "Aguardam decisão" },
  { value: "resolved", label: "Resolvidos", hint: "Executados ou recusados" },
  { value: "all", label: "Todos", hint: "Mostrar todos os tickets" },
];

function isPending(status: string) { return ["pending", "approved"].includes(status); }
function isResolved(status: string) { return ["executed", "rejected", "execution_error"].includes(status); }
function statusClass(status: string) { return status.replaceAll("_", "-"); }

export function TicketAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

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
    executed: rows.filter((row) => row.status === "executed").length,
    rejected: rows.filter((row) => ["rejected", "execution_error"].includes(row.status)).length,
  }), [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-PT");
    return rows.filter((row) => {
      const matchesFilter = filter === "pending" ? isPending(row.status) : filter === "resolved" ? isResolved(row.status) : true;
      const searchable = `${row.class_id} ${row.request_type || ""} ${row.description} ${row.student_name || ""} ${row.student_number || ""} ${row.created_by_name}`.toLocaleLowerCase("pt-PT");
      return matchesFilter && (!needle || searchable.includes(needle));
    });
  }, [rows, filter, query]);

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));

  async function save(row: Row) {
    setSaving(row.id);
    const response = await fetch("/api/admin/class-tickets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, status: row.status, response: row.response }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? "Decisão guardada e executada quando aplicável." : result.error || "Não foi possível atualizar o ticket.");
    setSaving(null);
    if (response.ok) void load();
  }

  async function remove(row: Row) {
    if (!window.confirm("Apagar definitivamente este ticket? O evento ficará registado no histórico.")) return;
    setSaving(row.id);
    const response = await fetch("/api/admin/class-tickets", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id }) });
    const result = await response.json() as { error?: string };
    setNotice(response.ok ? "Ticket apagado." : result.error || "Não foi possível apagar o ticket.");
    setSaving(null);
    if (response.ok) void load();
  }

  return <AuthGuard requireAdmin><AppShell active="tickets" breadcrumb="Tickets">
    <section className="admin-heading"><div><span className="eyebrow">Gestão administrativa</span><h1>Tickets</h1><p>Pedidos de alteração com decisão, execução e histórico auditados.</p></div></section>
    <section className="ticket-stats" aria-label="Resumo dos tickets">
      <article><Clock3 /><div><strong>{counts.pending}</strong><span>Pendentes</span></div></article>
      <article><CheckCircle2 /><div><strong>{counts.resolved}</strong><span>Resolvidos</span></div></article>
      <article><Check /><div><strong>{counts.executed}</strong><span>Executados</span></div></article>
      <article><Ban /><div><strong>{counts.rejected}</strong><span>Recusados/erros</span></div></article>
    </section>
    <section className="panel admin-users ticket-admin-panel">
      <div className="panel__header"><div className="admin-card-heading"><span className="admin-settings__icon"><Ticket /></span><div><span className="eyebrow">Pedidos de alteração</span><h2>Tickets</h2><p>{visible.length} de {counts.all} tickets visíveis</p></div></div><label className="search-field ticket-search"><Search size={16} /><span className="sr-only">Pesquisar tickets</span><input aria-label="Pesquisar tickets" placeholder="Pesquisar turma, estudante ou número" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className="ticket-filter-bar"><div className="ticket-filter-title"><Filter size={16} /><span>Filtrar por estado</span></div><div className="ticket-filter-options" role="group" aria-label="Estado dos tickets">{filterOptions.map((option) => <button key={option.value} type="button" className={filter === option.value ? "is-active" : ""} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}><span><strong>{option.label}</strong><small>{option.hint}</small></span><b>{option.value === "pending" ? counts.pending : option.value === "resolved" ? counts.resolved : counts.all}</b></button>)}</div></div>
      <div className="ticket-admin-list">{visible.map((row) => <article key={row.id} className="ticket-admin-card">
        <header className="ticket-card-header"><div className="ticket-card-heading"><span className="ticket-class-badge"><Ticket size={14} />Turma {row.class_id}</span><span className={`ticket-status ticket-status--${statusClass(row.status)}`}>{labels[row.status] || row.status}</span></div><time>{new Date(row.created_at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</time></header>
        <div className="ticket-card-summary"><h3>{types[row.request_type || "other"] || "Pedido de alteração"}</h3><small>{row.student_name ? `${row.student_name} · ${row.student_number || "Sem número"}` : `Criado por ${row.created_by_name}`}</small></div>
        <div className="ticket-card-content"><div className="ticket-description"><span>Descrição do pedido</span><p>{row.description}</p></div>{row.execution_result && <div className="ticket-execution"><span>Resultado da execução</span><p>{row.execution_result}</p></div>}</div>
        <div className="ticket-decision-fields"><label>Estado da decisão<select value={row.status} disabled={["executed", "rejected"].includes(row.status)} onChange={(event) => update(row.id, { status: event.target.value })}><option value="pending">Pendente</option><option value="approved">Aprovar e executar</option><option value="rejected">Recusar</option>{["executed", "execution_error"].includes(row.status) && <option value={row.status}>{labels[row.status]}</option>}</select></label><label>Fundamentação<textarea value={row.response || ""} placeholder="Regista a fundamentação da decisão…" onChange={(event) => update(row.id, { response: event.target.value })} /></label></div>
        <footer className="ticket-card-actions"><button className="button button--secondary button--danger" disabled={saving === row.id} onClick={() => void remove(row)}><Trash2 />Apagar ticket</button><button className="button button--primary" disabled={saving === row.id || ["executed", "rejected"].includes(row.status)} onClick={() => void save(row)}>{saving === row.id ? <LoaderCircle className="spin" /> : <Check />}Guardar decisão</button></footer>
      </article>)}{!visible.length && <div className="ticket-empty"><Ticket size={30} /><strong>{query ? "Nenhum ticket corresponde à pesquisa." : filter === "pending" ? "Não há tickets pendentes." : "Não existem tickets neste filtro."}</strong><span>{query ? "Tenta pesquisar por outra turma, estudante ou número." : "Os tickets novos aparecerão aqui quando forem submetidos."}</span></div>}</div>
    </section>
  </AppShell></AuthGuard>;
}
