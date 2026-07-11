"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type Action = { id: string | number; action: string; details: string | null; created_at: number; actor_name: string; class_id: number | null };
const labels: Record<string, string> = {
  class_submitted: "Turma submetida",
  class_reopened: "Turma reaberta",
  ticket_executed: "Pedido executado",
  student_preference_updated: "Preferências atualizadas",
  user_updated: "Utilizador alterado",
  settings_updated: "Configurações alteradas",
  class_ticket_updated: "Pedido decidido",
};

export function AuditHistory() {
  const [actions, setActions] = useState<Action[]>([]), [error, setError] = useState(""), [selected, setSelected] = useState<Action | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as { actions?: Action[]; error?: string };
        if (!response.ok) throw new Error(data.error);
        setActions(data.actions || []);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Não foi possível carregar o histórico."));
  }, []);

  return <AuthGuard><AppShell active="audit" breadcrumb="Histórico de ações">
    <section className="page-heading"><div><span className="eyebrow">Auditoria</span><h1>Histórico de ações</h1><p>Submissões, decisões e alterações administrativas ficam registadas.</p></div></section>
    <section className="panel audit-panel">
      <div className="panel__header"><div><h2>Ações recentes</h2><p>Até 200 registos, ordenados do mais recente para o mais antigo.</p></div></div>
      {error && <p className="admin-notice">{error}</p>}
      <div className="audit-list">
        {actions.map(action => <article className="audit-row" key={`${action.class_id || "admin"}-${action.id}`}>
          <div className="audit-row__action"><span className="audit-row__icon"><History size={17} /></span><div><strong>{labels[action.action] || action.action}</strong><small>{action.actor_name}</small></div></div>
          <div className="audit-row__context">{action.class_id ? `Turma ${action.class_id}` : "Administração"}</div>
          <time>{new Date(action.created_at).toLocaleString("pt-PT")}</time>
          <button className="button button--secondary audit-row__button" type="button" onClick={() => setSelected(action)}>Ver log</button>
        </article>)}
        {!actions.length && !error && <p className="empty-state">Ainda não existem ações registadas.</p>}
      </div>
    </section>
    {selected && <div className="audit-modal-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title" onClick={event => event.stopPropagation()}>
      <header><div><span className="eyebrow">Registo de auditoria</span><h2 id="audit-modal-title">{labels[selected.action] || selected.action}</h2></div><button type="button" aria-label="Fechar log" onClick={() => setSelected(null)}><X size={18} /></button></header>
      <dl><div><dt>Utilizador</dt><dd>{selected.actor_name}</dd></div><div><dt>Contexto</dt><dd>{selected.class_id ? `Turma ${selected.class_id}` : "Administração"}</dd></div><div><dt>Data</dt><dd>{new Date(selected.created_at).toLocaleString("pt-PT")}</dd></div></dl>
      <h3>Detalhes técnicos</h3><pre>{selected.details || "Este registo não contém detalhes técnicos."}</pre>
    </section></div>}
  </AppShell></AuthGuard>;
}
