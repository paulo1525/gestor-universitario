"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type Action = { id: string | number; action: string; details: string | null; created_at: number; actor_name: string; class_id: number | null };
const labels: Record<string,string> = { class_submitted:"Turma submetida",class_reopened:"Turma reaberta",ticket_executed:"Pedido executado",student_preference_updated:"Preferências atualizadas",user_updated:"Utilizador alterado",settings_updated:"Configurações alteradas",class_ticket_updated:"Pedido decidido" };

export function AuditHistory(){
 const [actions,setActions]=useState<Action[]>([]),[error,setError]=useState("");
 useEffect(()=>{fetch("/api/admin/audit",{cache:"no-store"}).then(async response=>{const data=await response.json() as {actions?:Action[];error?:string};if(!response.ok)throw new Error(data.error);setActions(data.actions||[])}).catch(reason=>setError(reason instanceof Error?reason.message:"Não foi possível carregar o histórico."))},[]);
 return <AuthGuard><AppShell active="audit" breadcrumb="Histórico de ações"><section className="page-heading"><div><span className="eyebrow">Auditoria</span><h1>Histórico de ações</h1><p>Submissões, decisões e alterações administrativas ficam registadas.</p></div></section><section className="panel"><div className="panel__header"><div><h2>Ações recentes</h2><p>Até 200 registos, ordenados do mais recente para o mais antigo.</p></div></div>{error&&<p className="admin-notice">{error}</p>}<div className="ticket-admin-list">{actions.map(action=><article className="ticket-admin-card" key={`${action.class_id||"admin"}-${action.id}`}><header><span><History/>{labels[action.action]||action.action}</span><time>{new Date(action.created_at).toLocaleString("pt-PT")}</time></header><p>{action.class_id?`Turma ${action.class_id} · `:""}{action.actor_name}</p>{action.details&&<details><summary>Detalhes técnicos</summary><code>{action.details}</code></details>}</article>)}{!actions.length&&!error&&<p className="empty-state">Ainda não existem ações registadas.</p>}</div></section></AppShell></AuthGuard>;
}
