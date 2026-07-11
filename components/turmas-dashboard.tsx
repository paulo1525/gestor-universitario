"use client";
import { useEffect,useMemo,useState } from "react";
import { useRouter } from "next/navigation";
import { Building2,CheckCircle2,ChevronRight,Search,Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-context";
import { StudentPreferencePanel } from "@/components/student-preference-panel";
import type { EstadoTurma,Turma } from "@/data/turmas";

type ApiClass={id:number;status:string;submitted_at:number|null;representative:string|null;students:number;stays:number;moves:number};
const labels:Record<string,EstadoTurma>={draft:"Em preenchimento",submitted:"Submetida",review:"Em revisão",reopened:"Reaberta",validated:"Validada",published:"Publicada"};
export function TurmasDashboard(){
 const router=useRouter(),{user}=useAuth(),[classes,setClasses]=useState<Turma[]>([]),[search,setSearch]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{void (async()=>{try{const response=await fetch("/api/classes",{cache:"no-store"});const d=await response.json() as {classes:ApiClass[]};setClasses(d.classes.map(c=>({id:c.id,nome:`Turma ${c.id}`,representante:c.representative||"Por atribuir",alunos:Number(c.students),ficam:Number(c.stays),mudam:Number(c.moves),estado:labels[c.status]||"Em preenchimento"})))}finally{setLoading(false)}})();},[]);
 const visible=useMemo(()=>classes.filter(c=>`${c.nome} ${c.representante}`.toLowerCase().includes(search.toLowerCase().trim())),[classes,search]);
 const total=classes.reduce((n,c)=>n+c.alunos,0),submitted=classes.filter(c=>c.estado!=="Em preenchimento"&&c.estado!=="Reaberta").length;
 const enteringPreferences=user?.role==="student"&&!user.classRepresentative&&!user.preview;
 return <AppShell active="overview"><section className="page-heading page-heading--simple"><div><span className="eyebrow">Ano letivo 2026/2027</span><h1>Turmas do 2.º ano</h1></div></section>
 {enteringPreferences&&<StudentPreferencePanel/>}
 {!enteringPreferences&&<section className="stats-grid"><article className="stat-card"><span className="stat-card__icon stat-card__icon--ink"><Users/></span><div><span>Alunos registados</span><strong>{total}</strong><small>nas {classes.length} turmas</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--blue"><Building2/></span><div><span>Turmas criadas</span><strong>{classes.length}</strong><small>todas disponíveis</small></div></article><article className="stat-card"><span className="stat-card__icon stat-card__icon--green"><CheckCircle2/></span><div><span>Submetidas</span><strong>{submitted}/{classes.length}</strong><small>listas entregues</small></div></article></section>}
 <section className="panel overview-panel"><div className="panel__header"><div><h2>Estado das turmas</h2><p>Os alunos podem consultar quem pretende ficar ou mudar.</p></div><label className="search-field"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar turma ou representante"/></label></div><div className="table-scroll"><table><thead><tr><th>Turma</th><th>Representante</th><th>Alunos</th><th>Preferências</th><th>Estado</th><th/></tr></thead><tbody>{visible.map(c=><tr className="class-row" tabIndex={0} key={c.id} onClick={()=>router.push(`/turmas/${c.id}`)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")router.push(`/turmas/${c.id}`)}}><td><strong>{c.nome}</strong></td><td>{c.representante}</td><td>{c.alunos}</td><td><div className="preference-counts preference-counts--inline"><span><i className="dot dot--green"/>{c.ficam} ficam</span><span><i className="dot dot--gold"/>{c.mudam} mudam</span></div></td><td><span className="status status--neutral">{c.estado}</span></td><td><ChevronRight size={18}/></td></tr>)}</tbody></table>{loading&&<div className="empty-state">A carregar as turmas…</div>}</div></section></AppShell>;
}
