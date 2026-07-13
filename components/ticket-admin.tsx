/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CircleDot, Filter, GraduationCap, LoaderCircle, MessageSquareText, Search, Ticket, Trash2, UserRound, Wrench } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { FormLabel } from "@/components/form-label";
import { RichTextContent, RichTextEditor } from "@/components/rich-text-editor";
import { sanitizeRichTextHtml } from "@/lib/announcement-content";
import styles from "@/components/ticket-admin.module.css";

type Row = { id: string; class_id: number; request_type: string | null; description: string; status: string; response: string | null; student_name: string | null; student_number: string | null; created_by_name: string; created_at: number; execution_result: string | null };
type FilterValue = "pending" | "resolved" | "all";

const labels: Record<string, string> = { pending: "Pendente", approved: "Aprovado", rejected: "Recusado", executed: "Executado", execution_error: "Erro de execução" };
const types: Record<string, string> = { reopen: "Reabrir turma", add_student: "Adicionar estudante", remove_student: "Remover estudante", replace_student: "Substituir estudante", correct_student: "Corrigir dados", other: "Outro pedido" };
const filterOptions: Array<{ value: FilterValue; label: string }> = [
  { value: "pending", label: "Pendentes" },
  { value: "resolved", label: "Resolvidos" },
  { value: "all", label: "Todos" },
];

function isPending(status: string) { return ["pending", "approved"].includes(status); }
function isResolved(status: string) { return ["executed", "rejected", "execution_error"].includes(status); }
function statusStyle(status: string) {
  if (status === "pending") return styles.statusPending;
  if (status === "approved") return styles.statusApproved;
  if (status === "executed") return styles.statusExecuted;
  if (status === "execution_error") return styles.statusExecutionError;
  return styles.statusRejected;
}

export function TicketAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    const response = await fetch("/api/admin/class-tickets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, status: row.status, response: sanitizeRichTextHtml(row.response || "") }) });
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
    <section className="admin-heading"><div><span className="eyebrow">Centro de pedidos</span><h1>Gestão de tickets</h1><p>Vertente interna dos pedidos que exigem decisão ou alteração administrativa.</p></div></section>
    <section className={`panel ${styles.panel}`}>
      <header className={styles.panelHeader}>
        <div className={styles.heading}><span className={styles.headingIcon}><Ticket /></span><div><h2>Pedidos de alteração</h2><p>Analisa o pedido e abre apenas os detalhes necessários para decidir.</p></div></div>
        <div className={styles.controls}>
          <label className={styles.search}><Search /><span className="sr-only">Pesquisar tickets</span><input type="search" aria-label="Pesquisar tickets" placeholder="Turma, estudante, número ou conteúdo" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className={styles.filter}><Filter /><span className="sr-only">Filtrar por estado</span><select aria-label="Filtrar tickets por estado" value={filter} onChange={(event) => setFilter(event.target.value as FilterValue)}>{filterOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        </div>
      </header>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <div className={styles.summary} aria-live="polite"><span><strong>{visible.length}</strong> de {counts.all} tickets visíveis</span><span>{counts.pending} pendentes · {counts.resolved} resolvidos</span></div>
      <div className={styles.list}>{visible.map((row) => {
        const expanded = expandedId === row.id;
        const terminal = ["executed", "rejected"].includes(row.status);
        return <article key={row.id} className={`${styles.card} ${expanded ? styles.expanded : ""}`}>
          <header className={styles.cardHeader}>
            <div className={styles.cardIdentity}>
              <div className={styles.badges}><span className={styles.typeBadge}><Ticket />{types[row.request_type || "other"] || "Pedido de alteração"}</span><span className={`${styles.status} ${statusStyle(row.status)}`}>{labels[row.status] || row.status}</span></div>
              <h3>{row.student_name || `Pedido submetido por ${row.created_by_name}`}</h3>
              <div className={styles.cardMeta}>{row.student_number && <span><GraduationCap />{row.student_number}</span>}<span><UserRound />{row.created_by_name}</span><time>{new Date(row.created_at).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" })}</time></div>
            </div>
            <button className={styles.expand} type="button" aria-expanded={expanded} aria-controls={`ticket-${row.id}`} onClick={() => setExpandedId((current) => current === row.id ? null : row.id)}>{expanded ? "Ocultar detalhes" : "Analisar pedido"}<ChevronDown /></button>
          </header>
          {expanded && <div className={styles.details} id={`ticket-${row.id}`}>
            <div className={styles.request}>
              <section className={styles.requestBody}><span>Descrição do pedido</span><RichTextContent value={row.description} className={styles.requestText} /></section>
              <details className={styles.secondary}><summary><Wrench />Contexto administrativo e execução</summary><div className={styles.secondaryGrid}>
                <div><span>Turma</span><strong>Turma {row.class_id}</strong></div>
                <div><span>Submetido por</span><strong>{row.created_by_name}</strong></div>
                <div><span>Estudante visado</span><strong>{row.student_name || "Não indicado"}</strong></div>
                <div><span>Número</span><strong>{row.student_number || "Não indicado"}</strong></div>
                {row.execution_result && <div className={styles.execution}><span>Resultado da execução</span><p>{row.execution_result}</p></div>}
              </div></details>
            </div>
            <div className={styles.decision}>
              <label><FormLabel icon={CircleDot}>Estado da decisão</FormLabel><select value={row.status} disabled={terminal} onChange={(event) => update(row.id, { status: event.target.value })}><option value="pending">Pendente</option><option value="approved">Aprovar e executar</option><option value="rejected">Recusar</option>{["executed", "execution_error"].includes(row.status) && <option value={row.status}>{labels[row.status]}</option>}</select></label>
              <label><FormLabel icon={MessageSquareText}>Fundamentação</FormLabel><RichTextEditor value={row.response || ""} onChange={(response) => update(row.id, { response })} ariaLabel={`Fundamentação do ticket de ${row.student_name || row.created_by_name}`} placeholder="Regista a fundamentação da decisão…" maxLength={5000} minHeight="compact" disabled={terminal} onInvalidLink={() => setNotice("Indica uma ligação válida iniciada por https://.")} /></label>
              <footer className={styles.actions}><button className="button button--secondary button--danger" disabled={saving === row.id} onClick={() => void remove(row)}><Trash2 />Apagar</button><button className="button button--primary" disabled={saving === row.id || terminal} onClick={() => void save(row)}>{saving === row.id ? <LoaderCircle className="spin" /> : <Check />}Guardar decisão</button></footer>
            </div>
          </div>}
        </article>;
      })}{!visible.length && <div className={styles.empty}><Ticket size={30} /><strong>{query ? "Nenhum ticket corresponde à pesquisa." : filter === "pending" ? "Não há tickets pendentes." : "Não existem tickets neste filtro."}</strong><span>{query ? "Tenta pesquisar por outro termo." : "Os novos tickets aparecerão aqui quando forem submetidos."}</span></div>}</div>
    </section>
  </AppShell></AuthGuard>;
}
